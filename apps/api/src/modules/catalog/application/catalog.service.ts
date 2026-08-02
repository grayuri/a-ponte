import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ChainView,
  CreateInstitutionInput,
  CreateStoreInput,
  HarvestTypeView,
  InstitutionView,
  StoreView,
} from '@a-ponte/contracts';
import { BusinessRuleError, NotFoundError } from '../../../shared/domain/domain-error';
import { AuditService } from '../../../shared/infrastructure/audit.service';
import { PrismaService } from '../../../shared/infrastructure/prisma.service';

const storeInclude = { chain: { select: { name: true } } } satisfies Prisma.StoreInclude;
type StoreRow = Prisma.StoreGetPayload<{ include: typeof storeInclude }>;

/**
 * Catálogo — redes, lojas, instituições e tipos de colheita.
 *
 * Este módulo é o que aposenta as abas DE-PARA. Enquanto loja e instituição
 * eram texto digitado, "São Luiz - DEL PASSEO" e "São Luiz - DEL PASEO" eram
 * dois lugares diferentes para o computador e o mesmo lugar para as pessoas.
 * Aqui existe um id, e o texto é só rótulo.
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- redes

  async listChains(): Promise<ChainView[]> {
    const rows = await this.prisma.retailChain.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { stores: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      notes: row.notes,
      storeCount: row._count.stores,
    }));
  }

  async createChain(actorId: string, input: { name: string; notes?: string | null }) {
    const created = await this.prisma.retailChain.create({
      data: { name: input.name.trim(), notes: input.notes ?? null },
    });
    await this.audit.record({
      actorId,
      action: 'REDE_CRIADA',
      entity: 'RetailChain',
      entityId: created.id,
      after: created,
    });
    return created;
  }

  // ---------------------------------------------------------------- lojas

  async listStores(params: { includeInactive?: boolean; chainId?: string } = {}): Promise<StoreView[]> {
    const rows = await this.prisma.store.findMany({
      where: {
        ...(params.includeInactive ? {} : { active: true }),
        ...(params.chainId ? { chainId: params.chainId } : {}),
      },
      include: storeInclude,
      orderBy: [{ chain: { name: 'asc' } }, { name: 'asc' }, { shiftLabel: 'asc' }],
    });

    return rows.map((row) => this.toStoreView(row));
  }

  async getStore(id: string): Promise<StoreView> {
    const row = await this.prisma.store.findUnique({ where: { id }, include: storeInclude });
    if (!row) throw new NotFoundError('Loja', id);
    return this.toStoreView(row);
  }

  async createStore(actorId: string, input: CreateStoreInput): Promise<StoreView> {
    await this.assertChainExists(input.chainId);

    const created = await this.prisma.store.create({
      data: {
        chainId: input.chainId,
        name: input.name.trim(),
        shiftLabel: input.shiftLabel?.trim() || null,
        city: input.city ?? null,
        address: input.address ?? null,
        active: input.active,
      },
      include: storeInclude,
    });

    await this.audit.record({
      actorId,
      action: 'LOJA_CRIADA',
      entity: 'Store',
      entityId: created.id,
      after: { name: created.name, shiftLabel: created.shiftLabel },
    });

    return this.toStoreView(created);
  }

  async updateStore(
    actorId: string,
    id: string,
    input: Partial<CreateStoreInput>,
  ): Promise<StoreView> {
    const before = await this.prisma.store.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Loja', id);
    if (input.chainId) await this.assertChainExists(input.chainId);

    const updated = await this.prisma.store.update({
      where: { id },
      data: {
        chainId: input.chainId,
        name: input.name?.trim(),
        shiftLabel: input.shiftLabel === undefined ? undefined : input.shiftLabel?.trim() || null,
        city: input.city === undefined ? undefined : input.city,
        address: input.address === undefined ? undefined : input.address,
        active: input.active,
      },
      include: storeInclude,
    });

    await this.audit.record({
      actorId,
      action: 'LOJA_ATUALIZADA',
      entity: 'Store',
      entityId: id,
      before: { name: before.name, active: before.active },
      after: { name: updated.name, active: updated.active },
    });

    return this.toStoreView(updated);
  }

  /**
   * Loja não se apaga: ela tem histórico de colheita amarrado. Desativar tira
   * das listas e impede novos compromissos, preservando os relatórios do ano.
   */
  async deactivateStore(actorId: string, id: string): Promise<void> {
    const activeCommitments = await this.prisma.scheduleCommitment.count({
      where: { storeId: id, status: 'ATIVO' },
    });

    if (activeCommitments > 0) {
      throw new BusinessRuleError(
        `Esta loja ainda tem ${activeCommitments} compromisso(s) ativo(s) na escala. ` +
          'Encerre ou realoque os compromissos antes de desativá-la.',
      );
    }

    await this.prisma.store.update({ where: { id }, data: { active: false } });
    await this.audit.record({
      actorId,
      action: 'LOJA_DESATIVADA',
      entity: 'Store',
      entityId: id,
    });
  }

  // --------------------------------------------------------- instituições

  async listInstitutions(includeInactive = false): Promise<InstitutionView[]> {
    const rows = await this.prisma.institution.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true } } },
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      shortName: row.shortName,
      contactName: row.contactName,
      phone: row.phone,
      city: row.city,
      address: row.address,
      active: row.active,
      memberCount: row._count.members,
    }));
  }

  async createInstitution(
    actorId: string,
    input: CreateInstitutionInput,
  ): Promise<InstitutionView> {
    const created = await this.prisma.institution.create({
      data: {
        name: input.name.trim(),
        shortName: input.shortName?.trim() || null,
        contactName: input.contactName ?? null,
        phone: input.phone ?? null,
        city: input.city ?? null,
        address: input.address ?? null,
        active: input.active,
      },
      include: { _count: { select: { members: true } } },
    });

    await this.audit.record({
      actorId,
      action: 'INSTITUICAO_CRIADA',
      entity: 'Institution',
      entityId: created.id,
      after: { name: created.name },
    });

    return {
      id: created.id,
      name: created.name,
      shortName: created.shortName,
      contactName: created.contactName,
      phone: created.phone,
      city: created.city,
      address: created.address,
      active: created.active,
      memberCount: created._count.members,
    };
  }

  async updateInstitution(
    actorId: string,
    id: string,
    input: Partial<CreateInstitutionInput>,
  ): Promise<InstitutionView> {
    const before = await this.prisma.institution.findUnique({ where: { id } });
    if (!before) throw new NotFoundError('Instituição', id);

    const updated = await this.prisma.institution.update({
      where: { id },
      data: {
        name: input.name?.trim(),
        shortName: input.shortName === undefined ? undefined : input.shortName?.trim() || null,
        contactName: input.contactName === undefined ? undefined : input.contactName,
        phone: input.phone === undefined ? undefined : input.phone,
        city: input.city === undefined ? undefined : input.city,
        address: input.address === undefined ? undefined : input.address,
        active: input.active,
      },
      include: { _count: { select: { members: true } } },
    });

    await this.audit.record({
      actorId,
      action: 'INSTITUICAO_ATUALIZADA',
      entity: 'Institution',
      entityId: id,
      before: { name: before.name, active: before.active },
      after: { name: updated.name, active: updated.active },
    });

    return {
      id: updated.id,
      name: updated.name,
      shortName: updated.shortName,
      contactName: updated.contactName,
      phone: updated.phone,
      city: updated.city,
      address: updated.address,
      active: updated.active,
      memberCount: updated._count.members,
    };
  }

  /**
   * Instituição também não se apaga: ela é o destino de colheitas históricas.
   * A guarda é mais severa que a da loja — se a instituição sai, alguém precisa
   * assumir as colheitas dela, senão a escala fica com um destino fantasma.
   */
  async deactivateInstitution(actorId: string, id: string): Promise<void> {
    const existing = await this.prisma.institution.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!existing) throw new NotFoundError('Instituição', id);

    const [compromissos, membros] = await Promise.all([
      this.prisma.scheduleCommitment.count({ where: { institutionId: id, status: 'ATIVO' } }),
      this.prisma.user.count({ where: { institutionId: id, status: 'ATIVO' } }),
    ]);

    if (compromissos > 0) {
      throw new BusinessRuleError(
        `"${existing.name}" ainda responde por ${compromissos} compromisso(s) na escala. ` +
          'Passe esses compromissos para outra instituição antes de desativá-la — ' +
          'do contrário a escala ficaria com um destino sem dono.',
      );
    }

    if (membros > 0) {
      throw new BusinessRuleError(
        `"${existing.name}" ainda tem ${membros} pessoa(s) ativa(s) vinculada(s). ` +
          'Desative ou realoque essas pessoas primeiro.',
      );
    }

    await this.prisma.institution.update({ where: { id }, data: { active: false } });
    await this.audit.record({
      actorId,
      action: 'INSTITUICAO_DESATIVADA',
      entity: 'Institution',
      entityId: id,
      before: { name: existing.name, active: true },
    });
  }

  // ---------------------------------------------------- tipos de colheita

  async listHarvestTypes(includeInactive = false): Promise<HarvestTypeView[]> {
    const rows = await this.prisma.harvestType.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ order: 'asc' }, { label: 'asc' }],
    });
    return rows.map((r) => ({ id: r.id, code: r.code, label: r.label, active: r.active }));
  }

  /** Usado pelo importador e pelos seeds — resolve por código, não por rótulo. */
  async harvestTypeIdByCode(code: string): Promise<string> {
    const row = await this.prisma.harvestType.findUnique({ where: { code } });
    if (!row) throw new NotFoundError('Tipo de colheita', code);
    return row.id;
  }

  // -------------------------------------------------------------- helpers

  private async assertChainExists(id: string): Promise<void> {
    const found = await this.prisma.retailChain.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundError('Rede', id);
  }

  private toStoreView(row: StoreRow): StoreView {
    return {
      id: row.id,
      chainId: row.chainId,
      chainName: row.chain.name,
      name: row.name,
      displayName: row.shiftLabel ? `${row.name} (${row.shiftLabel})` : row.name,
      city: row.city,
      address: row.address,
      shiftLabel: row.shiftLabel,
      active: row.active,
    };
  }
}
