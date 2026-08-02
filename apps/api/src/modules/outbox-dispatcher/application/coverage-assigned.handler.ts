import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../../notifications/application/notifications.service';
import type { OutboxHandler } from '../domain/outbox-handler.port';

/**
 * Quando uma colheita é remanejada, a instituição que assumiu precisa saber.
 *
 * Este é o terceiro fluxo que o Geraldo descreveu como totalmente manual:
 * "a instituição A não pode ir, quem vai? Você vai pra mais próxima". O
 * remanejamento já era registrado, mas o aviso morria no outbox porque
 * ninguém lia a fila — a instituição que assumia nunca era notificada.
 */
@Injectable()
export class CoverageAssignedHandler implements OutboxHandler {
  readonly eventName = 'ocorrencia.remanejada';

  private readonly logger = new Logger(CoverageAssignedHandler.name);

  constructor(private readonly notifications: NotificationsService) {}

  async handle(payload: Record<string, unknown>): Promise<void> {
    const occurrenceId = payload.occurrenceId as string | undefined;
    const institutionId = payload.toInstitutionId as string | undefined;

    if (!occurrenceId || !institutionId) {
      this.logger.warn(
        `Evento de remanejamento sem occurrenceId ou toInstitutionId: ${JSON.stringify(payload)}`,
      );
      return;
    }

    const enfileirada = await this.notifications.queueCoverageRequest({
      occurrenceId,
      institutionId,
    });

    if (!enfileirada) {
      // Sem telefone, ou já avisada antes. Nos dois casos não é erro — mas
      // precisa aparecer, senão a coordenação acha que a instituição foi
      // avisada e ninguém aparece na loja.
      this.logger.warn(
        `Cobertura da ocorrência ${occurrenceId} não gerou aviso para a instituição ` +
          `${institutionId}. Verifique se ela tem WhatsApp cadastrado.`,
      );
    }
  }
}
