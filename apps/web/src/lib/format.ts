export const MESES = [
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
];

export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function formatarDataExtenso(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const data = new Date(Date.UTC(ano!, mes! - 1, dia!));
  const semana = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][
    data.getUTCDay()
  ];
  return `${semana}, ${dia} de ${MESES[mes! - 1]?.toLowerCase()}`;
}

export function formatarKg(valor: number): string {
  return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;
}

export function formatarNumero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function formatarPercentual(valor: number): string {
  return `${Math.round(valor * 100)}%`;
}

/** AAAA-MM-DD de hoje no fuso da operação. */
export function hojeIso(timeZone = 'America/Fortaleza'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function primeiroDiaDoAno(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

export function inicioDaSemana(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const data = new Date(Date.UTC(ano!, mes! - 1, dia!));
  const dow = data.getUTCDay();
  data.setUTCDate(data.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return data.toISOString().slice(0, 10);
}

export function somarDias(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const data = new Date(Date.UTC(ano!, mes! - 1, dia!));
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}
