import { Module } from '@nestjs/common';
import { OccurrenceMaterializerService } from './application/occurrence-materializer.service';
import { OccurrencesService } from './application/occurrences.service';
import { SchedulingService } from './application/scheduling.service';
import { SchedulingController } from './interface/scheduling.controller';

/**
 * Scheduling — a escala como regra recorrente e como fatos datados.
 *
 * Exporta os serviços que compliance, notifications e harvest consomem;
 * nenhum deles toca as tabelas de escala diretamente.
 */
@Module({
  controllers: [SchedulingController],
  providers: [SchedulingService, OccurrencesService, OccurrenceMaterializerService],
  exports: [SchedulingService, OccurrencesService, OccurrenceMaterializerService],
})
export class SchedulingModule {}
