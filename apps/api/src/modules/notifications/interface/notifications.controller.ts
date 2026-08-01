import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { dispatchScheduleSchema, notificationLogQuerySchema } from '@a-ponte/contracts';
import { z } from 'zod';
import { zodPipe } from '../../../shared/interface/zod-validation.pipe';
import { Roles } from '../../identity/interface/auth.guard';
import { NotificationsService } from '../application/notifications.service';

@Controller('notifications')
@Roles('ADMIN', 'COORDENADOR')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Mostra qual adaptador de WhatsApp está plugado e se está em modo seco. */
  @Get('gateway')
  gateway() {
    return this.notifications.gatewayInfo();
  }

  @Get()
  list(
    @Query(zodPipe(notificationLogQuerySchema)) query: z.infer<typeof notificationLogQuerySchema>,
  ) {
    return this.notifications.listLog({
      kind: query.kind as never,
      status: query.status,
      from: query.from,
      to: query.to,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /** Disparo manual da escala do dia — o mesmo que o cron faz às 6h30. */
  @Post('dispatch-schedule')
  dispatchSchedule(@Body(zodPipe(dispatchScheduleSchema)) body: { date?: string }) {
    return this.notifications.queueDailySchedule(body.date);
  }

  @Post('dispatch-pending')
  dispatchPending(@Body(zodPipe(dispatchScheduleSchema)) body: { date?: string }) {
    return this.notifications.queuePendingAlerts(body.date);
  }

  /** Entrega o que está na fila agora, sem esperar o cron. */
  @Post('flush')
  flush() {
    return this.notifications.flushQueue();
  }
}
