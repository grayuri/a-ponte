import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export interface DomainEventInput {
  aggregate: string;
  aggregateId: string;
  eventName: string;
  payload: Prisma.InputJsonValue;
}

/**
 * Outbox transacional.
 *
 * O problema concreto: quando uma colheita é registrada, precisamos dar baixa
 * na ocorrência e cancelar a cobrança pendente. Se isso virasse uma chamada
 * direta ao módulo de notificações, uma falha lá derrubaria o registro da
 * colheita — e o colhedor, no meio do supermercado com sinal ruim, perderia
 * o preenchimento. Gravando o evento na MESMA transação do dado, o registro
 * sempre completa e o efeito colateral é entregue depois.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Publica dentro de uma transação em andamento. */
  async publishIn(
    tx: Prisma.TransactionClient,
    event: DomainEventInput,
  ): Promise<void> {
    await tx.outboxEvent.create({ data: event });
  }

  async publish(event: DomainEventInput): Promise<void> {
    await this.prisma.outboxEvent.create({ data: event });
  }

  /** Eventos ainda não processados, mais antigos primeiro. */
  async pending(limit = 100) {
    return this.prisma.outboxEvent.findMany({
      where: { processedAt: null, attempts: { lt: 5 } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async markProcessed(id: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { processedAt: new Date(), error: null },
    });
  }

  async markFailed(id: string, error: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { attempts: { increment: 1 }, error: error.slice(0, 1000) },
    });
    this.logger.warn(`Evento ${id} falhou: ${error}`);
  }
}
