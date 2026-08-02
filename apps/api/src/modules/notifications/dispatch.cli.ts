import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { NotificationsService } from './application/notifications.service';

/**
 * Monta e entrega as mensagens do dia, sem precisar da API no ar nem de token.
 *
 *   npm run notifications:dispatch                 # escala de hoje
 *   npm run notifications:dispatch -- 2026-08-03   # escala de outro dia
 *   npm run notifications:dispatch -- --pendencias # cobrança de quem não deu baixa
 *
 * Com NOTIFICATIONS_DRIVER=console (padrão), nada sai para fora: as mensagens
 * são montadas, gravadas e impressas no log, para a coordenação conferir o
 * texto antes de escolher o provedor de WhatsApp.
 */
async function main(): Promise<void> {
  const logger = new Logger('Disparo');
  const args = process.argv.slice(2);
  const data = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const pendencias = args.includes('--pendencias');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const notifications = app.get(NotificationsService);
    const gateway = await notifications.gatewayInfo();

    logger.log(
      `Canal: ${gateway.driver}${gateway.dryRun ? ' (modo seco — nada sai para fora)' : ''}`,
    );

    if (gateway.connected === false) {
      logger.error(
        `Sessão do WhatsApp indisponível: ${gateway.connectionDetail ?? 'motivo não informado'}\n` +
          '  As mensagens vão ser montadas e ficar na fila, mas nenhuma sai enquanto isso não for resolvido.',
      );
    }

    const resultado = pendencias
      ? await notifications.queuePendingAlerts(data)
      : await notifications.queueDailySchedule(data);

    logger.log(
      `\n──────── ${pendencias ? 'COBRANÇA DE PENDÊNCIA' : 'ESCALA DO DIA'} ────────\n` +
        `  Data:                    ${resultado.date}\n` +
        `  Destinatários:           ${resultado.recipients}\n` +
        `  Mensagens na fila:       ${resultado.queued}\n` +
        `  Sem telefone para avisar: ${resultado.skipped}`,
    );

    if (resultado.skipped > 0 && resultado.recipients === 0) {
      logger.warn(
        'Ninguém tem telefone cadastrado, então não há para onde mandar. ' +
          'Preencha o WhatsApp das instituições em Cadastros, ou aponte uma pessoa ' +
          'responsável nos compromissos da Escala.',
      );
    }

    if (resultado.queued > 0) {
      const entrega = await notifications.flushQueue();
      logger.log(`Entrega: ${entrega.sent} enviada(s), ${entrega.failed} falha(s).`);
    }
  } catch (error) {
    logger.error('O disparo falhou.', error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
