import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { LegacyImportService, type ImportReport } from './application/legacy-import.service';

/**
 * Traz o histórico da planilha para o banco.
 *
 *   npm run import:legacy -- "../../Contexts/RELATORIO COLHEITAS 2026 v5.xlsx"
 *   npm run import:legacy -- "<arquivo.xlsx>" --schedule    (só a aba ESCALA)
 *   npm run import:legacy -- "<arquivo.xlsx>" --all         (histórico + escala)
 *
 * É seguro rodar de novo: cada linha da planilha vira um `externalRef` único,
 * e a segunda execução conta as repetidas em vez de duplicar registro.
 */
async function main(): Promise<void> {
  const logger = new Logger('Importação');
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith('--'));

  if (!filePath) {
    logger.error(
      'Informe o caminho do arquivo .xlsx.\n' +
        '  Exemplo: npm run import:legacy -- "../../Contexts/RELATORIO COLHEITAS 2026 v5.xlsx"',
    );
    process.exit(1);
  }

  const onlySchedule = args.includes('--schedule');
  const all = args.includes('--all');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const importer = app.get(LegacyImportService);
    const reports: ImportReport[] = [];

    if (!onlySchedule) {
      logger.log('Lendo a aba RESPOSTA FORMULÁRIOS…');
      reports.push(await importer.importHarvests(filePath));
    }

    if (onlySchedule || all) {
      logger.log('Lendo a aba ESCALA…');
      reports.push(await importer.importSchedule(filePath));
    }

    for (const report of reports) {
      logger.log(
        `\n──────── ${report.sheet} ────────\n` +
          `  Linhas lidas:            ${report.rowsRead}\n` +
          `  Importadas:              ${report.imported}\n` +
          `  Já existiam (ignoradas): ${report.skippedDuplicate}\n` +
          `  Inválidas:               ${report.skippedInvalid}\n` +
          `  Lojas criadas:           ${report.storesCreated}\n` +
          `  Instituições criadas:    ${report.institutionsCreated}\n` +
          `  Tipos criados:           ${report.harvestTypesCreated}`,
      );

      if (report.warnings.length) {
        logger.warn(
          `\nPontos de atenção (${report.warnings.length}) — nada foi conciliado automaticamente:\n` +
            report.warnings
              .slice(0, 40)
              .map((w) => `  • ${w}`)
              .join('\n') +
            (report.warnings.length > 40
              ? `\n  … e mais ${report.warnings.length - 40}.`
              : ''),
        );
      }
    }

    logger.log('\nImportação concluída.');
  } catch (error) {
    logger.error(
      'A importação falhou.',
      error instanceof Error ? error.stack : String(error),
    );
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main();
