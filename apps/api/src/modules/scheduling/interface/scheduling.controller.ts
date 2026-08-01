import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createCommitmentSchema,
  excuseOccurrenceSchema,
  listOccurrencesQuerySchema,
  reassignOccurrenceSchema,
  updateCommitmentSchema,
  type CreateCommitmentInput,
} from '@a-ponte/contracts';
import { z } from 'zod';
import { DateOnly } from '../../../shared/domain/date-only';
import { zodPipe } from '../../../shared/interface/zod-validation.pipe';
import type { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { CurrentUser, Roles } from '../../identity/interface/auth.guard';
import { OccurrenceMaterializerService } from '../application/occurrence-materializer.service';
import { OccurrencesService } from '../application/occurrences.service';
import { SchedulingService } from '../application/scheduling.service';

const closeSchema = z.object({ note: z.string().max(300).optional() });
const cancelSchema = z.object({ reason: z.string().min(3).max(300) });
const materializeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

@Controller()
export class SchedulingController {
  constructor(
    private readonly scheduling: SchedulingService,
    private readonly occurrences: OccurrencesService,
    private readonly materializer: OccurrenceMaterializerService,
  ) {}

  // ------------------------------------------------------- escala (regra)

  @Get('schedule/commitments')
  listCommitments(
    @Query('weekday') weekday?: string,
    @Query('storeId') storeId?: string,
    @Query('institutionId') institutionId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.scheduling.list({
      weekday: weekday !== undefined && weekday !== '' ? Number(weekday) : undefined,
      storeId,
      institutionId,
      includeInactive: includeInactive === 'true',
    });
  }

  @Get('schedule/board')
  board(@CurrentUser() user: AuthenticatedUser) {
    return this.scheduling.weeklyBoard(user);
  }

  @Get('schedule/commitments/:id')
  getCommitment(@Param('id') id: string) {
    return this.scheduling.get(id);
  }

  @Post('schedule/commitments')
  @Roles('ADMIN', 'COORDENADOR')
  createCommitment(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(createCommitmentSchema)) body: CreateCommitmentInput,
  ) {
    return this.scheduling.create(user, body);
  }

  @Patch('schedule/commitments/:id')
  @Roles('ADMIN', 'COORDENADOR')
  updateCommitment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(zodPipe(updateCommitmentSchema)) body: Partial<CreateCommitmentInput>,
  ) {
    return this.scheduling.update(user, id, body);
  }

  @Delete('schedule/commitments/:id')
  @Roles('ADMIN', 'COORDENADOR')
  async closeCommitment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(zodPipe(closeSchema)) body: { note?: string },
  ) {
    await this.scheduling.close(user, id, body.note);
    return { ok: true };
  }

  @Post('schedule/materialize')
  @Roles('ADMIN', 'COORDENADOR')
  materialize(@Body(zodPipe(materializeSchema)) body: { from: string; to: string }) {
    return this.materializer.materializeRange(DateOnly.parse(body.from), DateOnly.parse(body.to));
  }

  // ------------------------------------------------- ocorrências (o dia a dia)

  @Get('occurrences')
  listOccurrences(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodPipe(listOccurrencesQuerySchema)) query: z.infer<typeof listOccurrencesQuerySchema>,
  ) {
    return this.occurrences.list(user, {
      from: query.from,
      to: query.to,
      storeId: query.storeId,
      institutionId: query.institutionId,
      assigneeUserId: query.assigneeUserId,
      status: query.status as never,
    });
  }

  /** A tela inicial do colhedor: "hoje é seu dia". */
  @Get('occurrences/my-day')
  myDay(@CurrentUser() user: AuthenticatedUser, @Query('date') date?: string) {
    return this.occurrences.myDay(user, date);
  }

  @Get('occurrences/:id')
  getOccurrence(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.occurrences.get(user, id);
  }

  @Get('occurrences/:id/coverage-candidates')
  coverageCandidates(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.occurrences.coverageCandidates(user, id);
  }

  @Post('occurrences/:id/excuse')
  excuse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(zodPipe(excuseOccurrenceSchema)) body: { reason: string },
  ) {
    return this.occurrences.excuse(user, id, body.reason);
  }

  @Post('occurrences/:id/reassign')
  reassign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(zodPipe(reassignOccurrenceSchema))
    body: { coveringInstitutionId: string; coveringUserId?: string | null; reason?: string | null },
  ) {
    return this.occurrences.reassign(user, id, body);
  }

  @Post('occurrences/:id/cancel')
  @Roles('ADMIN', 'COORDENADOR')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(zodPipe(cancelSchema)) body: { reason: string },
  ) {
    return this.occurrences.cancel(user, id, body.reason);
  }
}
