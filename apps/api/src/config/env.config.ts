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

  NOTIFICATIONS_DRIVER: z.enum(['console', 'webhook', 'zapi']).default('console'),
  NOTIFICATIONS_WEBHOOK_URL: z.string().optional(),
  NOTIFICATIONS_WEBHOOK_TOKEN: z.string().optional(),
  /**
   * Pausa entre uma mensagem e a próxima ao drenar a fila.
   *
   * Provedores não-oficiais são bloqueados por padrão de comportamento, e
   * disparar 30 mensagens parecidas em dois segundos é o padrão mais
   * denunciável que existe. Um intervalo de alguns segundos custa menos de um
   * minuto no disparo diário.
   */
  NOTIFICATIONS_THROTTLE_MS: z.coerce.number().int().min(0).max(60_000).default(3000),

  // Z-API — painel da instância
  ZAPI_INSTANCE_ID: z.string().optional(),
  ZAPI_INSTANCE_TOKEN: z.string().optional(),
  /** Token de segurança da CONTA, diferente do token da instância. */
  ZAPI_CLIENT_TOKEN: z.string().optional(),
  /** Pausa que o próprio Z-API aplica antes de entregar cada mensagem. */
  ZAPI_DELAY_SECONDS: z.coerce.number().int().min(0).max(60).default(2),
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

  if (env.NOTIFICATIONS_DRIVER === 'zapi') {
    const faltando: string[] = [];
    if (!env.ZAPI_INSTANCE_ID) faltando.push('ZAPI_INSTANCE_ID');
    if (!env.ZAPI_INSTANCE_TOKEN) faltando.push('ZAPI_INSTANCE_TOKEN');
    if (!env.ZAPI_CLIENT_TOKEN) faltando.push('ZAPI_CLIENT_TOKEN');

    if (faltando.length) {
      throw new Error(
        `NOTIFICATIONS_DRIVER=zapi exige: ${faltando.join(', ')}.\n` +
          '  ID e token da instância ficam no painel da instância; o CLIENT_TOKEN é o token\n' +
          '  de segurança da CONTA (Z-API > Segurança), e é outro valor.',
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
