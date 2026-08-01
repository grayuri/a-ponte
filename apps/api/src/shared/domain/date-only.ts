/**
 * Uma colheita acontece num DIA, não num instante. A planilha errava isso o
 * tempo todo: o carimbo do formulário era timestamp com hora, o campo "dia"
 * era texto "02/01", e a fórmula colava o ano do timestamp no dia digitado —
 * o que quebra em qualquer virada de ano ou preenchimento atrasado.
 *
 * Aqui o dia é um valor próprio, sem hora e sem fuso, e toda conversão de/para
 * o fuso da operação passa por um único lugar.
 */
export class DateOnly {
  private constructor(
    readonly year: number,
    readonly month: number,
    readonly day: number,
  ) {}

  static parse(value: string): DateOnly {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) throw new Error(`Data inválida: "${value}". Use AAAA-MM-DD.`);

    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);

    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
      probe.getUTCFullYear() !== year ||
      probe.getUTCMonth() !== month - 1 ||
      probe.getUTCDate() !== day
    ) {
      throw new Error(`Data inexistente no calendário: "${value}".`);
    }

    return new DateOnly(year, month, day);
  }

  static fromJsDate(date: Date): DateOnly {
    return new DateOnly(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }

  /** O "hoje" da operação, no fuso configurado — nunca o do servidor. */
  static todayIn(timeZone: string, now: Date = new Date()): DateOnly {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    return DateOnly.parse(parts);
  }

  /** Hora local (HH:mm) no fuso da operação. */
  static timeIn(timeZone: string, now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
  }

  /** Meia-noite UTC do dia — a forma como colunas `date` do Postgres viajam. */
  toUtcDate(): Date {
    return new Date(Date.UTC(this.year, this.month - 1, this.day));
  }

  toString(): string {
    const mm = String(this.month).padStart(2, '0');
    const dd = String(this.day).padStart(2, '0');
    return `${this.year}-${mm}-${dd}`;
  }

  /** 0 = domingo ... 6 = sábado. */
  weekday(): number {
    return this.toUtcDate().getUTCDay();
  }

  addDays(days: number): DateOnly {
    const d = this.toUtcDate();
    d.setUTCDate(d.getUTCDate() + days);
    return DateOnly.fromJsDate(d);
  }

  /** Segunda-feira da semana — a planilha usa semana ISO, e mantemos isso. */
  startOfIsoWeek(): DateOnly {
    const dow = this.weekday();
    const offset = dow === 0 ? -6 : 1 - dow;
    return this.addDays(offset);
  }

  endOfIsoWeek(): DateOnly {
    return this.startOfIsoWeek().addDays(6);
  }

  startOfMonth(): DateOnly {
    return new DateOnly(this.year, this.month, 1);
  }

  endOfMonth(): DateOnly {
    const d = new Date(Date.UTC(this.year, this.month, 0));
    return DateOnly.fromJsDate(d);
  }

  isBefore(other: DateOnly): boolean {
    return this.toString() < other.toString();
  }

  isAfter(other: DateOnly): boolean {
    return this.toString() > other.toString();
  }

  isSame(other: DateOnly): boolean {
    return this.toString() === other.toString();
  }

  isBetween(from: DateOnly, to: DateOnly): boolean {
    return !this.isBefore(from) && !this.isAfter(to);
  }

  static range(from: DateOnly, to: DateOnly): DateOnly[] {
    const out: DateOnly[] = [];
    let cursor = from;
    while (!cursor.isAfter(to)) {
      out.push(cursor);
      cursor = cursor.addDays(1);
    }
    return out;
  }
}

export const MONTH_LABELS = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

/** Formata AAAA-MM-DD como DD/MM/AAAA, para mensagens e telas. */
export function formatBr(date: DateOnly | string): string {
  const s = typeof date === 'string' ? date : date.toString();
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}
