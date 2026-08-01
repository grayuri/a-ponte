import { Injectable } from '@nestjs/common';
import { CommitmentStatus, Prisma } from '@prisma/client';
import { WEEKDAY_LABELS, type CommitmentView, type CreateCommitmentInput } from '@a-ponte/contracts';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../../shared/domain/domain-error';
import { DateOnly } from '../../../shared/domain/date-only';
import { AuditService } from '../../../shared/infrastructure/audit.service';
import { PrismaService } from '../../../shared/infrastructure/prisma.service';
import type { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { seesWholeNetwork } from '../../identity/domain/authenticated-user';
import { OccurrenceMaterializerService } from './occurrence-materializer.service';

const commitmentInclude = {
  store: { include: { chain: { select: { name: true } } } },
  institution: { select: { name: true } },
  assignee: { select: { fullName: true } },
  harvestType: { select: { label: true } },
} satisfies Prisma.ScheduleCommitmentInclude;

type CommitmentRow = Prisma.ScheduleCommitmentGetPayload<{ include: typeof commitmentInclude }>;

/**
 * Escala — a regra recorrente: "toda quinta, 15h30, São Luiz Abolição,
 * Casa de Abraão, com a Karen".
 */
@Injectable()
export class SchedulingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly materializer: OccurrenceMaterializerService,
    private readonly audit: AuditService,
  ) {}

  async list(filters: {
    weekday?: number;
    storeId?: string;
    institutionId?: string;
    includeInactive?: boolean;
  }): Promise<CommitmentView[]> {
    const rows = await this.prisma.scheduleCommitment.findMany({
      where: {
        ...(filters.weekday !== undefined ? { weekday: filters.weekday } : {}),
        ...(filters.storeId ? { storeId: filters.storeId } : {}),
        ...(filters.institutionId ? { institutionId: filters.institutionId } : {}),
        ...(filters.includeInactive ? {} : { status: 'ATIVO' }),
      },
      include: commitmentInclude,
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }, { store: { name: 'asc' } }],
    });

    return rows.map((row) => this.toView(row));
  }

  async get(id: string): Promise<CommitmentView> {
    const row = await this.prisma.scheduleCommitment.findUnique({
      where: { id },
      include: commitmentInclude,
    });
    if (!row) throw new NotFoundError('Compromisso da escala', id);
    return this.toView(row);
  }

  async create(actor: AuthenticatedUser, input: CreateCommitmentInput): Promise<CommitmentView> {
    await this.assertReferences(input);
    await this.assertNoOverlap(input);

    const created = await this.prisma.scheduleCommitment.create({
      data: this.toPersistence(input),
      include: commitmentInclude,
    });

    await this.materializer.resyncFutureOccurrences(created.id);
    await this.audit.record({
      actorId: actor.id,
      action: 'ESCALA_COMPROMISSO_CRIADO',
      entity: 'ScheduleCommitment',
      entityId: created.id,
      after: {
        weekday: created.weekday,
        startTime: created.startTime,
        storeId: created.storeId,
        institutionId: created.institutionId,
      },
    });

    return this.toView(created);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: Partial<CreateCommitmentInput>,
  ): Promise<CommitmentView> {
    const before = await this.prisma.scheduleCommitment.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Compromisso da escala', id);

    await this.assertReferences(input);

    if (input.storeId || input.weekday !== undefined || input.startTime) {
      await this.assertNoOverlap(
        {
          storeId: input.storeId ?? before.storeId,
          weekday: input.weekday ?? before.weekday,
          startTime: input.startTime ?? before.startTime,
        },
        id,
      );
    }

    const updated = await this.prisma.scheduleCommitment.update({
      where: { id },
      data: {
        storeId: input.storeId,
        institutionId: input.institutionId,
        assigneeUserId: input.assigneeUserId === undefined ? undefined : input.assigneeUserId,
        harvestTypeId: input.harvestTypeId === undefined ? undefined : input.harvestTypeId,
        weekday: input.weekday,
        startTime: input.startTime,
        timeLabel: input.timeLabel === undefined ? undefined : input.timeLabel,
        status: input.status as CommitmentStatus | undefined,
        statusNote: input.statusNote === undefined ? undefined : input.statusNote,
        validFrom: input.validFrom === undefined ? undefined : this.toDate(input.validFrom),
        validTo: input.validTo === undefined ? undefined : this.toDate(input.validTo),
      },
      include: commitmentInclude,
    });

    await this.materializer.resyncFutureOccurrences(id);
    await this.audit.record({
      actorId: actor.id,
      action: 'ESCALA_COMPROMISSO_ATUALIZADO',
      entity: 'ScheduleCommitment',
      entityId: id,
      before: { weekday: before.weekday, startTime: before.startTime, status: before.status },
      after: { weekday: updated.weekday, startTime: updated.startTime, status: updated.status },
    });

    return this.toView(updated);
  }

  /**
   * Encerrar em vez de apagar: as ocorrências passadas continuam sendo o
   * histórico de cumprimento daquela loja.
   */
  async close(actor: AuthenticatedUser, id: string, note?: string): Promise<void> {
    const exists = await this.prisma.scheduleCommitment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundError('Compromisso da escala', id);

    await this.prisma.$transaction(async (tx) => {
      await tx.scheduleCommitment.update({
        where: { id },
        data: { status: 'ENCERRADO', statusNote: note ?? null },
      });

      // Futuro planejado e sem colheita some; passado permanece.
      await tx.scheduleOccurrence.deleteMany({
        where: {
          commitmentId: id,
          date: { gte: new Date() },
          status: 'PLANEJADA',
          harvests: { none: {} },
        },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'ESCALA_COMPROMISSO_ENCERRADO',
      entity: 'ScheduleCommitment',
      entityId: id,
      after: { note },
    });
  }

  /** Escala da semana agrupada por dia — a visão que hoje é copiada no grupo. */
  async weeklyBoard(actor: AuthenticatedUser) {
    const rows = await this.list({
      includeInactive: false,
      institutionId: seesWholeNetwork(actor) ? undefined : (actor.institutionId ?? undefined),
    });

    return Object.entries(WEEKDAY_LABELS).map(([weekday, label]) => ({
      weekday: Number(weekday),
      weekdayLabel: label,
      commitments: rows.filter((r) => r.weekday === Number(weekday)),
    }));
  }

  // -------------------------------------------------------------- helpers

  private toPersistence(input: CreateCommitmentInput): Prisma.ScheduleCommitmentUncheckedCreateInput {
    return {
      storeId: input.storeId,
      institutionId: input.institutionId,
      assigneeUserId: input.assigneeUserId ?? null,
      harvestTypeId: input.harvestTypeId ?? null,
      weekday: input.weekday,
      startTime: input.startTime,
      timeLabel: input.timeLabel ?? null,
      status: input.status as CommitmentStatus,
      statusNote: input.statusNote ?? null,
      validFrom: this.toDate(input.validFrom),
      validTo: this.toDate(input.validTo),
    };
  }

  private toDate(value: string | null | undefined): Date | null {
    return value ? DateOnly.parse(value).toUtcDate() : null;
  }

  private async assertReferences(input: Partial<CreateCommitmentInput>): Promise<void> {
    if (input.storeId) {
      const store = await this.prisma.store.findUnique({
        where: { id: input.storeId },
        select: { active: true },
      });
      if (!store) throw new NotFoundError('Loja', input.storeId);
      if (!store.active) throw new BusinessRuleError('Não é possível escalar uma loja inativa.');
    }

    if (input.institutionId) {
      const inst = await this.prisma.institution.findUnique({
        where: { id: input.institutionId },
        select: { active: true },
      });
      if (!inst) throw new NotFoundError('Instituição', input.institutionId);
      if (!inst.active) {
        throw new BusinessRuleError('Não é possível escalar uma instituição inativa.');
      }
    }

    if (input.assigneeUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: input.assigneeUserId },
        select: { status: true, institutionId: true },
      });
      if (!user) throw new NotFoundError('Responsável', input.assigneeUserId);
      if (user.status !== 'ATIVO') {
        throw new BusinessRuleError('O responsável escolhido está com a conta inativa.');
      }
      if (
        input.institutionId &&
        user.institutionId &&
        user.institutionId !== input.institutionId
      ) {
        throw new BusinessRuleError(
          'O responsável escolhido pertence a outra instituição. ' +
            'Escolha alguém da instituição escalada ou ajuste o vínculo dele.',
        );
      }
    }
  }

  /**
   * Duas instituições escaladas na mesma loja, no mesmo dia e horário é quase
   * sempre erro de digitação — e na planilha isso acontecia sem qualquer aviso,
   * gerando cobrança dupla depois.
   */
  private async assertNoOverlap(
    input: { storeId: string; weekday: number; startTime: string },
    ignoreId?: string,
  ): Promise<void> {
    const clash = await this.prisma.scheduleCommitment.findFirst({
      where: {
        storeId: input.storeId,
        weekday: input.weekday,
        startTime: input.startTime,
        status: 'ATIVO',
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      include: { institution: { select: { name: true } }, store: { select: { name: true } } },
    });

    if (clash) {
      throw new ConflictError(
        `Já existe compromisso em ${clash.store.name} nesta ${WEEKDAY_LABELS[input.weekday as 0]} ` +
          `às ${input.startTime}, com a instituição ${clash.institution.name}.`,
      );
    }
  }

  private toView(row: CommitmentRow): CommitmentView {
    return {
      id: row.id,
      storeId: row.storeId,
      storeName: row.store.shiftLabel
        ? `${row.store.name} (${row.store.shiftLabel})`
        : row.store.name,
      chainName: row.store.chain.name,
      institutionId: row.institutionId,
      institutionName: row.institution.name,
      assigneeUserId: row.assigneeUserId,
      assigneeName: row.assignee?.fullName ?? null,
      weekday: row.weekday,
      weekdayLabel: WEEKDAY_LABELS[row.weekday as 0] ?? String(row.weekday),
      startTime: row.startTime,
      timeLabel: row.timeLabel,
      harvestTypeId: row.harvestTypeId,
      harvestTypeLabel: row.harvestType?.label ?? null,
      status: row.status,
      statusNote: row.statusNote,
      validFrom: row.validFrom?.toISOString().slice(0, 10) ?? null,
      validTo: row.validTo?.toISOString().slice(0, 10) ?? null,
    };
  }
}
