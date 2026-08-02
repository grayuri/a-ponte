import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../../config/env.config';
import type {
  DeliveryResult,
  GatewayStatus,
  MessageGateway,
  OutboundMessage,
} from '../domain/message-gateway.port';

/**
 * Adaptador do Z-API para WhatsApp.
 *
 * Diferente do caminho oficial em dois pontos que importam para esta operação:
 *
 * 1. ENVIA PARA GRUPO. O `phone` aceita tanto um número quanto o id de um
 *    grupo, o que permite continuar postando a escala nos grupos que já
 *    existem — sem depender de coletar o telefone das 125 instituições antes
 *    de começar.
 *
 * 2. NÃO TEM JANELA DE 24H NEM TEMPLATE. O texto vai como foi escrito, e
 *    ajustar a redação não passa por aprovação de ninguém.
 *
 * Em troca, é uma sessão do WhatsApp Web mantida por engenharia reversa: ela
 * cai sozinha e o número pode ser bloqueado pela Meta. Por isso este adaptador
 * expõe `status()` — sem isso, uma sessão caída faria a escala não sair numa
 * manhã e ninguém descobriria até as instituições reclamarem.
 */
@Injectable()
export class ZapiMessageGateway implements MessageGateway {
  readonly name = 'z-api';
  readonly supportsGroups = true;

  private readonly logger = new Logger(ZapiMessageGateway.name);

  private readonly instanceId: string;
  private readonly instanceToken: string;
  private readonly clientToken?: string;
  private readonly delaySeconds: number;
  private readonly dryRun: boolean;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    this.instanceId = this.config.get('ZAPI_INSTANCE_ID', { infer: true }) ?? '';
    this.instanceToken = this.config.get('ZAPI_INSTANCE_TOKEN', { infer: true }) ?? '';
    this.clientToken = this.config.get('ZAPI_CLIENT_TOKEN', { infer: true });
    this.delaySeconds = this.config.get('ZAPI_DELAY_SECONDS', { infer: true });
    this.dryRun = this.config.get('NOTIFICATIONS_DRY_RUN', { infer: true });
  }

  private get baseUrl(): string {
    return `https://api.z-api.io/instances/${this.instanceId}/token/${this.instanceToken}`;
  }

  private get headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      // Obrigatório desde que o Z-API passou a exigir token de segurança da
      // conta, separado do token da instância. Sem ele a resposta é 403.
      ...(this.clientToken ? { 'client-token': this.clientToken } : {}),
    };
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    const destino = this.normalizarDestino(message.to);

    if (this.dryRun) {
      this.logger.warn(
        `DRY RUN — nada foi enviado. Destino: ${destino}` +
          `${this.ehGrupo(destino) ? ' (grupo)' : ''}. ` +
          'Desligue NOTIFICATIONS_DRY_RUN para enviar de verdade.',
      );
      return { delivered: true, providerMessageId: 'dry-run' };
    }

    try {
      const resposta = await fetch(`${this.baseUrl}/send-text`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify({
          phone: destino,
          message: message.body,
          // Pausa que o próprio Z-API aplica antes de entregar. Rajada de
          // mensagens idênticas é o padrão que mais atrai bloqueio da Meta.
          ...(this.delaySeconds > 0 ? { delayMessage: this.delaySeconds } : {}),
        }),
        signal: AbortSignal.timeout(20_000),
      });

      const dados = (await resposta.json().catch(() => ({}))) as {
        messageId?: string;
        zaapId?: string;
        error?: string;
        message?: string;
      };

      if (!resposta.ok) {
        return {
          delivered: false,
          error: this.explicarErro(resposta.status, dados.error ?? dados.message),
        };
      }

      return { delivered: true, providerMessageId: dados.messageId ?? dados.zaapId };
    } catch (error) {
      return {
        delivered: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async status(): Promise<GatewayStatus> {
    if (!this.instanceId || !this.instanceToken) {
      return { connected: false, detail: 'Instância não configurada.' };
    }

    try {
      const resposta = await fetch(`${this.baseUrl}/status`, {
        headers: this.headers,
        signal: AbortSignal.timeout(10_000),
      });

      const dados = (await resposta.json().catch(() => ({}))) as {
        connected?: boolean;
        smartphoneConnected?: boolean;
        error?: string;
      };

      if (!resposta.ok) {
        return {
          connected: false,
          detail: this.explicarErro(resposta.status, dados.error),
        };
      }

      if (dados.connected === false) {
        return {
          connected: false,
          detail:
            'A instância está desconectada. Leia o QR Code no painel do Z-API para reconectar — ' +
            'enquanto isso, nenhuma mensagem sai.',
        };
      }

      // A sessão do WhatsApp Web depende do celular estar online. Se o
      // aparelho ficar dias sem rede, a sessão morre.
      if (dados.smartphoneConnected === false) {
        return {
          connected: true,
          detail:
            'Conectado, mas o celular do número está offline. Se ficar assim por muito tempo, ' +
            'a sessão cai.',
        };
      }

      return { connected: true };
    } catch (error) {
      return {
        connected: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Z-API espera só dígitos com DDI: `5585999998888`. Nossos telefones estão
   * em E.164 (`+5585999998888`), e ids de grupo têm formato próprio e passam
   * intactos.
   */
  private normalizarDestino(destino: string): string {
    const texto = destino.trim();
    if (this.ehGrupo(texto)) return texto;
    return texto.replace(/\D/g, '');
  }

  /** Ids de grupo do WhatsApp carregam o sufixo `-group` ou o domínio `@g.us`. */
  private ehGrupo(destino: string): boolean {
    return destino.includes('-group') || destino.includes('@g.us');
  }

  private explicarErro(status: number, mensagem: string | undefined): string {
    const cru = `Z-API ${status}: ${mensagem ?? 'erro desconhecido'}`;

    if (status === 403) {
      return `${cru}. Token recusado — confira ZAPI_CLIENT_TOKEN (o token de segurança da conta, diferente do token da instância).`;
    }
    if (status === 404) {
      return `${cru}. Instância não encontrada — confira ZAPI_INSTANCE_ID e ZAPI_INSTANCE_TOKEN.`;
    }
    if (status === 405 || /disconnected|not connected/i.test(mensagem ?? '')) {
      return `${cru}. A instância está desconectada. Leia o QR Code no painel do Z-API para reconectar.`;
    }
    if (/exists|invalid.*phone|number.*not/i.test(mensagem ?? '')) {
      return `${cru}. O destino não tem WhatsApp, ou o número está mal formatado (esperado: DDI + DDD + número).`;
    }

    return cru;
  }
}
