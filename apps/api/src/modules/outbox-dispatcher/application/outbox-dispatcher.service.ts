import { Inject, Injectable, Logger } from '@nestjs/common';
import { OutboxService } from '../../../shared/infrastructure/outbox.service';
import { OUTBOX_HANDLERS, type OutboxHandler } from '../domain/outbox-handler.port';

export interface DispatchSummary {
  lidos: number;
  processados: number;
  semTratador: number;
  falhas: number;
}

/**
 * A metade que faltava do padrão outbox.
 *
 * Até aqui o sistema gravava o evento junto com o dado — a parte que garante
 * que nada se perde — mas ninguém consumia a fila. Eventos se acumulavam e o
 * efeito colateral simplesmente não acontecia.
 *
 * Eventos sem tratador são marcados como processados de propósito: são
 * registro de auditoria (`colheita.registrada`, `ocorrencia.justificada`), não
 * trabalho pendente. Deixá-los na fila faria a tabela crescer para sempre e
 * esconderia as falhas de verdade no meio do ruído.
 */
@Injectable()
export class OutboxDispatcherService {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly porEvento: Map<string, OutboxHandler>;

  constructor(
    private readonly outbox: OutboxService,
    @Inject(OUTBOX_HANDLERS) handlers: OutboxHandler[],
  ) {
    this.porEvento = new Map(handlers.map((h) => [h.eventName, h]));
  }

  async dispatchPending(limit = 100): Promise<DispatchSummary> {
    const eventos = await this.outbox.pending(limit);
    const resumo: DispatchSummary = {
      lidos: eventos.length,
      processados: 0,
      semTratador: 0,
      falhas: 0,
    };

    for (const evento of eventos) {
      const tratador = this.porEvento.get(evento.eventName);

      if (!tratador) {
        await this.outbox.markProcessed(evento.id);
        resumo.semTratador += 1;
        continue;
      }

      try {
        await tratador.handle((evento.payload ?? {}) as Record<string, unknown>);
        await this.outbox.markProcessed(evento.id);
        resumo.processados += 1;
      } catch (error) {
        // Não interrompe o laço: um evento problemático não pode impedir a
        // entrega dos demais. Depois de 5 tentativas o `pending()` para de
        // devolvê-lo, e ele fica no banco para inspeção.
        await this.outbox.markFailed(
          evento.id,
          error instanceof Error ? error.message : String(error),
        );
        resumo.falhas += 1;
      }
    }

    if (resumo.processados || resumo.falhas) {
      this.logger.log(
        `Outbox: ${resumo.processados} processado(s), ${resumo.falhas} falha(s), ` +
          `${resumo.semTratador} sem tratador.`,
      );
    }

    return resumo;
  }
}
