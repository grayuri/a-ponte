import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { ComplianceService } from './application/compliance.service';
import { ComplianceController } from './interface/compliance.controller';

/**
 * Compliance depende de Notifications (aplicação → aplicação, nunca banco →
 * banco). Notifications não conhece Compliance — não há ciclo.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
