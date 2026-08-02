import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WEEKDAY_LABELS, type ComplianceWeekView, type ComplianceRowView } from '@a-ponte/contracts';
import type { AppEnv } from '../../../config/env.config';
import { DateOnly } from '../../../shared/domain/date-only';
import { decimalToNumber } from '../../../shared/domain/weight-kg';
import { PrismaService } from '../../../shared/infrastructure/prisma.service';
import type { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { seesWholeNetwork } from '../../identity/domain/authenticated-user';
import { NotificationsService } from '../../notifications/application/notifications.service';
import { SchedulePolicy } from '../../scheduling/domain/schedule-policy';

export interface SweepResult {
  date: string;
  markedPending: number;
  /** Colheitas do dia cujo horário ainda não chegou — não são atraso. */
  stillOnTime: number;
  alertsQueued: number;
  skippedWithoutPhone: number;
}

/**
 * Compliance — quem preencheu e quem faltou.
 *
 * Substitui a aba ALERTA PREENCHIMENTO, que fazia isso com COUNTIFS cruzando
 * loja + data por TEXTO. Três coisas mudam aqui e todas importam:
 *
 *   1. O casamento é por id de ocorrência, não por string de loja. "DEL PASSEO"
 *      x "DEL PASEO" deixa de ser uma pendência fantasma.
 *   2. Justificada e remanejada saem da cobrança. A planilha tratava "avisou
 *      que não ia" e "esqueceu" como a mesma linha vermelha.
 *   3. A varredura roda sozinha no corte do dia. A planilha só sabia o que
 *      estivesse na tela, e só se alguém tivesse arrastado a fórmula até a
 *      última linha — o próprio comentário na aba pedia isso.
 */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Varredura do corte do dia: tudo que era PLANEJADA e passou do horário sem
   * colheita registrada vira PENDENTE, e a cobrança entra na fila.
   */
  async sweep(date?: string): Promise<SweepResult> {
    const tz = this.config.get('APP_TIMEZONE', { infer: true });
    const tolerancia = this.config.get('COMPLIANCE_GRACE_MINUTES', { infer: true });
    const target = date ? DateOnly.parse(date) : DateOnly.todayIn(tz);

    const candidatas = await this.prisma.scheduleOccurrence.findMany({
      where: {
        date: target.toUtcDate(),
        status: 'PLANEJADA',
        harvests: { none: {} },
      },
      select: { id: true, expectedTime: true },
    });

    // O atraso é por compromisso, não pelo dia: quem tem colheita marcada
    // para as 16h não está atrasado numa varredura do meio-dia. Assim a
    // varredura pode rodar a qualquer hora e cobrar só quem de fato passou
    // do próprio horário.
    const atrasadas = candidatas.filter((o) =>
      SchedulePolicy.isOverdue(target, o.expectedTime, tolerancia, tz),
    );

    const aindaNoPrazo = candidatas.length - atrasadas.length;

    const { count } = atrasadas.length
      ? await this.prisma.scheduleOccurrence.updateMany({
          where: { id: { in: atrasadas.map((o) => o.id) } },
          data: { status: 'PENDENTE' },
        })
      : { count: 0 };

    const dispatch = await this.notifications.queuePendingAlerts(target.toString());

    this.logger.log(
      `Varredura de ${target.toString()}: ${count} pendência(s), ` +
        `${aindaNoPrazo} ainda no prazo, ` +
        `${dispatch.queued} cobrança(s) na fila, ${dispatch.skipped} sem telefone cadastrado.`,
    );

    return {
      date: target.toString(),
      markedPending: count,
      stillOnTime: aindaNoPrazo,
      alertsQueued: dispatch.queued,
      skippedWithoutPhone: dispatch.skipped,
    };
  }

  /** A visão semanal: exatamente o que a aba ALERTA mostrava, mas correta. */
  async week(
    actor: AuthenticatedUser,
    weekStart: string,
    onlyPending = false,
  ): Promise<ComplianceWeekView> {
    const start = DateOnly.parse(weekStart).startOfIsoWeek();
    const end = start.endOfIsoWeek();

    const rows = await this.prisma.scheduleOccurrence.findMany({
      where: {
        date: { gte: start.toUtcDate(), lte: end.toUtcDate() },
        ...(onlyPending ? { status: 'PENDENTE' } : {}),
        ...(seesWholeNetwork(actor)
          ? {}
          : {
              OR: [
                { institutionId: actor.institutionId ?? '' },
                { coveringInstitutionId: actor.institutionId ?? '' },
              ],
            }),
      },
      include: {
        store: { include: { chain: { select: { name: true } } } },
        institution: { select: { name: true } },
        coveringInstitution: { select: { name: true } },
        assignee: { select: { fullName: true } },
        harvests: { select: { weightKg: true } },
      },
      orderBy: [{ date: 'asc' }, { expectedTime: 'asc' }],
    });

    const mapped: ComplianceRowView[] = rows.map((row) => ({
      occurrenceId: row.id,
      date: row.date.toISOString().slice(0, 10),
      storeName: row.store.shiftLabel
        ? `${row.store.name} (${row.store.shiftLabel})`
        : row.store.name,
      chainName: row.store.chain.name,
      institutionName: row.coveringInstitution?.name ?? row.institution.name,
      assigneeName: row.assignee?.fullName ?? null,
      expectedTime: row.expectedTime,
      timeLabel: row.timeLabel,
      status: row.status,
      weightKg: row.harvests.reduce((acc, h) => acc + decimalToNumber(h.weightKg), 0),
    }));

    // Compromissos que contam para a taxa: cancelados não entram no denominador,
    // porque ninguém deixou de cumprir o que a coordenação desmarcou.
    const chargeable = mapped.filter((r) => r.status !== 'CANCELADA');
    const fulfilled = chargeable.filter((r) => r.status === 'CUMPRIDA').length;
    const pending = chargeable.filter((r) => r.status === 'PENDENTE').length;
    const excused = chargeable.filter(
      (r) => r.status === 'JUSTIFICADA' || r.status === 'REMANEJADA',
    ).length;

    return {
      weekStart: start.toString(),
      weekEnd: end.toString(),
      totalCommitments: chargeable.length,
      fulfilled,
      pending,
      excused,
      fulfilledRate: chargeable.length ? fulfilled / chargeable.length : 0,
      weightKg: mapped.reduce((acc, r) => acc + r.weightKg, 0),
      rows: mapped,
    };
  }

  /**
   * Ranking de aderência por instituição no período. É o dado que hoje não
   * existe: a planilha mostrava a semana aberta, nunca a série.
   */
  async adherenceByInstitution(from: string, to: string) {
    const grouped = await this.prisma.scheduleOccurrence.groupBy({
      by: ['institutionId', 'status'],
      where: {
        date: {
          gte: DateOnly.parse(from).toUtcDate(),
          lte: DateOnly.parse(to).toUtcDate(),
        },
        status: { not: 'CANCELADA' },
      },
      _count: { _all: true },
    });

    const institutions = await this.prisma.institution.findMany({
      where: { id: { in: [...new Set(grouped.map((g) => g.institutionId))] } },
      select: { id: true, name: true },
    });
    const nameById = new Map(institutions.map((i) => [i.id, i.name]));

    const acc = new Map<string, { total: number; fulfilled: number; pending: number }>();
    for (const row of grouped) {
      const entry = acc.get(row.institutionId) ?? { total: 0, fulfilled: 0, pending: 0 };
      entry.total += row._count._all;
      if (row.status === 'CUMPRIDA') entry.fulfilled += row._count._all;
      if (row.status === 'PENDENTE') entry.pending += row._count._all;
      acc.set(row.institutionId, entry);
    }

    return [...acc.entries()]
      .map(([institutionId, stats]) => ({
        institutionId,
        institutionName: nameById.get(institutionId) ?? 'Instituição removida',
        total: stats.total,
        fulfilled: stats.fulfilled,
        pending: stats.pending,
        rate: stats.total ? stats.fulfilled / stats.total : 0,
      }))
      .sort((a, b) => a.rate - b.rate); // pior aderência primeiro: é quem precisa de atenção
  }

  /** Contagem rápida por dia da semana, para o cabeçalho do painel. */
  async pendingByWeekday(from: string, to: string) {
    const rows = await this.prisma.scheduleOccurrence.findMany({
      where: {
        date: {
          gte: DateOnly.parse(from).toUtcDate(),
          lte: DateOnly.parse(to).toUtcDate(),
        },
        status: 'PENDENTE',
      },
      select: { date: true },
    });

    const counts = new Map<number, number>();
    for (const row of rows) {
      const weekday = row.date.getUTCDay();
      counts.set(weekday, (counts.get(weekday) ?? 0) + 1);
    }

    return Object.entries(WEEKDAY_LABELS).map(([weekday, label]) => ({
      weekday: Number(weekday),
      weekdayLabel: label,
      pending: counts.get(Number(weekday)) ?? 0,
    }));
  }
}
