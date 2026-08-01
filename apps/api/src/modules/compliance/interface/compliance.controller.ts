import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { complianceWeekQuerySchema, periodQuerySchema } from '@a-ponte/contracts';
import { z } from 'zod';
import { zodPipe } from '../../../shared/interface/zod-validation.pipe';
import type { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { CurrentUser, Roles } from '../../identity/interface/auth.guard';
import { ComplianceService } from '../application/compliance.service';

const sweepSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

@Controller('compliance')
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  /** A tela "quem preencheu e quem faltou" da semana. */
  @Get('week')
  week(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodPipe(complianceWeekQuerySchema)) query: z.infer<typeof complianceWeekQuerySchema>,
  ) {
    return this.compliance.week(user, query.weekStart, query.onlyPending);
  }

  @Get('adherence')
  @Roles('ADMIN', 'COORDENADOR')
  adherence(@Query(zodPipe(periodQuerySchema)) query: { from: string; to: string }) {
    return this.compliance.adherenceByInstitution(query.from, query.to);
  }

  @Get('pending-by-weekday')
  @Roles('ADMIN', 'COORDENADOR')
  pendingByWeekday(@Query(zodPipe(periodQuerySchema)) query: { from: string; to: string }) {
    return this.compliance.pendingByWeekday(query.from, query.to);
  }

  /** Roda a varredura na hora — o mesmo que o cron faz no corte do dia. */
  @Post('sweep')
  @Roles('ADMIN', 'COORDENADOR')
  sweep(@Body(zodPipe(sweepSchema)) body: { date?: string }) {
    return this.compliance.sweep(body.date);
  }
}
