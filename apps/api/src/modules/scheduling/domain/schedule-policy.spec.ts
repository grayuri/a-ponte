import { DateOnly } from '../../../shared/domain/date-only';
import { SchedulePolicy, type RecurringCommitment } from './schedule-policy';

const compromisso = (over: Partial<RecurringCommitment> = {}): RecurringCommitment => ({
  id: 'c1',
  weekday: 4, // quinta
  status: 'ATIVO',
  validFrom: null,
  validTo: null,
  ...over,
});

describe('SchedulePolicy', () => {
  it('gera uma ocorrência por semana no dia certo', () => {
    const datas = SchedulePolicy.datesInRange(
      compromisso(),
      DateOnly.parse('2026-06-22'), // segunda
      DateOnly.parse('2026-07-12'),
    ).map(String);

    expect(datas).toEqual(['2026-06-25', '2026-07-02', '2026-07-09']);
  });

  it('não gera nada para compromisso suspenso — é o caso da loja em reforma', () => {
    const datas = SchedulePolicy.datesInRange(
      compromisso({ status: 'SUSPENSO' }),
      DateOnly.parse('2026-06-01'),
      DateOnly.parse('2026-06-30'),
    );

    expect(datas).toHaveLength(0);
  });

  it('respeita a janela de vigência', () => {
    const datas = SchedulePolicy.datesInRange(
      compromisso({
        validFrom: DateOnly.parse('2026-07-01').toUtcDate(),
        validTo: DateOnly.parse('2026-07-05').toUtcDate(),
      }),
      DateOnly.parse('2026-06-22'),
      DateOnly.parse('2026-07-31'),
    ).map(String);

    expect(datas).toEqual(['2026-07-02']);
  });

  it('funciona quando o intervalo começa exatamente no dia da semana', () => {
    const datas = SchedulePolicy.datesInRange(
      compromisso(),
      DateOnly.parse('2026-06-25'), // já é quinta
      DateOnly.parse('2026-06-25'),
    ).map(String);

    expect(datas).toEqual(['2026-06-25']);
  });

  it('tira justificada e remanejada da cobrança', () => {
    // A distinção que a planilha não fazia: lá, "avisou que não ia" e
    // "esqueceu de preencher" viravam a mesma linha vermelha.
    expect(SchedulePolicy.isChargeable('PLANEJADA')).toBe(true);
    expect(SchedulePolicy.isChargeable('PENDENTE')).toBe(true);
    expect(SchedulePolicy.isChargeable('JUSTIFICADA')).toBe(false);
    expect(SchedulePolicy.isChargeable('REMANEJADA')).toBe(false);
    expect(SchedulePolicy.isChargeable('CANCELADA')).toBe(false);
    expect(SchedulePolicy.isChargeable('CUMPRIDA')).toBe(false);
  });

  describe('corte do dia', () => {
    const tz = 'America/Fortaleza';
    const hoje = DateOnly.parse('2026-06-25');

    it('não cobra antes do horário de corte', () => {
      const antes = new Date('2026-06-25T21:00:00Z'); // 18h em Fortaleza
      expect(SchedulePolicy.isPastCutoff(hoje, '20:00', tz, antes)).toBe(false);
    });

    it('cobra a partir do horário de corte', () => {
      const depois = new Date('2026-06-25T23:30:00Z'); // 20h30 em Fortaleza
      expect(SchedulePolicy.isPastCutoff(hoje, '20:00', tz, depois)).toBe(true);
    });

    it('sempre cobra dias passados e nunca dias futuros', () => {
      const agora = new Date('2026-06-25T12:00:00Z');
      expect(SchedulePolicy.isPastCutoff(DateOnly.parse('2026-06-24'), '20:00', tz, agora)).toBe(true);
      expect(SchedulePolicy.isPastCutoff(DateOnly.parse('2026-06-26'), '20:00', tz, agora)).toBe(false);
    });
  });
});
