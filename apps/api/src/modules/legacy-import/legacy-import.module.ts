import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { LegacyImportService } from './application/legacy-import.service';

/**
 * Importação do histórico. Não expõe controller: é operação de linha de
 * comando, feita uma vez pela coordenação com o arquivo em mãos. Deixar isso
 * atrás de uma rota HTTP seria abrir uma porta que ninguém precisa.
 */
@Module({
  imports: [IdentityModule],
  providers: [LegacyImportService],
  exports: [LegacyImportService],
})
export class LegacyImportModule {}
