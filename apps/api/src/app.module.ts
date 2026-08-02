import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { validateEnv } from './config/env.config';
import { CatalogModule } from './modules/catalog/catalog.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { HarvestModule } from './modules/harvest/harvest.module';
import { IdentityModule } from './modules/identity/identity.module';
import { SupabaseAuthGuard } from './modules/identity/interface/auth.guard';
import { LegacyImportModule } from './modules/legacy-import/legacy-import.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OutboxDispatcherModule } from './modules/outbox-dispatcher/outbox-dispatcher.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { SchedulingModule } from './modules/scheduling/scheduling.module';
import { HealthController } from './shared/interface/health.controller';
import { SharedModule } from './shared/shared.module';

/**
 * Monolito modular.
 *
 * Um processo, um banco, um deploy — e fronteiras reais entre os módulos.
 * Cada um tem domain / application / interface próprios e só conversa com o
 * vizinho pelo serviço de aplicação exportado. Nenhum módulo lê a tabela do
 * outro. Se um dia algum deles precisar sair para um serviço próprio, a
 * costura já está no lugar certo — mas hoje isso seria custo sem benefício,
 * como você mesmo pediu.
 *
 * Direção das dependências (sem ciclos):
 *   scheduler  → compliance → notifications → scheduling
 *   harvest    → identity
 *   reporting  → (só leitura)
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env', '../../.env'],
    }),
    SharedModule,

    IdentityModule,
    CatalogModule,
    SchedulingModule,
    HarvestModule,
    NotificationsModule,
    ComplianceModule,
    ReportingModule,
    OutboxDispatcherModule,
    LegacyImportModule,
    SchedulerModule,
  ],
  controllers: [HealthController],
  providers: [
    // Autenticação por padrão: uma rota nova nasce protegida.
    // Abrir exige @Public() explícito.
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
  ],
})
export class AppModule {}
