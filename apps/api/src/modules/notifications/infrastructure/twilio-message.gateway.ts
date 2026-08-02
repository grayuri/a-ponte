import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../../../config/env.config';
import type {
  DeliveryResult,
  MessageGateway,
  OutboundMessage,
} from '../domain/message-gateway.port';

/**
 * Adaptador do Twilio para WhatsApp.
 *
 * Duas restrições da plataforma moldam este código, e nenhuma delas é do
 * Twilio — são regras da Meta que qualquer provedor oficial herda:
 *
 * 1. NÃO ENVIA PARA GRUPOS. A API oficial do WhatsApp só faz conversa 1:1.
 *    Como o disparo já agrupa por pessoa (uma mensagem com todas as colheitas
 *    do dia dela), isso não quebra nada — mas significa que o hábito atual de
 *    postar a escala num grupo não se traduz para cá.
 *
 * 2. JANELA DE 24 HORAS. Fora de 24h desde a última mensagem que a PESSOA
 *    mandou, só se pode enviar template aprovado pela Meta. A escala das 6h30
 *    é exatamente esse caso: vai para gente que não escreveu nada. Por isso o
 *    adaptador manda `ContentSid` quando há um configurado para aquele tipo, e
 *    cai para texto livre quando não há — que é o que funciona no sandbox e
 *    dentro da janela.
 *
 * O erro 63016 ("failed to send freeform message because you are outside the
 * allowed window") é o sintoma de template faltando, e é tratado com mensagem
 * explícita porque o texto cru do Twilio não diz o que fazer.
 */
@Injectable()
export class TwilioMessageGateway implements MessageGateway {
  readonly name = 'twilio';
  readonly supportsGroups = false;

  private readonly logger = new Logger(TwilioMessageGateway.name);

  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly from?: string;
  private readonly messagingServiceSid?: string;
  private readonly statusCallback?: string;
  private readonly dryRun: boolean;
  private readonly contentSids: Record<string, string | undefined>;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    this.accountSid = this.config.get('TWILIO_ACCOUNT_SID', { infer: true }) ?? '';
    this.authToken = this.config.get('TWILIO_AUTH_TOKEN', { infer: true }) ?? '';
    this.from = this.config.get('TWILIO_WHATSAPP_FROM', { infer: true });
    this.messagingServiceSid = this.config.get('TWILIO_MESSAGING_SERVICE_SID', { infer: true });
    this.statusCallback = this.config.get('TWILIO_STATUS_CALLBACK_URL', { infer: true });
    this.dryRun = this.config.get('NOTIFICATIONS_DRY_RUN', { infer: true });

    this.contentSids = {
      ESCALA_DO_DIA: this.config.get('TWILIO_CONTENT_SID_ESCALA', { infer: true }),
      COBRANCA_PENDENCIA: this.config.get('TWILIO_CONTENT_SID_COBRANCA', { infer: true }),
      PEDIDO_COBERTURA: this.config.get('TWILIO_CONTENT_SID_COBERTURA', { infer: true }),
      RESUMO_SEMANAL: this.config.get('TWILIO_CONTENT_SID_RESUMO', { infer: true }),
    };
  }

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    const kind = String(message.metadata?.kind ?? '');
    const contentSid = this.contentSids[kind];

    if (this.dryRun) {
      this.logger.warn(
        `DRY RUN — nada foi enviado. Destino: ${message.to}, ` +
          `modo: ${contentSid ? `template ${contentSid}` : 'texto livre'}. ` +
          'Desligue NOTIFICATIONS_DRY_RUN para enviar de verdade.',
      );
      return { delivered: true, providerMessageId: 'dry-run' };
    }

    const corpo = new URLSearchParams();
    corpo.set('To', this.paraWhatsapp(message.to));

    if (this.messagingServiceSid) {
      corpo.set('MessagingServiceSid', this.messagingServiceSid);
    } else if (this.from) {
      corpo.set('From', this.paraWhatsapp(this.from));
    }

    if (contentSid) {
      corpo.set('ContentSid', contentSid);
      const variaveis = this.variaveisDoTemplate(message);
      if (variaveis) corpo.set('ContentVariables', variaveis);
    } else {
      corpo.set('Body', message.body);
    }

    if (this.statusCallback) corpo.set('StatusCallback', this.statusCallback);

    try {
      const resposta = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
            'content-type': 'application/x-www-form-urlencoded',
          },
          body: corpo.toString(),
          signal: AbortSignal.timeout(20_000),
        },
      );

      const dados = (await resposta.json().catch(() => ({}))) as {
        sid?: string;
        status?: string;
        code?: number;
        message?: string;
      };

      if (!resposta.ok) {
        return { delivered: false, error: this.explicarErro(dados.code, dados.message, kind) };
      }

      // `queued`/`accepted` significam que o Twilio aceitou, não que chegou.
      // A confirmação real vem pelo StatusCallback, quando configurado.
      return { delivered: true, providerMessageId: dados.sid };
    } catch (error) {
      return {
        delivered: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /** Twilio exige o canal no endereço: `whatsapp:+5585999999999`. */
  private paraWhatsapp(numero: string): string {
    const limpo = numero.trim();
    return limpo.startsWith('whatsapp:') ? limpo : `whatsapp:${limpo}`;
  }

  /**
   * Variáveis posicionais do template aprovado.
   *
   * O disparo grava `templateVars` no payload da notificação justamente para
   * isso: um template da Meta é texto fixo com lacunas numeradas, não um
   * bloco livre. Mandar a mensagem inteira numa única lacuna seria reprovado
   * na revisão da Meta.
   */
  private variaveisDoTemplate(message: OutboundMessage): string | null {
    const vars = message.metadata?.templateVars as Record<string, string> | undefined;
    if (!vars || Object.keys(vars).length === 0) return null;
    return JSON.stringify(vars);
  }

  private explicarErro(code: number | undefined, mensagem: string | undefined, kind: string): string {
    const cru = `Twilio ${code ?? '?'}: ${mensagem ?? 'erro desconhecido'}`;

    switch (code) {
      case 63016:
        return (
          `${cru}. Esta mensagem saiu fora da janela de 24 horas e o tipo "${kind}" não tem ` +
          'template aprovado configurado. Crie o template no Twilio (Messaging > Content ' +
          'Template Builder), aprove na Meta e preencha o Content SID correspondente no .env.'
        );
      case 63003:
        return `${cru}. O número de destino não tem WhatsApp, ou não aceitou receber deste remetente.`;
      case 63007:
        return `${cru}. O remetente (TWILIO_WHATSAPP_FROM) não é um número WhatsApp válido na sua conta.`;
      case 21211:
        return `${cru}. Número de destino inválido — confira se está em E.164 (+5585...).`;
      case 20003:
        return `${cru}. Credenciais recusadas: confira TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN.`;
      case 63018:
        return `${cru}. Limite de envio da conta atingido. As mensagens ficam na fila e são reenviadas.`;
      default:
        return cru;
    }
  }
}
