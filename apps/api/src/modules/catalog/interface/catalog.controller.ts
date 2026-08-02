import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createChainSchema,
  createInstitutionSchema,
  createStoreSchema,
  type CreateInstitutionInput,
  type CreateStoreInput,
} from '@a-ponte/contracts';
import { zodPipe } from '../../../shared/interface/zod-validation.pipe';
import { CurrentUser, Roles } from '../../identity/interface/auth.guard';
import type { AuthenticatedUser } from '../../identity/domain/authenticated-user';
import { CatalogService } from '../application/catalog.service';

const toBool = (v: unknown) => v === 'true' || v === true;

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  // Leitura é liberada a qualquer usuário autenticado: o colhedor precisa da
  // lista de lojas e instituições para registrar a colheita.

  @Get('chains')
  listChains() {
    return this.catalog.listChains();
  }

  @Post('chains')
  @Roles('ADMIN', 'COORDENADOR')
  createChain(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(createChainSchema)) body: { name: string; notes?: string | null },
  ) {
    return this.catalog.createChain(user.id, body);
  }

  @Get('stores')
  listStores(
    @Query('includeInactive') includeInactive?: string,
    @Query('chainId') chainId?: string,
  ) {
    return this.catalog.listStores({ includeInactive: toBool(includeInactive), chainId });
  }

  @Get('stores/:id')
  getStore(@Param('id') id: string) {
    return this.catalog.getStore(id);
  }

  @Post('stores')
  @Roles('ADMIN', 'COORDENADOR')
  createStore(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(createStoreSchema)) body: CreateStoreInput,
  ) {
    return this.catalog.createStore(user.id, body);
  }

  @Patch('stores/:id')
  @Roles('ADMIN', 'COORDENADOR')
  updateStore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(zodPipe(createStoreSchema.partial())) body: Partial<CreateStoreInput>,
  ) {
    return this.catalog.updateStore(user.id, id, body);
  }

  @Delete('stores/:id')
  @Roles('ADMIN', 'COORDENADOR')
  async deactivateStore(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.catalog.deactivateStore(user.id, id);
    return { ok: true };
  }

  @Get('institutions')
  listInstitutions(@Query('includeInactive') includeInactive?: string) {
    return this.catalog.listInstitutions(toBool(includeInactive));
  }

  @Post('institutions')
  @Roles('ADMIN', 'COORDENADOR')
  createInstitution(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(createInstitutionSchema)) body: CreateInstitutionInput,
  ) {
    return this.catalog.createInstitution(user.id, body);
  }

  @Patch('institutions/:id')
  @Roles('ADMIN', 'COORDENADOR')
  updateInstitution(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(zodPipe(createInstitutionSchema.partial())) body: Partial<CreateInstitutionInput>,
  ) {
    return this.catalog.updateInstitution(user.id, id, body);
  }

  @Delete('institutions/:id')
  @Roles('ADMIN', 'COORDENADOR')
  async deactivateInstitution(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.catalog.deactivateInstitution(user.id, id);
    return { ok: true };
  }

  @Get('harvest-types')
  listHarvestTypes(@Query('includeInactive') includeInactive?: string) {
    return this.catalog.listHarvestTypes(toBool(includeInactive));
  }
}
