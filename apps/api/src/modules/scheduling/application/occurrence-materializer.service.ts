import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../../config/env.config';
import { DateOnly } from '../../../shared/domain/date-only';
import { PrismaService } from '../../../shared/infrastructure/prisma.service';
import { SchedulePolicy } from '../domain/schedule-policy';

export interface MaterializationResult {
  from: string;
  to: string;
  created: number;
  skipped: number;
}

/**
 * Transforma a escala recorrente em ocorrências datadas dentro de um horizonte.
 *
 * É idempotente por construção: a unicidade (commitmentId, date) no banco faz o
 * `skipDuplicates` engolir o que já existe. Rodar duas vezes no mesmo dia — o
 * que acontece toda vez que alguém reinicia o container — não duplica nada.
 */
@Injectable()
export class OccurrenceMaterializerService {
  private readonly logger = new Logger(OccurrenceMaterializerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  /** Materializa do dia de hoje até o horizonte configurado. */
  async materializeHorizon(): Promise<MaterializationResult> {
    const tz = this.config.get('APP_TIMEZONE', { infer: true });
    const horizon = this.config.get('SCHEDULE_HORIZON_DAYS', { infer: true });
    const today = DateOnly.todayIn(tz);
    return this.materializeRange(today, today.addDays(horizon));
  }

  async materializeRange(from: DateOnly, to: DateOnly): Promise<MaterializationResult> {
    const commitments = await this.prisma.scheduleCommitment.findMany({
      where: { status: 'ATIVO' },
      select: {
        id: true,
        weekday: true,
        status: true,
        validFrom: true,
        validTo: true,
        storeId: true,
        institutionId: true,
        assigneeUserId: true,
        startTime: true,
        timeLabel: true,
      },
    });

    const rows = commitments.flatMap((commitment) =>
      SchedulePolicy.datesInRange(commitment, from, to).map((date) => ({
        commitmentId: commitment.id,
        date: date.toUtcDate(),
        storeId: commitment.storeId,
        institutionId: commitment.institutionId,
        assigneeUserId: commitment.assigneeUserId,
        expectedTime: commitment.startTime,
        timeLabel: commitment.timeLabel,
      })),
    );

    if (!rows.length) {
      return { from: from.toString(), to: to.toString(), created: 0, skipped: 0 };
    }

    const { count } = await this.prisma.scheduleOccurrence.createMany({
      data: rows,
      skipDuplicates: true,
    });

    const result: MaterializationResult = {
      from: from.toString(),
      to: to.toString(),
      created: count,
      skipped: rows.length - count,
    };

    this.logger.log(
      `Escala materializada de ${result.from} a ${result.to}: ` +
        `${result.created} nova(s), ${result.skipped} já existia(m).`,
    );

    return result;
  }

  /**
   * Quando um compromisso muda, as ocorrências FUTURAS ainda não tocadas
   * precisam acompanhar. As passadas ficam como estavam — são registro
   * histórico, não projeção.
   */
  async resyncFutureOccurrences(commitmentId: string): Promise<number> {
    const tz = this.config.get('APP_TIMEZONE', { infer: true });
    const today = DateOnly.todayIn(tz);

    const commitment = await this.prisma.scheduleCommitment.findUnique({
      where: { id: commitmentId },
    });
    if (!commitment) return 0;

    // Some com as futuras planejadas e refaz — assim uma mudança de dia da
    // semana não deixa órfãs na terça quando a escala virou quinta.
    await this.prisma.scheduleOccurrence.deleteMany({
      where: {
        commitmentId,
        date: { gte: today.toUtcDate() },
        status: 'PLANEJADA',
        harvests: { none: {} },
      },
    });

    if (commitment.status !== 'ATIVO') return 0;

    const horizon = this.config.get('SCHEDULE_HORIZON_DAYS', { infer: true });
    const result = await this.materializeRange(today, today.addDays(horizon));
    return result.created;
  }
}
