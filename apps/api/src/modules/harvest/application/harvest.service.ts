import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type {
  CreateHarvestInput,
  HarvestView,
  Paginated,
} from '@a-ponte/contracts';
import type { AppEnv } from '../../../config/env.config';
import { DateOnly } from '../../../shared/domain/date-only';
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from '../../../shared/domain/domain-error';
import { WeightKg, decimalToNumber } from '../../../shared/domain/weight-kg';
import { AuditService } from '../../../shared/infrastructure/audit.service';
import { OutboxService } from '../../../shared/infrastructure/outbox.service';
import { PrismaService } from '../../../shared/infrastructure/prisma.service';
import type { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { seesWholeNetwork } from '../../identity/domain/authenticated-user';
import { SupabaseAdminService } from '../../identity/infrastructure/supabase-admin.service';

const harvestInclude = {
  store: { include: { chain: { select: { name: true } } } },
  institution: { select: { name: true } },
  harvestType: { select: { label: true } },
  collector: { select: { fullName: true } },
} satisfies Prisma.HarvestInclude;

type HarvestRow = Prisma.HarvestGetPayload<{ include: typeof harvestInclude }>;

/**
 * Harvest — o registro que hoje é o Google Forms.
 *
 * O ganho central sobre a planilha está aqui: registrar a colheita e dar baixa
 * na ocorrência da escala acontecem na MESMA transação. Na planilha isso era
 * uma fórmula COUNTIFS que casava loja + data por texto — e quando o nome da
 * loja divergia entre a escala e o formulário, o sistema achava que ninguém
 * tinha ido, mesmo com a colheita preenchida.
 */
@Injectable()
export class HarvestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly supabase: SupabaseAdminService,
  ) {}

  async create(actor: AuthenticatedUser, input: CreateHarvestInput): Promise<HarvestView> {
    const weight = WeightKg.of(input.weightKg);
    const harvestedOn = DateOnly.parse(input.harvestedOn);
    const today = DateOnly.todayIn(this.config.get('APP_TIMEZONE', { infer: true }));

    if (harvestedOn.isAfter(today)) {
      throw new BusinessRuleError('Não é possível registrar uma colheita com data futura.');
    }

    // 90 dias cobre folgadamente o preenchimento atrasado sem abrir espaço
    // para o erro de digitar o ano errado, que aparecia bastante na planilha.
    if (harvestedOn.isBefore(today.addDays(-90))) {
      throw new BusinessRuleError(
        'Esta data está a mais de 90 dias atrás. Peça à coordenação para lançar o registro.',
      );
    }

    const collectorUserId = this.resolveCollector(actor, input.collectorUserId ?? null);
    await this.assertReferences(input);

    const occurrence = input.occurrenceId
      ? await this.loadOccurrenceForBaixa(actor, input.occurrenceId, harvestedOn)
      : null;

    const created = await this.prisma.$transaction(async (tx) => {
      const harvest = await tx.harvest.create({
        data: {
          occurrenceId: occurrence?.id ?? null,
          storeId: input.storeId,
          institutionId: input.institutionId,
          harvestTypeId: input.harvestTypeId,
          harvestedOn: harvestedOn.toUtcDate(),
          harvestedAt: input.harvestedAt ?? null,
          weightKg: new Prisma.Decimal(weight.toString()),
          mainFoods: input.mainFoods ?? null,
          photoPath: input.photoPath ?? null,
          notes: input.notes ?? null,
          collectorUserId,
          registeredByUserId: actor.id,
          source: collectorUserId === actor.id ? 'APP' : 'LANCAMENTO_MANUAL',
        },
        include: harvestInclude,
      });

      if (occurrence) {
        await tx.scheduleOccurrence.update({
          where: { id: occurrence.id },
          data: { status: 'CUMPRIDA', statusReason: null },
        });

        // Cobrança na fila para esta ocorrência perde o sentido — cancela agora,
        // senão o colhedor que acabou de preencher recebe a cobrança minutos depois.
        await tx.notification.updateMany({
          where: {
            occurrenceId: occurrence.id,
            status: 'NA_FILA',
            kind: 'COBRANCA_PENDENCIA',
          },
          data: { status: 'CANCELADA' },
        });
      }

      await this.outbox.publishIn(tx, {
        aggregate: 'Harvest',
        aggregateId: harvest.id,
        eventName: 'colheita.registrada',
        payload: {
          harvestId: harvest.id,
          occurrenceId: occurrence?.id ?? null,
          storeId: harvest.storeId,
          institutionId: harvest.institutionId,
          weightKg: weight.toNumber(),
          harvestedOn: harvestedOn.toString(),
        },
      });

      return harvest;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'COLHEITA_REGISTRADA',
      entity: 'Harvest',
      entityId: created.id,
      after: {
        weightKg: weight.toNumber(),
        storeId: created.storeId,
        occurrenceId: created.occurrenceId,
      },
    });

    return this.toView(created);
  }

  async list(
    actor: AuthenticatedUser,
    query: {
      from?: string;
      to?: string;
      storeId?: string;
      institutionId?: string;
      collectorUserId?: string;
      harvestTypeId?: string;
      source?: string;
      withPhotos?: boolean;
      onlyWithPhoto?: boolean;
      page: number;
      pageSize: number;
    },
  ): Promise<Paginated<HarvestView>> {
    const where: Prisma.HarvestWhereInput = {
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.collectorUserId ? { collectorUserId: query.collectorUserId } : {}),
      ...(query.harvestTypeId ? { harvestTypeId: query.harvestTypeId } : {}),
      ...(query.source ? { source: query.source as never } : {}),
      ...(query.onlyWithPhoto ? { photoPath: { not: null } } : {}),
    };

    if (query.from || query.to) {
      where.harvestedOn = {
        ...(query.from ? { gte: DateOnly.parse(query.from).toUtcDate() } : {}),
        ...(query.to ? { lte: DateOnly.parse(query.to).toUtcDate() } : {}),
      };
    }

    if (seesWholeNetwork(actor)) {
      if (query.institutionId) where.institutionId = query.institutionId;
    } else if (actor.role === 'INSTITUICAO') {
      where.institutionId = actor.institutionId ?? '00000000-0000-0000-0000-000000000000';
    } else {
      where.collectorUserId = actor.id;
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.harvest.findMany({
        where,
        include: harvestInclude,
        orderBy: [{ harvestedOn: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.harvest.count({ where }),
    ]);

    // As fotos são a evidência de que a colheita aconteceu — o formulário
    // antigo já pedia foto com a identificação da instituição visível. Só
    // assina quando a tela pede, para não gastar ida ao Storage à toa.
    const urls = query.withPhotos
      ? await this.supabase.signedPhotoUrls(
          rows.map((r) => r.photoPath).filter((p): p is string => Boolean(p)),
        )
      : new Map<string, string>();

    return {
      items: rows.map((row) => {
        const view = this.toView(row);
        if (row.photoPath) view.photoUrl = urls.get(row.photoPath) ?? null;
        return view;
      }),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<HarvestView> {
    const row = await this.prisma.harvest.findUnique({ where: { id }, include: harvestInclude });
    if (!row) throw new NotFoundError('Colheita', id);
    this.assertCanSee(actor, row);

    const view = this.toView(row);
    if (row.photoPath) {
      view.photoUrl = await this.supabase.signedPhotoUrl(row.photoPath);
    }
    return view;
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: Partial<CreateHarvestInput>,
  ): Promise<HarvestView> {
    const before = await this.prisma.harvest.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Colheita', id);
    this.assertCanEdit(actor, before);

    const updated = await this.prisma.harvest.update({
      where: { id },
      data: {
        storeId: input.storeId,
        institutionId: input.institutionId,
        harvestTypeId: input.harvestTypeId,
        harvestedOn: input.harvestedOn ? DateOnly.parse(input.harvestedOn).toUtcDate() : undefined,
        harvestedAt: input.harvestedAt === undefined ? undefined : input.harvestedAt,
        weightKg:
          input.weightKg === undefined
            ? undefined
            : new Prisma.Decimal(WeightKg.of(input.weightKg).toString()),
        mainFoods: input.mainFoods === undefined ? undefined : input.mainFoods,
        photoPath: input.photoPath === undefined ? undefined : input.photoPath,
        notes: input.notes === undefined ? undefined : input.notes,
      },
      include: harvestInclude,
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'COLHEITA_ATUALIZADA',
      entity: 'Harvest',
      entityId: id,
      before: { weightKg: decimalToNumber(before.weightKg), storeId: before.storeId },
      after: { weightKg: decimalToNumber(updated.weightKg), storeId: updated.storeId },
    });

    return this.toView(updated);
  }

  /**
   * Apagar devolve a ocorrência para pendente. Sem isso, um lançamento errado
   * apagado deixaria a escala marcada como cumprida para sempre.
   */
  async remove(actor: AuthenticatedUser, id: string): Promise<void> {
    if (!seesWholeNetwork(actor)) {
      throw new ForbiddenError('Apenas a coordenação pode excluir um registro de colheita.');
    }

    const harvest = await this.prisma.harvest.findUnique({ where: { id } });
    if (!harvest) throw new NotFoundError('Colheita', id);

    await this.prisma.$transaction(async (tx) => {
      await tx.harvest.delete({ where: { id } });

      if (harvest.occurrenceId) {
        const remaining = await tx.harvest.count({
          where: { occurrenceId: harvest.occurrenceId },
        });
        if (remaining === 0) {
          await tx.scheduleOccurrence.update({
            where: { id: harvest.occurrenceId },
            data: { status: 'PENDENTE' },
          });
        }
      }
    });

    if (harvest.photoPath) await this.supabase.removePhoto(harvest.photoPath);

    await this.audit.record({
      actorId: actor.id,
      action: 'COLHEITA_EXCLUIDA',
      entity: 'Harvest',
      entityId: id,
      before: { weightKg: decimalToNumber(harvest.weightKg), storeId: harvest.storeId },
    });
  }

  // -------------------------------------------------------------- helpers

  /**
   * Colhedor registra por si. Coordenação pode lançar em nome de alguém —
   * é o que resolve o caso do voluntário que colheu e não tinha o celular.
   */
  private resolveCollector(actor: AuthenticatedUser, requested: string | null): string {
    if (!requested || requested === actor.id) return actor.id;

    if (!seesWholeNetwork(actor) && actor.role !== 'INSTITUICAO') {
      throw new ForbiddenError('Você só pode registrar colheitas em seu próprio nome.');
    }

    return requested;
  }

  private async assertReferences(input: CreateHarvestInput): Promise<void> {
    const [store, institution, type] = await Promise.all([
      this.prisma.store.findUnique({ where: { id: input.storeId }, select: { active: true } }),
      this.prisma.institution.findUnique({
        where: { id: input.institutionId },
        select: { active: true },
      }),
      this.prisma.harvestType.findUnique({
        where: { id: input.harvestTypeId },
        select: { active: true },
      }),
    ]);

    if (!store) throw new NotFoundError('Loja', input.storeId);
    if (!institution) throw new NotFoundError('Instituição', input.institutionId);
    if (!type) throw new NotFoundError('Tipo de colheita', input.harvestTypeId);
  }

  private async loadOccurrenceForBaixa(
    actor: AuthenticatedUser,
    occurrenceId: string,
    harvestedOn: DateOnly,
  ) {
    const occurrence = await this.prisma.scheduleOccurrence.findUnique({
      where: { id: occurrenceId },
      select: {
        id: true,
        date: true,
        status: true,
        institutionId: true,
        coveringInstitutionId: true,
        assigneeUserId: true,
        coveringUserId: true,
      },
    });

    if (!occurrence) throw new NotFoundError('Ocorrência da escala', occurrenceId);

    if (occurrence.status === 'CANCELADA') {
      throw new BusinessRuleError('Esta colheita da escala foi cancelada pela coordenação.');
    }

    const occurrenceDate = DateOnly.fromJsDate(occurrence.date);
    if (!occurrenceDate.isSame(harvestedOn)) {
      throw new BusinessRuleError(
        `A data informada (${harvestedOn.toString()}) não é a da escala ` +
          `(${occurrenceDate.toString()}). Corrija a data ou registre sem vincular à escala.`,
      );
    }

    if (!seesWholeNetwork(actor)) {
      const mine =
        occurrence.assigneeUserId === actor.id ||
        occurrence.coveringUserId === actor.id ||
        (actor.institutionId !== null &&
          (occurrence.institutionId === actor.institutionId ||
            occurrence.coveringInstitutionId === actor.institutionId));

      if (!mine) {
        throw new ForbiddenError('Esta colheita da escala não pertence à sua instituição.');
      }
    }

    return occurrence;
  }

  private assertCanSee(actor: AuthenticatedUser, row: { collectorUserId: string | null; institutionId: string }): void {
    if (seesWholeNetwork(actor)) return;
    if (actor.role === 'INSTITUICAO' && row.institutionId === actor.institutionId) return;
    if (row.collectorUserId === actor.id) return;
    throw new ForbiddenError('Este registro não pertence a você.');
  }

  private assertCanEdit(
    actor: AuthenticatedUser,
    row: { collectorUserId: string | null; institutionId: string; createdAt: Date },
  ): void {
    if (seesWholeNetwork(actor)) return;

    const isOwner = row.collectorUserId === actor.id;
    const isInstitutionManager =
      actor.role === 'INSTITUICAO' && row.institutionId === actor.institutionId;

    if (!isOwner && !isInstitutionManager) {
      throw new ForbiddenError('Este registro não pertence a você.');
    }

    // Janela de correção: erro de digitação no peso é comum e precisa ser
    // consertável na hora, mas alterar número de mês fechado é da coordenação.
    const hoursSince = (Date.now() - row.createdAt.getTime()) / 36e5;
    if (isOwner && !isInstitutionManager && hoursSince > 48) {
      throw new BusinessRuleError(
        'A janela de correção deste registro expirou. Peça o ajuste à coordenação.',
      );
    }
  }

  private toView(row: HarvestRow): HarvestView {
    return {
      id: row.id,
      occurrenceId: row.occurrenceId,
      harvestedOn: row.harvestedOn.toISOString().slice(0, 10),
      harvestedAt: row.harvestedAt,
      storeId: row.storeId,
      storeName: row.store.shiftLabel
        ? `${row.store.name} (${row.store.shiftLabel})`
        : row.store.name,
      chainName: row.store.chain.name,
      institutionId: row.institutionId,
      institutionName: row.institution.name,
      harvestTypeId: row.harvestTypeId,
      harvestTypeLabel: row.harvestType.label,
      weightKg: decimalToNumber(row.weightKg),
      mainFoods: row.mainFoods,
      photoUrl: null,
      notes: row.notes,
      collectorUserId: row.collectorUserId,
      // Registro importado não tem usuário: cai no nome cru da planilha.
      collectorName: row.collector?.fullName ?? row.legacyCollectorName ?? 'Não identificado',
      source: row.source,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
