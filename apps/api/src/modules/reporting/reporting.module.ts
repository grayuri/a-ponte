import { Module } from '@nestjs/common';
import { ReportingService } from './application/reporting.service';
import { ReportingController } from './interface/reporting.controller';

/** Reporting — só leitura. Nenhum comando de negócio passa por aqui. */
@Module({
  controllers: [ReportingController],
  providers: [ReportingService],
  exports: [ReportingService],
})
export class ReportingModule {}
