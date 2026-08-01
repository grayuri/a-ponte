import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createHarvestSchema,
  listHarvestsQuerySchema,
  updateHarvestSchema,
  type CreateHarvestInput,
} from '@a-ponte/contracts';
import { z } from 'zod';
import { zodPipe } from '../../../shared/interface/zod-validation.pipe';
import type { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { CurrentUser, Roles } from '../../identity/interface/auth.guard';
import { HarvestService } from '../application/harvest.service';

@Controller('harvests')
export class HarvestController {
  constructor(private readonly harvests: HarvestService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodPipe(listHarvestsQuerySchema)) query: z.infer<typeof listHarvestsQuerySchema>,
  ) {
    return this.harvests.list(user, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.harvests.get(user, id);
  }

  /**
   * A foto sobe direto do celular para o Storage do Supabase, com a sessão do
   * próprio colhedor (pasta <uid>/), e só o caminho chega aqui. Evita trafegar
   * o arquivo duas vezes numa conexão de supermercado.
   */
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(createHarvestSchema)) body: CreateHarvestInput,
  ) {
    return this.harvests.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(zodPipe(updateHarvestSchema)) body: Partial<CreateHarvestInput>,
  ) {
    return this.harvests.update(user, id, body);
  }

  @Delete(':id')
  @Roles('ADMIN', 'COORDENADOR')
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.harvests.remove(user, id);
    return { ok: true };
  }
}
