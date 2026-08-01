/**
 * Vocabulário compartilhado entre backend e frontend.
 * Os valores são os mesmos gravados no banco — mudar um valor aqui é mudar dado.
 */

export const UserRole = {
  /** Acesso total, inclusive cadastros e configuração de notificações. */
  ADMIN: 'ADMIN',
  /** Opera a rede: monta escala, acompanha pendências, cobra preenchimento. */
  COORDENADOR: 'COORDENADOR',
  /** Responde por uma instituição: vê a escala dela e os colhedores dela. */
  INSTITUICAO: 'INSTITUICAO',
  /** Vai ao mercado e registra a colheita. */
  COLHEDOR: 'COLHEDOR',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];
export const USER_ROLES = Object.values(UserRole);

export const UserStatus = {
  ATIVO: 'ATIVO',
  INATIVO: 'INATIVO',
  CONVIDADO: 'CONVIDADO',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

/** Dias da semana como o Postgres/JS enxergam: 0 = domingo. */
export const Weekday = {
  DOMINGO: 0,
  SEGUNDA: 1,
  TERCA: 2,
  QUARTA: 3,
  QUINTA: 4,
  SEXTA: 5,
  SABADO: 6,
} as const;
export type Weekday = (typeof Weekday)[keyof typeof Weekday];

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

/**
 * Situação de um compromisso da escala. Nasceu da planilha, onde a coluna
 * "Responsável" às vezes carregava um aviso em vez de um nome
 * ("FECHADO POR 3 MESES PARA REFORMA", "DIRETO COM A INSTITUIÇÃO").
 * Aqui isso é estado, não texto.
 */
export const CommitmentStatus = {
  ATIVO: 'ATIVO',
  SUSPENSO: 'SUSPENSO',
  ENCERRADO: 'ENCERRADO',
} as const;
export type CommitmentStatus = (typeof CommitmentStatus)[keyof typeof CommitmentStatus];

/** Ciclo de vida de uma ocorrência datada da escala. */
export const OccurrenceStatus = {
  /** Materializada, ainda dentro do prazo. */
  PLANEJADA: 'PLANEJADA',
  /** Existe colheita registrada — deu baixa. */
  CUMPRIDA: 'CUMPRIDA',
  /** Passou do corte do dia sem registro. */
  PENDENTE: 'PENDENTE',
  /** Instituição avisou que não vai — sai da cobrança. */
  JUSTIFICADA: 'JUSTIFICADA',
  /** Coberta por outra instituição (o "quem vai?" que hoje é manual). */
  REMANEJADA: 'REMANEJADA',
  /** Loja fechada, feriado, etc. */
  CANCELADA: 'CANCELADA',
} as const;
export type OccurrenceStatus = (typeof OccurrenceStatus)[keyof typeof OccurrenceStatus];

export const OCCURRENCE_STATUS_LABELS: Record<OccurrenceStatus, string> = {
  PLANEJADA: 'Planejada',
  CUMPRIDA: 'Cumprida',
  PENDENTE: 'Pendente',
  JUSTIFICADA: 'Justificada',
  REMANEJADA: 'Remanejada',
  CANCELADA: 'Cancelada',
};

/** Origem do registro de colheita. */
export const HarvestSource = {
  /** Preenchido no app. */
  APP: 'APP',
  /** Trazido da planilha/Google Forms de 2026. */
  IMPORTACAO: 'IMPORTACAO',
  /** Lançado por um coordenador em nome de alguém. */
  LANCAMENTO_MANUAL: 'LANCAMENTO_MANUAL',
} as const;
export type HarvestSource = (typeof HarvestSource)[keyof typeof HarvestSource];

export const NotificationKind = {
  /** "Hoje é seu dia, colhendo na loja X para a instituição Y." */
  ESCALA_DO_DIA: 'ESCALA_DO_DIA',
  /** "Você estava na escala e não deu baixa — preencha até o fim do dia." */
  COBRANCA_PENDENCIA: 'COBRANCA_PENDENCIA',
  /** Resumo semanal para coordenação. */
  RESUMO_SEMANAL: 'RESUMO_SEMANAL',
  /** Pedido de cobertura quando a instituição escalada não pode ir. */
  PEDIDO_COBERTURA: 'PEDIDO_COBERTURA',
} as const;
export type NotificationKind = (typeof NotificationKind)[keyof typeof NotificationKind];

export const NotificationChannel = {
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationStatus = {
  NA_FILA: 'NA_FILA',
  ENVIADA: 'ENVIADA',
  FALHOU: 'FALHOU',
  CANCELADA: 'CANCELADA',
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

/**
 * Códigos dos tipos de colheita. Espelham os valores que o formulário atual usa,
 * para que a importação do histórico case sem tradução.
 */
export const HarvestTypeCode = {
  SELF_SERVICE: 'SELF_SERVICE',
  HORTIFRUTI: 'HORTIFRUTI',
  POLPAS: 'POLPAS',
} as const;
export type HarvestTypeCode = (typeof HarvestTypeCode)[keyof typeof HarvestTypeCode];
