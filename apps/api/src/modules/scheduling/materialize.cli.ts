import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../../app.module';
import type { AppEnv } from '../../config/env.config';
import { DateOnly } from '../../shared/domain/date-only';
import { OccurrenceMaterializerService } from './application/occurrence-materializer.service';

/**
 * Transforma a escala recorrente nos dias concretos (ocorrências).
 *
 *   npm run schedule:materialize                    # de hoje até o horizonte configurado
 *   npm run schedule:materialize -- 2026-08-01 2026-08-31
 *
 * Com o scheduler ligado isso roda sozinho todo dia, meia hora antes do
 * disparo da escala. O comando existe para o primeiro carregamento e para
 * depois de uma edição em lote da escala, quando não dá para esperar o cron.
 *
 * É idempotente: a unicidade (compromisso, data) faz a segunda execução
 * contar as existentes em vez de duplicar.
 */
async function main(): Promise<void> {
  const logger = new Logger('Materialização');
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const materializer = app.get(OccurrenceMaterializerService);
    const config = app.get(ConfigService<AppEnv, true>);
    const tz = config.get('APP_TIMEZONE', { infer: true });

    const resultado =
      args.length >= 2
        ? await materializer.materializeRange(
            DateOnly.parse(args[0]!),
            DateOnly.parse(args[1]!),
          )
        : await materializer.materializeHorizon();

    logger.log(
      `\n──────── ESCALA MATERIALIZADA ────────\n` +
        `  Período:        ${resultado.from} a ${resultado.to}\n` +
        `  Criadas:        ${resultado.created}\n` +
        `  Já existiam:    ${resultado.skipped}\n` +
        `  Fuso:           ${tz}`,
    );

    if (resultado.created === 0 && resultado.skipped === 0) {
      logger.warn(
        'Nenhuma ocorrência gerada. Verifique se existem compromissos ATIVOS na escala ' +
          'e se a janela de vigência deles cobre este período.',
      );
    }
  } catch (error) {
    logger.error(
      'A materialização falhou.',
      error instanceof Error ? error.stack : String(error),
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
