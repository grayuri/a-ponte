import { Module } from '@nestjs/common';
import { CatalogService } from './application/catalog.service';
import { CatalogController } from './interface/catalog.controller';

/** Catálogo: o vocabulário compartilhado da operação (lojas, instituições, tipos). */
@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
