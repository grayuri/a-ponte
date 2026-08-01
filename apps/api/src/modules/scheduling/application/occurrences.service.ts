import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OccurrenceStatus, Prisma } from '@prisma/client';
import type { OccurrenceView } from '@a-ponte/contracts';
import type { AppEnv } from '../../../config/env.config';
import { DateOnly } from '../../../shared/domain/date-only';
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/domain/domain-error';
import { decimalToNumber } from '../../../shared/domain/weight-kg';
import { AuditService } from '../../../shared/infrastructure/audit.service';
import { OutboxService } from '../../../shared/infrastructure/outbox.service';
import { PrismaService } from '../../../shared/infrastructure/prisma.service';
import type { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { seesWholeNetwork } from '../../identity/domain/authenticated-user';

const occurrenceInclude = {
  store: { include: { chain: { select: { name: true } } } },
  institution: { select: { name: true } },
  coveringInstitution: { select: { name: true } },
  assignee: { select: { fullName: true } },
  commitment: { include: { harvestType: { select: { label: true } } } },
  harvests: { select: { id: true, weightKg: true } },
} satisfies Prisma.ScheduleOccurrenceInclude;

type OccurrenceRow = Prisma.ScheduleOccurrenceGetPayload<{ include: typeof occurrenceInclude }>;

@Injectable()
export class OccurrencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async list(
    actor: AuthenticatedUser,
    filters: {
      from: string;
      to: string;
      storeId?: string;
      institutionId?: string;
      assigneeUserId?: string;
      status?: OccurrenceStatus;
    },
  ): Promise<OccurrenceView[]> {
    const rows = await this.prisma.scheduleOccurrence.findMany({
      where: {
        date: {
          gte: DateOnly.parse(filters.from).toUtcDate(),
          lte: DateOnly.parse(filters.to).toUtcDate(),
        },
        ...this.scopeFor(actor, filters),
      },
      include: occurrenceInclude,
      orderBy: [{ date: 'asc' }, { expectedTime: 'asc' }, { store: { name: 'asc' } }],
    });

    return rows.map((row) => this.toView(row));
  }

  /** "Hoje é seu dia": a agenda do usuário logado. */
  async myDay(actor: AuthenticatedUser, date?: string): Promise<OccurrenceView[]> {
    const tz = this.config.get('APP_TIMEZONE', { infer: true });
    const target = date ? DateOnly.parse(date) : DateOnly.todayIn(tz);

    const rows = await this.prisma.scheduleOccurrence.findMany({
      where: {
        date: target.toUtcDate(),
        status: { notIn: ['CANCELADA'] },
        OR: [
          { assigneeUserId: actor.id },
          { coveringUserId: actor.id },
          // Sem responsável nominal, a instituição inteira responde.
          ...(actor.institutionId
            ? [
                { institutionId: actor.institutionId, assigneeUserId: null },
                { coveringInstitutionId: actor.institutionId },
              ]
            : []),
        ],
      },
      include: occurrenceInclude,
      orderBy: [{ expectedTime: 'asc' }],
    });

    return rows.map((row) => this.toView(row));
  }

  async get(actor: AuthenticatedUser, id: string): Promise<OccurrenceView> {
    const row = await this.prisma.scheduleOccurrence.findUnique({
      where: { id },
      include: occurrenceInclude,
    });
    if (!row) throw new NotFoundError('Ocorrência da escala', id);
    this.assertCanSee(actor, row);
    return this.toView(row);
  }

  /**
   * "Não vou poder ir hoje." Tira a ocorrência da cobrança e registra o motivo —
   * a distinção que a planilha não fazia entre esquecer e avisar.
   */
  async excuse(actor: AuthenticatedUser, id: string, reason: string): Promise<OccurrenceView> {
    const occurrence = await this.loadForWrite(actor, id);

    if (occurrence.status === 'CUMPRIDA') {
      throw new BusinessRuleError('Esta colheita já foi registrada — não há o que justificar.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.scheduleOccurrence.update({
        where: { id },
        data: { status: 'JUSTIFICADA', statusReason: reason },
        include: occurrenceInclude,
      });

      // Cancela cobranças já enfileiradas para esta ocorrência.
      await tx.notification.updateMany({
        where: { occurrenceId: id, status: 'NA_FILA', kind: 'COBRANCA_PENDENCIA' },
        data: { status: 'CANCELADA' },
      });

      await this.outbox.publishIn(tx, {
        aggregate: 'ScheduleOccurrence',
        aggregateId: id,
        eventName: 'ocorrencia.justificada',
        payload: {
          occurrenceId: id,
          date: result.date.toISOString().slice(0, 10),
          storeId: result.storeId,
          institutionId: result.institutionId,
          reason,
        },
      });

      return result;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'OCORRENCIA_JUSTIFICADA',
      entity: 'ScheduleOccurrence',
      entityId: id,
      before: { status: occurrence.status },
      after: { status: 'JUSTIFICADA', reason },
    });

    return this.toView(updated);
  }

  /**
   * Cobertura: outra instituição assume a colheita do dia.
   *
   * É o terceiro fluxo que o Geraldo descreveu como totalmente manual —
   * "a instituição A não pode ir, quem vai? Você vai pra mais próxima".
   * Aqui vira estado, e o pedido sai como evento para o módulo de notificações.
   */
  async reassign(
    actor: AuthenticatedUser,
    id: string,
    input: { coveringInstitutionId: string; coveringUserId?: string | null; reason?: string | null },
  ): Promise<OccurrenceView> {
    const occurrence = await this.loadForWrite(actor, id);

    if (occurrence.status === 'CUMPRIDA') {
      throw new BusinessRuleError('Esta colheita já foi registrada — não há o que remanejar.');
    }

    if (input.coveringInstitutionId === occurrence.institutionId) {
      throw new BusinessRuleError(
        'A instituição de cobertura é a mesma já escalada. Escolha outra instituição.',
      );
    }

    const covering = await this.prisma.institution.findUnique({
      where: { id: input.coveringInstitutionId },
      select: { id: true, name: true, active: true },
    });
    if (!covering) throw new NotFoundError('Instituição', input.coveringInstitutionId);
    if (!covering.active) {
      throw new BusinessRuleError('A instituição escolhida para cobrir está inativa.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.scheduleOccurrence.update({
        where: { id },
        data: {
          status: 'REMANEJADA',
          coveringInstitutionId: covering.id,
          coveringUserId: input.coveringUserId ?? null,
          statusReason: input.reason ?? null,
        },
        include: occurrenceInclude,
      });

      await this.outbox.publishIn(tx, {
        aggregate: 'ScheduleOccurrence',
        aggregateId: id,
        eventName: 'ocorrencia.remanejada',
        payload: {
          occurrenceId: id,
          date: result.date.toISOString().slice(0, 10),
          storeId: result.storeId,
          fromInstitutionId: result.institutionId,
          toInstitutionId: covering.id,
          coveringUserId: input.coveringUserId ?? null,
        },
      });

      return result;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'OCORRENCIA_REMANEJADA',
      entity: 'ScheduleOccurrence',
      entityId: id,
      before: { institutionId: occurrence.institutionId },
      after: { coveringInstitutionId: covering.id, reason: input.reason },
    });

    return this.toView(updated);
  }

  async cancel(actor: AuthenticatedUser, id: string, reason: string): Promise<OccurrenceView> {
    if (!seesWholeNetwork(actor)) {
      throw new ForbiddenError('Apenas a coordenação pode cancelar uma colheita da escala.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.scheduleOccurrence.update({
        where: { id },
        data: { status: 'CANCELADA', statusReason: reason },
        include: occurrenceInclude,
      });

      await tx.notification.updateMany({
        where: { occurrenceId: id, status: 'NA_FILA' },
        data: { status: 'CANCELADA' },
      });

      return result;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'OCORRENCIA_CANCELADA',
      entity: 'ScheduleOccurrence',
      entityId: id,
      after: { reason },
    });

    return this.toView(updated);
  }

  /**
   * Instituições candidatas a cobrir uma colheita, ordenadas por quem tem
   * menos compromissos naquele dia — proxy honesto de disponibilidade
   * enquanto não houver geolocalização no cadastro.
   */
  async coverageCandidates(actor: AuthenticatedUser, id: string) {
    const occurrence = await this.loadForWrite(actor, id);

    const sameDayLoad = await this.prisma.scheduleOccurrence.groupBy({
      by: ['institutionId'],
      where: { date: occurrence.date, status: { in: ['PLANEJADA', 'PENDENTE'] } },
      _count: { _all: true },
    });

    const loadByInstitution = new Map(sameDayLoad.map((r) => [r.institutionId, r._count._all]));

    const institutions = await this.prisma.institution.findMany({
      where: { active: true, id: { not: occurrence.institutionId } },
      select: { id: true, name: true, city: true, phone: true },
    });

    return institutions
      .map((inst) => ({
        ...inst,
        commitmentsOnDate: loadByInstitution.get(inst.id) ?? 0,
        sameCity: Boolean(occurrence.store.city && inst.city === occurrence.store.city),
      }))
      .sort((a, b) => {
        if (a.sameCity !== b.sameCity) return a.sameCity ? -1 : 1;
        if (a.commitmentsOnDate !== b.commitmentsOnDate) {
          return a.commitmentsOnDate - b.commitmentsOnDate;
        }
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }

  // -------------------------------------------------------------- helpers

  private async loadForWrite(actor: AuthenticatedUser, id: string): Promise<OccurrenceRow> {
    const row = await this.prisma.scheduleOccurrence.findUnique({
      where: { id },
      include: occurrenceInclude,
    });
    if (!row) throw new NotFoundError('Ocorrência da escala', id);
    this.assertCanSee(actor, row);
    return row;
  }

  private assertCanSee(actor: AuthenticatedUser, row: OccurrenceRow): void {
    if (seesWholeNetwork(actor)) return;

    const mine =
      row.assigneeUserId === actor.id ||
      row.coveringUserId === actor.id ||
      (actor.institutionId !== null &&
        (row.institutionId === actor.institutionId ||
          row.coveringInstitutionId === actor.institutionId));

    if (!mine) {
      throw new ForbiddenError('Esta colheita não pertence à sua instituição.');
    }
  }

  private scopeFor(
    actor: AuthenticatedUser,
    filters: {
      storeId?: string;
      institutionId?: string;
      assigneeUserId?: string;
      status?: OccurrenceStatus;
    },
  ): Prisma.ScheduleOccurrenceWhereInput {
    const where: Prisma.ScheduleOccurrenceWhereInput = {
      ...(filters.storeId ? { storeId: filters.storeId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.assigneeUserId ? { assigneeUserId: filters.assigneeUserId } : {}),
    };

    if (seesWholeNetwork(actor)) {
      if (filters.institutionId) where.institutionId = filters.institutionId;
      return where;
    }

    // Fora da coordenação, o recorte é sempre a própria instituição —
    // independente do que vier no filtro da query.
    const scope = actor.institutionId ?? '00000000-0000-0000-0000-000000000000';
    where.OR = [{ institutionId: scope }, { coveringInstitutionId: scope }];
    return where;
  }

  private toView(row: OccurrenceRow): OccurrenceView {
    const harvest = row.harvests[0] ?? null;

    return {
      id: row.id,
      commitmentId: row.commitmentId,
      date: row.date.toISOString().slice(0, 10),
      expectedTime: row.expectedTime,
      timeLabel: row.timeLabel,
      storeId: row.storeId,
      storeName: row.store.shiftLabel
        ? `${row.store.name} (${row.store.shiftLabel})`
        : row.store.name,
      chainName: row.store.chain.name,
      institutionId: row.institutionId,
      institutionName: row.institution.name,
      coveringInstitutionId: row.coveringInstitutionId,
      coveringInstitutionName: row.coveringInstitution?.name ?? null,
      assigneeUserId: row.assigneeUserId,
      assigneeName: row.assignee?.fullName ?? null,
      harvestTypeLabel: row.commitment.harvestType?.label ?? null,
      status: row.status,
      statusReason: row.statusReason,
      harvestId: harvest?.id ?? null,
      weightKg: harvest ? decimalToNumber(harvest.weightKg) : null,
    };
  }
}
