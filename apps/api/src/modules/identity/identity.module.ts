import { Module } from '@nestjs/common';
import { UsersService } from './application/users.service';
import { SupabaseAdminService } from './infrastructure/supabase-admin.service';
import { SupabaseTokenVerifier } from './infrastructure/supabase-token.verifier';
import { UsersController } from './interface/users.controller';

/**
 * Identity — quem é quem e o que cada um pode.
 *
 * Exporta UsersService e SupabaseAdminService porque outros módulos precisam
 * resolver destinatários de notificação e assinar URLs de foto. Não exporta
 * repositório: ninguém de fora escreve na tabela de usuários.
 */
@Module({
  controllers: [UsersController],
  providers: [UsersService, SupabaseAdminService, SupabaseTokenVerifier],
  exports: [UsersService, SupabaseAdminService, SupabaseTokenVerifier],
})
export class IdentityModule {}
