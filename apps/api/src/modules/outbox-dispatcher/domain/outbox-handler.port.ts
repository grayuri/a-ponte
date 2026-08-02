/**
 * Um tratador de evento de domínio.
 *
 * O outbox garante que o evento foi gravado na mesma transação do dado; o
 * tratador é quem faz o efeito colateral acontecer depois. Como pode ser
 * reexecutado (falha de rede, container reiniciado no meio), TODO tratador
 * precisa ser idempotente — no caso das notificações, quem garante isso é a
 * `dedupeKey`.
 */
export interface OutboxHandler {
  readonly eventName: string;
  handle(payload: Record<string, unknown>): Promise<void>;
}

export const OUTBOX_HANDLERS = Symbol('OUTBOX_HANDLERS');
