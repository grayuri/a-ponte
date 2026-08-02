import { z } from 'zod';
import {
  CommitmentStatus,
  HarvestSource,
  NotificationChannel,
  NotificationKind,
  OccurrenceStatus,
  USER_ROLES,
  UserRole,
  UserStatus,
} from './enums';

const enumOf = <T extends Record<string, string>>(obj: T) =>
  z.enum(Object.values(obj) as [string, ...string[]]);

/** Data sem hora, no formato ISO — o domínio inteiro trabalha assim. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD');

export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:mm');

export const weekdaySchema = z.number().int().min(0).max(6);

/**
 * Telefone brasileiro em E.164 (+5585999999999). É a chave de entrega das
 * mensagens — se estiver errado, o colhedor simplesmente não é avisado.
 */
export const phoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Informe o telefone com código do país, ex.: +5585999999999');

// --------------------------------------------------------------------------
// Identity
// --------------------------------------------------------------------------

export const loginSchema = z.object({
  /** Aceita nome de usuário OU e-mail, conforme pedido. */
  identifier: z.string().min(3, 'Informe seu usuário ou e-mail'),
  password: z.string().min(6, 'A senha precisa ter ao menos 6 caracteres'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const resolveIdentifierSchema = z.object({
  identifier: z.string().min(3),
});

export const createUserSchema = z.object({
  fullName: z.string().min(3, 'Informe o nome completo'),
  username: z
    .string()
    .min(3, 'O usuário precisa ter ao menos 3 caracteres')
    .max(40)
    .regex(/^[a-z0-9._-]+$/, 'Use apenas letras minúsculas, números, ponto, hífen ou underline'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'A senha precisa ter ao menos 6 caracteres'),
  phone: phoneSchema.optional().nullable(),
  role: enumOf(UserRole),
  institutionId: z.string().uuid().optional().nullable(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema
  .omit({ password: true })
  .partial()
  .extend({ status: enumOf(UserStatus).optional() });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const listUsersQuerySchema = z.object({
  search: z.string().optional(),
  role: enumOf(UserRole).optional(),
  institutionId: z.string().uuid().optional(),
  status: enumOf(UserStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// --------------------------------------------------------------------------
// Catalog
// --------------------------------------------------------------------------

export const createChainSchema = z.object({
  name: z.string().min(2),
  notes: z.string().max(500).optional().nullable(),
});

export const createStoreSchema = z.object({
  chainId: z.string().uuid(),
  name: z.string().min(2),
  city: z.string().max(120).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  /** Distingue turnos da mesma loja (ex.: Eusébio tarde x Eusébio noite). */
  shiftLabel: z.string().max(60).optional().nullable(),
  active: z.boolean().default(true),
});
export type CreateStoreInput = z.infer<typeof createStoreSchema>;

export const createInstitutionSchema = z.object({
  name: z.string().min(2),
  shortName: z.string().max(80).optional().nullable(),
  contactName: z.string().max(160).optional().nullable(),
  phone: phoneSchema.optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  active: z.boolean().default(true),
});
export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;

// --------------------------------------------------------------------------
// Scheduling
// --------------------------------------------------------------------------

export const createCommitmentSchema = z.object({
  storeId: z.string().uuid(),
  institutionId: z.string().uuid(),
  /** Opcional: a instituição pode responder sem uma pessoa fixa. */
  assigneeUserId: z.string().uuid().optional().nullable(),
  weekday: weekdaySchema,
  startTime: timeOfDaySchema,
  /** Rótulo livre para casos como "16h / 21:45h" ou "ENTRE 15:30h e 16h". */
  timeLabel: z.string().max(60).optional().nullable(),
  harvestTypeId: z.string().uuid().optional().nullable(),
  status: enumOf(CommitmentStatus).default(CommitmentStatus.ATIVO),
  statusNote: z.string().max(300).optional().nullable(),
  validFrom: dateOnlySchema.optional().nullable(),
  validTo: dateOnlySchema.optional().nullable(),
});
export type CreateCommitmentInput = z.infer<typeof createCommitmentSchema>;

export const updateCommitmentSchema = createCommitmentSchema.partial();

export const listOccurrencesQuerySchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
  storeId: z.string().uuid().optional(),
  institutionId: z.string().uuid().optional(),
  assigneeUserId: z.string().uuid().optional(),
  status: enumOf(OccurrenceStatus).optional(),
});

export const excuseOccurrenceSchema = z.object({
  reason: z.string().min(3, 'Explique o motivo').max(300),
});

export const reassignOccurrenceSchema = z.object({
  /** Instituição que vai cobrir a colheita. */
  coveringInstitutionId: z.string().uuid(),
  coveringUserId: z.string().uuid().optional().nullable(),
  reason: z.string().max(300).optional().nullable(),
});

// --------------------------------------------------------------------------
// Harvest
// --------------------------------------------------------------------------

export const createHarvestSchema = z.object({
  /** Quando vem da escala, amarra na ocorrência e dá baixa nela. */
  occurrenceId: z.string().uuid().optional().nullable(),
  storeId: z.string().uuid(),
  institutionId: z.string().uuid(),
  harvestTypeId: z.string().uuid(),
  harvestedOn: dateOnlySchema,
  harvestedAt: timeOfDaySchema.optional().nullable(),
  weightKg: z.coerce
    .number()
    .positive('O peso precisa ser maior que zero')
    .max(100000, 'Peso acima do limite — confira o valor'),
  /** "Informe alguns dos alimentos MAIS colhidos" — pergunta do formulário atual. */
  mainFoods: z.string().max(500).optional().nullable(),
  photoPath: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  /** Só coordenação usa: lançar em nome de outra pessoa. */
  collectorUserId: z.string().uuid().optional().nullable(),
});
export type CreateHarvestInput = z.infer<typeof createHarvestSchema>;

export const updateHarvestSchema = createHarvestSchema.partial();

export const listHarvestsQuerySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  storeId: z.string().uuid().optional(),
  institutionId: z.string().uuid().optional(),
  collectorUserId: z.string().uuid().optional(),
  harvestTypeId: z.string().uuid().optional(),
  source: enumOf(HarvestSource).optional(),
  /** Assina as URLs das fotos — só peça quando a tela for exibi-las. */
  withPhotos: z.coerce.boolean().optional(),
  /** Só as colheitas que têm foto anexada. */
  onlyWithPhoto: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

// --------------------------------------------------------------------------
// Compliance / Reporting
// --------------------------------------------------------------------------

export const complianceWeekQuerySchema = z.object({
  /** Segunda-feira da semana desejada. */
  weekStart: dateOnlySchema,
  onlyPending: z.coerce.boolean().default(false),
});

export const periodQuerySchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
  })
  .refine((v) => v.from <= v.to, { message: 'A data inicial precisa ser anterior à final' });

export const calendarQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

// --------------------------------------------------------------------------
// Notifications
// --------------------------------------------------------------------------

export const dispatchScheduleSchema = z.object({
  date: dateOnlySchema.optional(),
  channel: enumOf(NotificationChannel).default(NotificationChannel.WHATSAPP),
});

export const notificationLogQuerySchema = z.object({
  kind: enumOf(NotificationKind).optional(),
  status: z.string().optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const ALL_ROLES = USER_ROLES;
