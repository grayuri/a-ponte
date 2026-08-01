import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../domain/domain-error';

/**
 * Único lugar do sistema que traduz erro para HTTP. Mantém os módulos de
 * domínio livres de `@nestjs/common`.
 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      res.status(exception.getStatus()).json(
        typeof body === 'string'
          ? { code: 'ERRO', message: body }
          : body,
      );
      return;
    }

    if (exception instanceof DomainError) {
      res.status(this.statusFor(exception)).json({
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = this.mapPrisma(exception);
      if (mapped) {
        res.status(mapped.status).json({ code: mapped.code, message: mapped.message });
        return;
      }
    }

    this.logger.error(
      'Erro não tratado',
      exception instanceof Error ? exception.stack : String(exception),
    );

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 'ERRO_INTERNO',
      message: 'Algo deu errado do nosso lado. Tente novamente em instantes.',
    });
  }

  private statusFor(error: DomainError): number {
    if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
    if (error instanceof ConflictError) return HttpStatus.CONFLICT;
    if (error instanceof ForbiddenError) return HttpStatus.FORBIDDEN;
    if (error instanceof ValidationError) return HttpStatus.BAD_REQUEST;
    if (error instanceof BusinessRuleError) return HttpStatus.UNPROCESSABLE_ENTITY;
    return HttpStatus.BAD_REQUEST;
  }

  private mapPrisma(
    error: Prisma.PrismaClientKnownRequestError,
  ): { status: number; code: string; message: string } | null {
    switch (error.code) {
      case 'P2002': {
        const target = (error.meta?.target as string[] | undefined)?.join(', ') ?? 'campo';
        return {
          status: HttpStatus.CONFLICT,
          code: 'CONFLITO',
          message: `Já existe um registro com o mesmo ${target}.`,
        };
      }
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          code: 'CONFLITO',
          message: 'Este registro está referenciado por outros e não pode ser removido.',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          code: 'NAO_ENCONTRADO',
          message: 'Registro não encontrado.',
        };
      default:
        return null;
    }
  }
}
