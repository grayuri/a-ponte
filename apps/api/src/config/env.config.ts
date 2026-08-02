import { z } from 'zod';

/**
 * Validação de ambiente na subida. Um .env incompleto derruba o processo aqui,
 * com mensagem legível, em vez de virar `undefined` no meio de um disparo de
 * WhatsApp às 6h30 da manhã.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  API_GLOBAL_PREFIX: z.string().default('api'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),

  SUPABASE_URL: z.string().url('SUPABASE_URL precisa ser uma URL válida'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY é obrigatória'),
  SUPABASE_JWT_SECRET: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('colheitas'),

  APP_TIMEZONE: z.string().default('America/Fortaleza'),
  COMPLIANCE_CUTOFF_TIME: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('20:00'),
  SCHEDULE_DISPATCH_TIME: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).default('06:30'),
  SCHEDULE_HORIZON_DAYS: z.coerce.number().int().min(1).max(120).default(14),
  SCHEDULER_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  NOTIFICATIONS_DRIVER: z.enum(['console', 'webhook', 'twilio']).default('console'),
  NOTIFICATIONS_WEBHOOK_URL: z.string().optional(),
  NOTIFICATIONS_WEBHOOK_TOKEN: z.string().optional(),

  // Twilio — Console > Account Info
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  /** Remetente WhatsApp em E.164, sem o prefixo `whatsapp:`. */
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  /** Alternativa ao FROM, quando se usa um Messaging Service. */
  TWILIO_MESSAGING_SERVICE_SID: z.string().optional(),
  /**
   * Content SIDs dos templates aprovados pela Meta, por tipo de mensagem.
   * Sem eles, só dá para responder dentro da janela de 24h.
   */
  TWILIO_CONTENT_SID_ESCALA: z.string().optional(),
  TWILIO_CONTENT_SID_COBRANCA: z.string().optional(),
  TWILIO_CONTENT_SID_COBERTURA: z.string().optional(),
  TWILIO_CONTENT_SID_RESUMO: z.string().optional(),
  /** URL que o Twilio chama com o status de entrega (opcional). */
  TWILIO_STATUS_CALLBACK_URL: z.string().optional(),
  NOTIFICATIONS_DRY_RUN: z
    .string()
    .default('true')
    .transform((v) => v === 'true' || v === '1'),

  PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
});

export type AppEnv = z.infer<typeof envSchema> & { corsOrigins: string[] };

export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const detalhes = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${detalhes}`);
  }

  const env = parsed.data;

  if (env.NOTIFICATIONS_DRIVER === 'webhook' && !env.NOTIFICATIONS_WEBHOOK_URL) {
    throw new Error(
      'NOTIFICATIONS_DRIVER=webhook exige NOTIFICATIONS_WEBHOOK_URL. ' +
        'Aponte para o seu gateway de WhatsApp (Evolution API, n8n, etc.).',
    );
  }

  if (env.NOTIFICATIONS_DRIVER === 'twilio') {
    const faltando: string[] = [];
    if (!env.TWILIO_ACCOUNT_SID) faltando.push('TWILIO_ACCOUNT_SID');
    if (!env.TWILIO_AUTH_TOKEN) faltando.push('TWILIO_AUTH_TOKEN');
    if (!env.TWILIO_WHATSAPP_FROM && !env.TWILIO_MESSAGING_SERVICE_SID) {
      faltando.push('TWILIO_WHATSAPP_FROM (ou TWILIO_MESSAGING_SERVICE_SID)');
    }

    if (faltando.length) {
      throw new Error(
        `NOTIFICATIONS_DRIVER=twilio exige: ${faltando.join(', ')}.\n` +
          '  SID e token em Console > Account Info; o remetente em Messaging > Senders.',
      );
    }
  }

  return {
    ...env,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
