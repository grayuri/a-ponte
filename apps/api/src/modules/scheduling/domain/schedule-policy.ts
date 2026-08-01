import { DateOnly } from '../../../shared/domain/date-only';

export interface RecurringCommitment {
  id: string;
  weekday: number;
  status: 'ATIVO' | 'SUSPENSO' | 'ENCERRADO';
  validFrom: Date | null;
  validTo: Date | null;
}

/**
 * A regra de recorrência da escala, isolada de banco e de framework.
 *
 * Na planilha, a escala era uma lista de linhas e a "data" saía de uma fórmula
 * que somava um deslocamento de dia da semana à segunda-feira selecionada — o
 * que significa que a escala inteira só existia para a semana que estivesse
 * aberta na tela. Aqui a recorrência é a regra, e cada dia concreto é um fato
 * materializado que pode ser justificado, remanejado ou cancelado sozinho.
 */
export class SchedulePolicy {
  /** Um compromisso vale num dia? Considera status e janela de vigência. */
  static appliesOn(commitment: RecurringCommitment, date: DateOnly): boolean {
    if (commitment.status !== 'ATIVO') return false;
    if (commitment.weekday !== date.weekday()) return false;

    if (commitment.validFrom) {
      const from = DateOnly.fromJsDate(commitment.validFrom);
      if (date.isBefore(from)) return false;
    }

    if (commitment.validTo) {
      const to = DateOnly.fromJsDate(commitment.validTo);
      if (date.isAfter(to)) return false;
    }

    return true;
  }

  /** Todas as datas em que o compromisso ocorre dentro do intervalo. */
  static datesInRange(
    commitment: RecurringCommitment,
    from: DateOnly,
    to: DateOnly,
  ): DateOnly[] {
    if (commitment.status !== 'ATIVO') return [];
    if (from.isAfter(to)) return [];

    // Anda até o primeiro dia da semana certo em vez de varrer dia a dia:
    // com 180 compromissos e horizonte de 14 dias, isso é 180 x 2 iterações
    // em vez de 180 x 14.
    const offset = (commitment.weekday - from.weekday() + 7) % 7;
    let cursor = from.addDays(offset);

    const out: DateOnly[] = [];
    while (!cursor.isAfter(to)) {
      if (SchedulePolicy.appliesOn(commitment, cursor)) out.push(cursor);
      cursor = cursor.addDays(7);
    }
    return out;
  }

  /**
   * Uma ocorrência ainda pode ser cobrada?
   *
   * Justificada, remanejada ou cancelada saem da cobrança — foi exatamente o
   * que a planilha nunca soube distinguir: lá, "não preencheu" e "avisou que
   * não ia" eram a mesma linha vermelha.
   */
  static isChargeable(status: string): boolean {
    return status === 'PLANEJADA' || status === 'PENDENTE';
  }

  /** Já passou do horário de corte no fuso da operação? */
  static isPastCutoff(date: DateOnly, cutoffTime: string, timeZone: string, now = new Date()): boolean {
    const today = DateOnly.todayIn(timeZone, now);
    if (date.isBefore(today)) return true;
    if (date.isAfter(today)) return false;
    return DateOnly.timeIn(timeZone, now) >= cutoffTime;
  }
}
