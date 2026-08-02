import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import type { AppEnv } from '../../config/env.config';
import { ComplianceService } from '../compliance/application/compliance.service';
import { NotificationsService } from '../notifications/application/notifications.service';
import { OutboxDispatcherService } from '../outbox-dispatcher/application/outbox-dispatcher.service';
import { OccurrenceMaterializerService } from '../scheduling/application/occurrence-materializer.service';

/**
 * O relógio da operação. Substitui o "todo domingo e toda quarta eu lembro de
 * mandar a escala" e o "no fim do dia eu confiro quem não preencheu".
 *
 * Os horários vêm do ambiente e rodam no fuso da operação (America/Fortaleza),
 * não no do servidor — um container em UTC no Render dispararia a escala às
 * 3h30 da manhã se isso não fosse explícito.
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly config: ConfigService<AppEnv, true>,
    private readonly registry: SchedulerRegistry,
    private readonly materializer: OccurrenceMaterializerService,
    private readonly notifications: NotificationsService,
    private readonly compliance: ComplianceService,
    private readonly outbox: OutboxDispatcherService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get('SCHEDULER_ENABLED', { infer: true })) {
      this.logger.warn(
        'SCHEDULER_ENABLED=false — nenhum job automático foi registrado. ' +
          'Os disparos continuam disponíveis nas rotas manuais.',
      );
      return;
    }

    const tz = this.config.get('APP_TIMEZONE', { infer: true });
    const dispatchTime = this.config.get('SCHEDULE_DISPATCH_TIME', { infer: true });
    const cutoffTime = this.config.get('COMPLIANCE_CUTOFF_TIME', { infer: true });

    // Materialização meia hora antes do disparo: a escala do dia precisa
    // existir como ocorrência para que a mensagem tenha o que citar.
    this.register('materializar-escala', this.cronFor(this.minutesBefore(dispatchTime, 30)), tz, async () => {
      await this.materializer.materializeHorizon();
    });

    this.register('disparar-escala-do-dia', this.cronFor(dispatchTime), tz, async () => {
      const result = await this.notifications.queueDailySchedule();
      this.logger.log(
        `Escala de ${result.date}: ${result.queued} mensagem(ns) na fila para ${result.recipients} destinatário(s), ` +
          `${result.skipped} sem telefone.`,
      );
      await this.notifications.flushQueue();
    });

    this.register('varredura-de-pendencia', this.cronFor(cutoffTime), tz, async () => {
      const result = await this.compliance.sweep();
      this.logger.log(
        `Corte de ${result.date}: ${result.markedPending} pendência(s), ${result.alertsQueued} cobrança(s).`,
      );
      await this.notifications.flushQueue();
    });

    // A fila é drenada de dez em dez minutos para que uma falha momentânea do
    // provedor de WhatsApp não segure a mensagem até o dia seguinte.
    //
    // O outbox vai junto e ANTES: é ele que transforma um remanejamento em
    // aviso para a instituição que assumiu. Drenar a fila primeiro deixaria
    // esse aviso esperando mais dez minutos sem motivo.
    this.register('drenar-fila', '*/10 * * * *', tz, async () => {
      await this.outbox.dispatchPending();
      await this.notifications.flushQueue();
    });

    // Resumo da semana para a coordenação, segunda de manhã, sobre a semana
    // que acabou de fechar.
    this.register('resumo-semanal', `0 ${Number(dispatchTime.split(':')[0]) + 1} * * 1`, tz, async () => {
      const resultado = await this.notifications.queueWeeklySummary();
      this.logger.log(
        `Resumo semanal: ${resultado.queued} mensagem(ns) para ${resultado.recipients} destinatário(s).`,
      );
      await this.notifications.flushQueue();
    });

    this.logger.log(
      `Jobs registrados (${tz}): escala às ${dispatchTime}, corte às ${cutoffTime}, fila a cada 10 min.`,
    );
  }

  private register(name: string, cronTime: string, timeZone: string, task: () => Promise<void>): void {
    const job = new CronJob(
      cronTime,
      () => {
        void task().catch((error) => {
          // Um job que estoura não pode derrubar o processo nem se calar:
          // o erro precisa aparecer no log do container.
          this.logger.error(
            `Job "${name}" falhou`,
            error instanceof Error ? error.stack : String(error),
          );
        });
      },
      null,
      false,
      timeZone,
    );

    this.registry.addCronJob(name, job as never);
    job.start();
  }

  private cronFor(time: string): string {
    const [hour, minute] = time.split(':');
    return `${Number(minute)} ${Number(hour)} * * *`;
  }

  private minutesBefore(time: string, minutes: number): string {
    const [h, m] = time.split(':').map(Number);
    const total = ((h ?? 0) * 60 + (m ?? 0) - minutes + 1440) % 1440;
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }
}
