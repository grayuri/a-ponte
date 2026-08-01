import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../../config/env.config';
import type {
  DeliveryResult,
  MessageGateway,
  OutboundMessage,
} from '../domain/message-gateway.port';

/**
 * Adaptador genérico por webhook: faz POST do payload num endpoint HTTP seu.
 *
 * Serve para plugar qualquer provedor sem escrever código novo aqui —
 * Evolution API, n8n, Make, uma função Supabase, um script próprio. Se
 * amanhã a escolha for a Cloud API oficial da Meta, o mesmo webhook aponta
 * para um pequeno tradutor de template e nada muda no domínio.
 *
 * NOTIFICATIONS_DRY_RUN=true segura o envio mesmo com o webhook configurado —
 * é a trava para testar em produção sem acordar ninguém às 6h30.
 */
@Injectable()
export class WebhookMessageGateway implements MessageGateway {
  readonly name = 'webhook';
  readonly supportsGroups = true;

  private readonly logger = new Logger(WebhookMessageGateway.name);
  private readonly url: string;
  private readonly token?: string;
  private readonly dryRun: boolean;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    this.url = this.config.get('NOTIFICATIONS_WEBHOOK_URL', { infer: true }) ?? '';
    this.token = this.config.get('NOTIFICATIONS_WEBHOOK_TOKEN', { infer: true });
    this.dryRun = this.config.get('NOTIFICATIONS_DRY_RUN', { infer: true });
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    if (this.dryRun) {
      this.logger.warn(
        `DRY RUN — nada foi enviado. Destino: ${message.to}. ` +
          'Desligue NOTIFICATIONS_DRY_RUN para enviar de verdade.',
      );
      return { delivered: true, providerMessageId: 'dry-run' };
    }

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          to: message.to,
          body: message.body,
          metadata: message.metadata ?? {},
        }),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          delivered: false,
          error: `Gateway respondeu ${response.status}: ${text.slice(0, 300)}`,
        };
      }

      const payload = (await response.json().catch(() => ({}))) as { id?: string };
      return { delivered: true, providerMessageId: payload.id };
    } catch (error) {
      return {
        delivered: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
