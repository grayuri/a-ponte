import { Global, Module } from '@nestjs/common';
import { AuditService } from './infrastructure/audit.service';
import { OutboxService } from './infrastructure/outbox.service';
import { PrismaService } from './infrastructure/prisma.service';

/**
 * Shared kernel: infraestrutura que todo módulo pode usar (banco, outbox,
 * auditoria). Note que aqui NÃO entra nada de negócio — módulos falam entre si
 * por portas e eventos, nunca pelo repositório do vizinho.
 */
@Global()
@Module({
  providers: [PrismaService, OutboxService, AuditService],
  exports: [PrismaService, OutboxService, AuditService],
})
export class SharedModule {}
