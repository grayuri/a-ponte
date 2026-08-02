import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { CoverageAssignedHandler } from './application/coverage-assigned.handler';
import { OutboxDispatcherService } from './application/outbox-dispatcher.service';
import { OUTBOX_HANDLERS } from './domain/outbox-handler.port';

/**
 * Onde os eventos de domínio viram efeito.
 *
 * Registrar um tratador novo é escrever a classe e adicioná-la à lista abaixo.
 * Nenhum módulo emissor precisa saber que ele existe — quem publica no outbox
 * continua sem conhecer quem consome.
 */
@Module({
  imports: [NotificationsModule],
  providers: [
    CoverageAssignedHandler,
    {
      provide: OUTBOX_HANDLERS,
      inject: [CoverageAssignedHandler],
      useFactory: (cobertura: CoverageAssignedHandler) => [cobertura],
    },
    OutboxDispatcherService,
  ],
  exports: [OutboxDispatcherService],
})
export class OutboxDispatcherModule {}
