import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createUserSchema,
  listUsersQuerySchema,
  resolveIdentifierSchema,
  updateUserSchema,
  type CreateUserInput,
  type UpdateUserInput,
} from '@a-ponte/contracts';
import { z } from 'zod';
import { zodPipe } from '../../../shared/interface/zod-validation.pipe';
import type { AuthenticatedUser } from '../domain/authenticated-user';
import { UsersService } from '../application/users.service';
import { CurrentUser, Public, Roles } from './auth.guard';

const resetPasswordSchema = z.object({ password: z.string().min(6) });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe sua senha atual'),
  newPassword: z.string().min(6, 'A nova senha precisa ter ao menos 6 caracteres'),
});

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Ponte entre "usuário ou e-mail" e o login por e-mail do Supabase.
   * Pública por necessidade — ainda não há sessão quando é chamada.
   */
  @Public()
  @Post('auth/resolve-identifier')
  resolveIdentifier(@Body(zodPipe(resolveIdentifierSchema)) body: { identifier: string }) {
    return this.users.resolveIdentifier(body.identifier);
  }

  @Get('auth/me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.users.me(user.id);
  }

  /** Qualquer pessoa troca a própria senha, informando a atual. */
  @Post('auth/change-password')
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(changePasswordSchema)) body: { currentPassword: string; newPassword: string },
  ) {
    await this.users.changeOwnPassword(user, body.currentPassword, body.newPassword);
    return { ok: true };
  }

  @Get('users')
  @Roles('ADMIN', 'COORDENADOR', 'INSTITUICAO')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodPipe(listUsersQuerySchema)) query: z.infer<typeof listUsersQuerySchema>,
  ) {
    return this.users.list(user, {
      search: query.search,
      role: query.role as never,
      institutionId: query.institutionId,
      status: query.status as never,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Post('users')
  @Roles('ADMIN', 'COORDENADOR', 'INSTITUICAO')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(createUserSchema)) body: CreateUserInput,
  ) {
    return this.users.create(user, body);
  }

  @Patch('users/:id')
  @Roles('ADMIN', 'COORDENADOR', 'INSTITUICAO')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(zodPipe(updateUserSchema)) body: UpdateUserInput,
  ) {
    return this.users.update(user, id, body);
  }

  @Post('users/:id/password')
  @Roles('ADMIN', 'COORDENADOR', 'INSTITUICAO')
  async resetPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(zodPipe(resetPasswordSchema)) body: { password: string },
  ) {
    await this.users.resetPassword(user, id, body.password);
    return { ok: true };
  }

  @Delete('users/:id')
  @Roles('ADMIN', 'COORDENADOR')
  async deactivate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.users.deactivate(user, id);
    return { ok: true };
  }
}
