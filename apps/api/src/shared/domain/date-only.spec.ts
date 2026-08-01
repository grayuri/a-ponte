import { DateOnly } from './date-only';

describe('DateOnly', () => {
  it('rejeita data que não existe no calendário', () => {
    expect(() => DateOnly.parse('2026-02-30')).toThrow(/inexistente/i);
    expect(() => DateOnly.parse('02/01/2026')).toThrow(/AAAA-MM-DD/);
  });

  it('calcula a semana ISO começando na segunda', () => {
    // 2026-06-24 é uma quarta-feira.
    const quarta = DateOnly.parse('2026-06-24');
    expect(quarta.startOfIsoWeek().toString()).toBe('2026-06-22');
    expect(quarta.endOfIsoWeek().toString()).toBe('2026-06-28');
  });

  it('trata domingo como fim da semana ISO, não como início', () => {
    // O erro clássico: com getDay()=0, um deslocamento ingênuo joga o domingo
    // para a semana seguinte, e a cobrança de domingo cai na semana errada.
    const domingo = DateOnly.parse('2026-06-28');
    expect(domingo.weekday()).toBe(0);
    expect(domingo.startOfIsoWeek().toString()).toBe('2026-06-22');
  });

  it('atravessa a virada de mês e de ano ao somar dias', () => {
    expect(DateOnly.parse('2026-01-31').addDays(1).toString()).toBe('2026-02-01');
    expect(DateOnly.parse('2026-12-31').addDays(1).toString()).toBe('2027-01-01');
    expect(DateOnly.parse('2026-01-01').addDays(-1).toString()).toBe('2025-12-31');
  });

  it('resolve o último dia do mês, inclusive em fevereiro', () => {
    expect(DateOnly.parse('2026-02-10').endOfMonth().toString()).toBe('2026-02-28');
    expect(DateOnly.parse('2028-02-10').endOfMonth().toString()).toBe('2028-02-29');
  });

  it('usa o fuso da operação, não o do servidor, para saber que dia é hoje', () => {
    // 03:00 UTC de 25/06 ainda é dia 24 em Fortaleza (UTC-3). Um container em
    // UTC no Render dispararia a escala do dia errado sem isso.
    const instante = new Date('2026-06-25T02:00:00Z');
    expect(DateOnly.todayIn('America/Fortaleza', instante).toString()).toBe('2026-06-24');
    expect(DateOnly.todayIn('UTC', instante).toString()).toBe('2026-06-25');
  });

  it('devolve a hora local no fuso da operação', () => {
    const instante = new Date('2026-06-25T23:30:00Z');
    expect(DateOnly.timeIn('America/Fortaleza', instante)).toBe('20:30');
  });
});
