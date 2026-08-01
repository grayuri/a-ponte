import { Injectable, Logger } from '@nestjs/common';
import type {
  DeliveryResult,
  MessageGateway,
  OutboundMessage,
} from '../domain/message-gateway.port';

/**
 * Adaptador padrão: não envia nada para fora.
 *
 * Ele existe para que todo o fluxo — escala do dia, cobrança de pendência,
 * pedido de cobertura — possa ser exercitado de ponta a ponta antes de decidir
 * o provedor de WhatsApp. A mensagem fica gravada na tabela `notifications`
 * com o texto exato que sairia, e aparece no log. A coordenação consegue ler,
 * conferir e aprovar o conteúdo sem risco de disparar para 233 pessoas.
 */
@Injectable()
export class ConsoleMessageGateway implements MessageGateway {
  readonly name = 'console';
  readonly supportsGroups = true;

  private readonly logger = new Logger('Mensagem (simulação)');

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    this.logger.log(
      `\n──────── PARA: ${message.to} ────────\n${message.body}\n────────────────────────────────`,
    );
    return { delivered: true, providerMessageId: `simulado-${Date.now()}` };
  }
}
