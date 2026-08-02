import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ComplianceModule } from '../compliance/compliance.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OutboxDispatcherModule } from '../outbox-dispatcher/outbox-dispatcher.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { SchedulerService } from './scheduler.service';

/**
 * Scheduler — orquestra, não decide.
 *
 * Toda regra vive nos módulos de domínio; aqui só existe "quando". É o que
 * permite acionar exatamente os mesmos fluxos pela rota manual, para testar
 * ou para a coordenação forçar um disparo.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    SchedulingModule,
    NotificationsModule,
    ComplianceModule,
    OutboxDispatcherModule,
  ],
  providers: [SchedulerService],
})
export class SchedulerModule {}
