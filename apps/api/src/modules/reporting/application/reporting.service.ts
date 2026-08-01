import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WEEKDAY_LABELS } from '@a-ponte/contracts';
import type {
  CalendarView,
  DashboardKpiView,
  MonthlyPointView,
  RankingRowView,
  WeekdaySummaryView,
} from '@a-ponte/contracts';
import { DateOnly, MONTH_LABELS } from '../../../shared/domain/date-only';
import { decimalToNumber } from '../../../shared/domain/weight-kg';
import { PrismaService } from '../../../shared/infrastructure/prisma.service';

/**
 * Reporting — as abas PAINEL, RESUMOS e CALENDÁRIO.
 *
 * Diferença de fundo: na planilha, cada número era um SUMIFS varrendo 10 mil
 * linhas, recalculado a cada tecla — o arquivo tem 2,5 MB só de cadeia de
 * cálculo. Aqui a agregação acontece no Postgres, com índice por data.
 */
@Injectable()
export class ReportingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Os cartões do topo do painel. */
  async kpis(from: string, to: string): Promise<DashboardKpiView> {
    const range = this.range(from, to);

    const [totals, byType, distinct, occurrences] = await Promise.all([
      this.prisma.harvest.aggregate({
        where: { harvestedOn: range },
        _sum: { weightKg: true },
        _count: { _all: true },
      }),
      this.prisma.harvest.groupBy({
        by: ['harvestTypeId'],
        where: { harvestedOn: range },
        _sum: { weightKg: true },
      }),
      this.prisma.harvest.findMany({
        where: { harvestedOn: range },
        select: { storeId: true, institutionId: true, collectorUserId: true },
      }),
      this.prisma.scheduleOccurrence.groupBy({
        by: ['status'],
        where: { date: range, status: { not: 'CANCELADA' } },
        _count: { _all: true },
      }),
    ]);

    const typeLabels = await this.prisma.harvestType.findMany({
      where: { id: { in: byType.map((t) => t.harvestTypeId) } },
      select: { id: true, label: true },
    });
    const labelById = new Map(typeLabels.map((t) => [t.id, t.label]));

    const harvestCount = totals._count._all;
    const totalWeight = decimalToNumber(totals._sum.weightKg);

    const totalOccurrences = occurrences.reduce((acc, o) => acc + o._count._all, 0);
    const fulfilled = occurrences.find((o) => o.status === 'CUMPRIDA')?._count._all ?? 0;
    const pendingCount = occurrences.find((o) => o.status === 'PENDENTE')?._count._all ?? 0;

    return {
      from,
      to,
      totalWeightKg: totalWeight,
      harvestCount,
      storeCount: new Set(distinct.map((d) => d.storeId)).size,
      institutionCount: new Set(distinct.map((d) => d.institutionId)).size,
      collectorCount: new Set(
        distinct.map((d) => d.collectorUserId).filter((v): v is string => Boolean(v)),
      ).size,
      averageKgPerHarvest: harvestCount ? Math.round((totalWeight / harvestCount) * 10) / 10 : 0,
      weightByTypeKg: Object.fromEntries(
        byType.map((t) => [
          labelById.get(t.harvestTypeId) ?? 'Outros',
          decimalToNumber(t._sum.weightKg),
        ]),
      ),
      fulfilledRate: totalOccurrences ? fulfilled / totalOccurrences : 0,
      pendingCount,
    };
  }

  /** Evolução mensal do ano — a tabela do meio do PAINEL. */
  async monthlyEvolution(year: number): Promise<MonthlyPointView[]> {
    // Faixa de datas em vez de `extract(year from harvested_on) = $1`:
    // aplicar função na coluna torna o predicado não-sargável e obriga a
    // varredura completa da tabela. Assim o índice harvests(harvested_on)
    // é usado de verdade.
    const inicio = DateOnly.parse(`${year}-01-01`).toUtcDate();
    const fim = DateOnly.parse(`${year + 1}-01-01`).toUtcDate();

    const rows = await this.prisma.$queryRaw<
      Array<{ month: number; count: bigint; weight: Prisma.Decimal | null }>
    >`
      select
        extract(month from harvested_on)::int as month,
        count(*)::bigint                      as count,
        sum(weight_kg)                        as weight
      from harvests
      where harvested_on >= ${inicio}::date
        and harvested_on <  ${fim}::date
      group by 1
      order by 1
    `;

    const byMonth = new Map(rows.map((r) => [r.month, r]));
    const yearTotal = rows.reduce((acc, r) => acc + decimalToNumber(r.weight), 0);

    return MONTH_LABELS.map((label, index) => {
      const row = byMonth.get(index + 1);
      const weightKg = decimalToNumber(row?.weight ?? null);
      return {
        month: index + 1,
        monthLabel: label,
        harvestCount: row ? Number(row.count) : 0,
        weightKg,
        share: yearTotal ? weightKg / yearTotal : 0,
      };
    });
  }

  /** Resumo por loja — a coluna esquerda da aba RESUMOS. */
  async byStore(from: string, to: string): Promise<RankingRowView[]> {
    const grouped = await this.prisma.harvest.groupBy({
      by: ['storeId'],
      where: { harvestedOn: this.range(from, to) },
      _count: { _all: true },
      _sum: { weightKg: true },
    });

    const stores = await this.prisma.store.findMany({
      where: { id: { in: grouped.map((g) => g.storeId) } },
      select: { id: true, name: true, shiftLabel: true },
    });
    const byId = new Map(stores.map((s) => [s.id, s]));

    return grouped
      .map((g) => {
        const store = byId.get(g.storeId);
        return {
          id: g.storeId,
          label: store
            ? store.shiftLabel
              ? `${store.name} (${store.shiftLabel})`
              : store.name
            : 'Loja removida',
          harvestCount: g._count._all,
          weightKg: decimalToNumber(g._sum.weightKg),
        };
      })
      .sort((a, b) => b.weightKg - a.weightKg);
  }

  /** Resumo por instituição — a coluna do meio da aba RESUMOS. */
  async byInstitution(from: string, to: string): Promise<RankingRowView[]> {
    const grouped = await this.prisma.harvest.groupBy({
      by: ['institutionId'],
      where: { harvestedOn: this.range(from, to) },
      _count: { _all: true },
      _sum: { weightKg: true },
    });

    const institutions = await this.prisma.institution.findMany({
      where: { id: { in: grouped.map((g) => g.institutionId) } },
      select: { id: true, name: true },
    });
    const byId = new Map(institutions.map((i) => [i.id, i.name]));

    return grouped
      .map((g) => ({
        id: g.institutionId,
        label: byId.get(g.institutionId) ?? 'Instituição removida',
        harvestCount: g._count._all,
        weightKg: decimalToNumber(g._sum.weightKg),
      }))
      .sort((a, b) => b.weightKg - a.weightKg);
  }

  /** Resumo por colhedor — não existia na planilha; agora existe, por login. */
  async byCollector(from: string, to: string): Promise<RankingRowView[]> {
    const grouped = await this.prisma.harvest.groupBy({
      by: ['collectorUserId'],
      where: { harvestedOn: this.range(from, to), collectorUserId: { not: null } },
      _count: { _all: true },
      _sum: { weightKg: true },
    });

    const ids = grouped
      .map((g) => g.collectorUserId)
      .filter((v): v is string => v !== null);

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    const byId = new Map(users.map((u) => [u.id, u.fullName]));

    return grouped
      .filter((g): g is typeof g & { collectorUserId: string } => g.collectorUserId !== null)
      .map((g) => ({
        id: g.collectorUserId,
        label: byId.get(g.collectorUserId) ?? 'Usuário removido',
        harvestCount: g._count._all,
        weightKg: decimalToNumber(g._sum.weightKg),
      }))
      .sort((a, b) => b.weightKg - a.weightKg);
  }

  /** Resumo por dia da semana — a coluna direita da aba RESUMOS. */
  async byWeekday(from: string, to: string): Promise<WeekdaySummaryView[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ weekday: number; count: bigint; weight: Prisma.Decimal | null }>
    >`
      select
        extract(dow from harvested_on)::int as weekday,
        count(*)::bigint                    as count,
        sum(weight_kg)                      as weight
      from harvests
      where harvested_on between ${DateOnly.parse(from).toUtcDate()}::date
                             and ${DateOnly.parse(to).toUtcDate()}::date
      group by 1
      order by 1
    `;

    const byWeekday = new Map(rows.map((r) => [r.weekday, r]));

    return Object.entries(WEEKDAY_LABELS).map(([weekday, label]) => {
      const row = byWeekday.get(Number(weekday));
      return {
        weekday: Number(weekday),
        weekdayLabel: label,
        harvestCount: row ? Number(row.count) : 0,
        weightKg: decimalToNumber(row?.weight ?? null),
      };
    });
  }

  /** A matriz loja × dia do mês — a aba CALENDÁRIO. */
  async calendar(year: number, month: number): Promise<CalendarView> {
    const start = DateOnly.parse(
      `${year}-${String(month).padStart(2, '0')}-01`,
    );
    const end = start.endOfMonth();

    const rows = await this.prisma.harvest.findMany({
      where: { harvestedOn: this.range(start.toString(), end.toString()) },
      select: { storeId: true, harvestedOn: true, weightKg: true },
    });

    const stores = await this.prisma.store.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.storeId))] } },
      select: { id: true, name: true, shiftLabel: true },
      orderBy: { name: 'asc' },
    });

    const daysInMonth = end.day;

    const grid = new Map<string, Map<number, { count: number; weight: number }>>();
    for (const row of rows) {
      const day = row.harvestedOn.getUTCDate();
      const perStore = grid.get(row.storeId) ?? new Map();
      const cell = perStore.get(day) ?? { count: 0, weight: 0 };
      cell.count += 1;
      cell.weight += decimalToNumber(row.weightKg);
      perStore.set(day, cell);
      grid.set(row.storeId, perStore);
    }

    return {
      year,
      month,
      daysInMonth,
      rows: stores.map((store) => {
        const perStore = grid.get(store.id) ?? new Map();
        const cells = Array.from({ length: daysInMonth }, (_, i) => {
          const cell = perStore.get(i + 1);
          return {
            day: i + 1,
            harvestCount: cell?.count ?? 0,
            weightKg: Math.round((cell?.weight ?? 0) * 10) / 10,
          };
        });

        return {
          storeId: store.id,
          storeName: store.shiftLabel ? `${store.name} (${store.shiftLabel})` : store.name,
          cells,
          totalHarvests: cells.reduce((acc, c) => acc + c.harvestCount, 0),
          totalWeightKg: Math.round(cells.reduce((acc, c) => acc + c.weightKg, 0) * 10) / 10,
        };
      }),
    };
  }

  /** Linhas cruas para exportação em CSV/Excel. */
  async exportRows(from: string, to: string) {
    const rows = await this.prisma.harvest.findMany({
      where: { harvestedOn: this.range(from, to) },
      include: {
        store: { include: { chain: { select: { name: true } } } },
        institution: { select: { name: true } },
        harvestType: { select: { label: true } },
        collector: { select: { fullName: true } },
      },
      orderBy: [{ harvestedOn: 'asc' }, { createdAt: 'asc' }],
    });

    return rows.map((row) => {
      const date = DateOnly.fromJsDate(row.harvestedOn);
      return {
        Data: date.toString(),
        Ano: date.year,
        Mês: MONTH_LABELS[date.month - 1],
        'Dia Semana': WEEKDAY_LABELS[date.weekday() as 0],
        Semana: date.startOfIsoWeek().toString(),
        Responsável: row.collector?.fullName ?? row.legacyCollectorName ?? '',
        Rede: row.store.chain.name,
        'Loja / Mercado': row.store.shiftLabel
          ? `${row.store.name} (${row.store.shiftLabel})`
          : row.store.name,
        'Tipo Colheita': row.harvestType.label,
        'Quilos (kg)': decimalToNumber(row.weightKg),
        'Instituição / Destino': row.institution.name,
        'Alimentos Colhidos': row.mainFoods ?? '',
        Origem: row.source,
      };
    });
  }

  private range(from: string, to: string) {
    return {
      gte: DateOnly.parse(from).toUtcDate(),
      lte: DateOnly.parse(to).toUtcDate(),
    };
  }
}
