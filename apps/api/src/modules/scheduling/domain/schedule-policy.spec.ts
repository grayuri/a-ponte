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

  describe('atraso por compromisso', () => {
    const tz = 'America/Fortaleza';
    const hoje = DateOnly.parse('2026-08-02');
    // 12:16 em Fortaleza (UTC-3) = 15:16 UTC.
    const meioDia = new Date('2026-08-02T15:16:00Z');
    const semTolerancia = 0;

    it('cobra só o que já passou do próprio horário', () => {
      // O caso exato levantado: às 12h16, os das 4h30, 7h e 8h estão
      // atrasados; os das 15h, 15h30 e 16h ainda têm o dia pela frente.
      const atrasados = ['04:30', '07:00', '08:00'];
      const noPrazo = ['15:00', '15:30', '16:00'];

      for (const hora of atrasados) {
        expect(SchedulePolicy.isOverdue(hoje, hora, semTolerancia, tz, meioDia)).toBe(true);
      }
      for (const hora of noPrazo) {
        expect(SchedulePolicy.isOverdue(hoje, hora, semTolerancia, tz, meioDia)).toBe(false);
      }
    });

    it('respeita a tolerância depois do horário', () => {
      const dezEDez = new Date('2026-08-02T13:10:00Z'); // 10:10 local

      // Colheita das 10h com 2h de tolerância: só vira atraso depois das 12h.
      expect(SchedulePolicy.isOverdue(hoje, '10:00', 120, tz, dezEDez)).toBe(false);
      expect(SchedulePolicy.isOverdue(hoje, '08:00', 120, tz, dezEDez)).toBe(true);
    });

    it('cobra na virada exata do horário mais tolerância', () => {
      const dozeEmPonto = new Date('2026-08-02T15:00:00Z'); // 12:00 local
      expect(SchedulePolicy.isOverdue(hoje, '10:00', 120, tz, dozeEmPonto)).toBe(true);
    });

    it('cobra o dia inteiro quando a data já passou, sem olhar horário', () => {
      const ontem = DateOnly.parse('2026-08-01');
      expect(SchedulePolicy.isOverdue(ontem, '23:59', 120, tz, meioDia)).toBe(true);
    });

    it('nunca cobra dia futuro', () => {
      const amanha = DateOnly.parse('2026-08-03');
      expect(SchedulePolicy.isOverdue(amanha, '00:01', 0, tz, meioDia)).toBe(false);
    });

    it('usa o fuso da operação, não o do servidor', () => {
      // 02:00 UTC de 03/08 ainda é 23:00 de 02/08 em Fortaleza. Um servidor
      // em UTC acharia que já é outro dia e cobraria tudo.
      const quaseMeiaNoite = new Date('2026-08-03T02:00:00Z');
      expect(SchedulePolicy.isOverdue(hoje, '22:00', 0, tz, quaseMeiaNoite)).toBe(true);
      expect(SchedulePolicy.isOverdue(hoje, '23:30', 0, tz, quaseMeiaNoite)).toBe(false);
    });
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
