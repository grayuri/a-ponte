import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { PrismaService } from '../../../shared/infrastructure/prisma.service';
import type { AuthenticatedUser } from '../domain/authenticated-user';
import { SupabaseTokenVerifier } from '../infrastructure/supabase-token.verifier';

export const IS_PUBLIC_KEY = 'rota_publica';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = 'papeis_permitidos';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException({
        code: 'NAO_AUTENTICADO',
        message: 'Faça login para continuar.',
      });
    }
    return request.user;
  },
);

/**
 * Guard global. Valida o token do Supabase, carrega o espelho local e checa o
 * papel exigido pela rota.
 *
 * Uma conta INATIVA é barrada aqui, não no controller: quando um colhedor sai
 * da instituição, desativar é suficiente — nenhuma rota precisa lembrar disso.
 */
@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: SupabaseTokenVerifier,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException({
        code: 'NAO_AUTENTICADO',
        message: 'Faça login para continuar.',
      });
    }

    const payload = await this.verifier.verify(token);
    const subject = payload.sub;

    if (!subject) {
      throw new UnauthorizedException({
        code: 'SESSAO_INVALIDA',
        message: 'Sessão inválida. Faça login novamente.',
      });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: subject },
      select: {
        id: true,
        email: true,
        username: true,
        fullName: true,
        role: true,
        status: true,
        institutionId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: 'PERFIL_AUSENTE',
        message: 'Sua conta ainda não foi liberada. Fale com a coordenação.',
      });
    }

    if (user.status !== 'ATIVO') {
      throw new ForbiddenException({
        code: 'CONTA_INATIVA',
        message: 'Sua conta está inativa. Fale com a coordenação.',
      });
    }

    request.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      institutionId: user.institutionId,
    };

    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (required?.length && !required.includes(user.role)) {
      throw new ForbiddenException({
        code: 'SEM_PERMISSAO',
        message: 'Você não tem permissão para esta operação.',
      });
    }

    return true;
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }
}
