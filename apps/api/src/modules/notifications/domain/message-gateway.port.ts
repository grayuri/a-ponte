/**
 * A porta de saída de mensagens.
 *
 * O domínio inteiro conhece só esta interface. Trocar de Evolution API para a
 * Cloud API oficial da Meta, ou para Twilio, é escrever um novo adaptador e
 * mudar uma variável de ambiente — nenhuma regra de negócio muda de lugar.
 *
 * É por isso que a decisão de provedor de WhatsApp não trava o projeto: o que
 * o sistema precisa saber é QUEM avisar, DO QUÊ e QUANDO. Como o byte sai é
 * detalhe de infraestrutura.
 */
export interface OutboundMessage {
  /** Telefone E.164, e-mail ou id de grupo — o adaptador interpreta. */
  to: string;
  body: string;
  /** Contexto para adaptadores que precisam de template estruturado. */
  metadata?: Record<string, unknown>;
}

export interface DeliveryResult {
  delivered: boolean;
  /** Id da mensagem no provedor, quando houver. */
  providerMessageId?: string;
  error?: string;
}

export interface GatewayStatus {
  /** A sessão está de pé e capaz de enviar? */
  connected: boolean;
  detail?: string;
}

export interface MessageGateway {
  readonly name: string;
  send(message: OutboundMessage): Promise<DeliveryResult>;
  /** Alguns provedores enviam para grupo; a oficial da Meta, não. */
  readonly supportsGroups: boolean;
  /**
   * Estado da conexão, quando o provedor souber informar.
   *
   * Provedores não-oficiais mantêm uma sessão do WhatsApp Web que cai sozinha
   * — por queda de rede, celular desligado, ou logout remoto. Sem visibilidade
   * disso, a escala simplesmente não sai numa manhã e ninguém descobre até as
   * instituições reclamarem. Quem tem essa informação deve expô-la.
   */
  status?(): Promise<GatewayStatus>;
}

export const MESSAGE_GATEWAY = Symbol('MESSAGE_GATEWAY');
