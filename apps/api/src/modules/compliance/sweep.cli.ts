import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ComplianceService } from './application/compliance.service';
import { NotificationsService } from '../notifications/application/notifications.service';

/**
 * Varre as pendências de um dia: o que estava planejado, passou do corte e não
 * teve colheita registrada vira PENDENTE, e a cobrança entra na fila.
 *
 *   npm run compliance:sweep                 # hoje (só age depois do corte)
 *   npm run compliance:sweep -- 2026-08-01   # um dia específico
 *   npm run compliance:sweep -- 2026-08-01 --enviar
 *
 * Existe para o dia em que o container estiver fora do ar no horário do corte
 * — sem isso, aquele dia ficaria sem cobrança para sempre.
 */
async function main(): Promise<void> {
  const logger = new Logger('Varredura');
  const args = process.argv.slice(2);
  const data = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const enviar = args.includes('--enviar');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const compliance = app.get(ComplianceService);
    const resultado = await compliance.sweep(data);

    logger.log(
      `\n──────── VARREDURA DE PENDÊNCIA ────────\n` +
        `  Dia:                      ${resultado.date}\n` +
        `  Marcadas como pendentes:  ${resultado.markedPending}\n` +
        `  Cobranças na fila:        ${resultado.alertsQueued}\n` +
        `  Sem telefone para avisar: ${resultado.skippedWithoutPhone}`,
    );

    if (resultado.markedPending === 0 && resultado.alertsQueued === 0) {
      logger.warn(
        'Nada foi marcado. Os motivos possíveis, em ordem de probabilidade:\n' +
          '  1. Ainda não deu o horário do corte para este dia (veja COMPLIANCE_CUTOFF_TIME).\n' +
          '  2. Não há ocorrências materializadas nesta data.\n' +
          '  3. Todas já foram cumpridas, justificadas ou já estavam pendentes.',
      );
    }

    if (enviar && resultado.alertsQueued > 0) {
      const entrega = await app.get(NotificationsService).flushQueue();
      logger.log(`Entrega: ${entrega.sent} enviada(s), ${entrega.failed} falha(s).`);
    } else if (resultado.alertsQueued > 0) {
      logger.log('As cobranças ficaram na fila. Use --enviar para entregar agora.');
    }
  } catch (error) {
    logger.error('A varredura falhou.', error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
