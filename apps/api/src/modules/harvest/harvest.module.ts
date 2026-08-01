import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { HarvestService } from './application/harvest.service';
import { HarvestController } from './interface/harvest.controller';

/** Harvest — o registro da colheita, que substitui o Google Forms. */
@Module({
  imports: [IdentityModule],
  controllers: [HarvestController],
  providers: [HarvestService],
  exports: [HarvestService],
})
export class HarvestModule {}
