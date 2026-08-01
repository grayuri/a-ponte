import { Injectable } from '@nestjs/common';
import { Prisma, UserRole, UserStatus } from '@prisma/client';
import type {
  CreateUserInput,
  CurrentUserView,
  Paginated,
  UpdateUserInput,
  UserView,
} from '@a-ponte/contracts';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../../shared/domain/domain-error';
import { AuditService } from '../../../shared/infrastructure/audit.service';
import { PrismaService } from '../../../shared/infrastructure/prisma.service';
import type { AuthenticatedUser } from '../domain/authenticated-user';
import { SupabaseAdminService } from '../infrastructure/supabase-admin.service';

const userSelect = {
  id: true,
  fullName: true,
  username: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  institutionId: true,
  createdAt: true,
  institution: { select: { name: true } },
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseAdminService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Login por usuário OU e-mail: o Supabase só entende e-mail, então o frontend
   * pergunta aqui qual e-mail corresponde ao identificador digitado e só então
   * chama signInWithPassword.
   *
   * Devolve sempre 200, mesmo quando não encontra: responder "usuário não
   * existe" transforma esta rota pública num verificador de contas.
   */
  async resolveIdentifier(identifier: string): Promise<{ email: string | null }> {
    const value = identifier.trim().toLowerCase();

    const user = await this.prisma.user.findFirst({
      where: { OR: [{ username: value }, { email: value }] },
      select: { email: true, status: true },
    });

    if (!user || user.status !== 'ATIVO') return { email: null };
    return { email: user.email };
  }

  async me(userId: string): Promise<CurrentUserView> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: userSelect });
    if (!user) throw new NotFoundError('Usuário', userId);
    return this.toCurrentUserView(user);
  }

  async list(
    actor: AuthenticatedUser,
    query: {
      search?: string;
      role?: UserRole;
      institutionId?: string;
      status?: UserStatus;
      page: number;
      pageSize: number;
    },
  ): Promise<Paginated<UserView>> {
    const where: Prisma.UserWhereInput = {};

    // Quem responde por uma instituição só enxerga a própria equipe.
    if (actor.role === 'INSTITUICAO') {
      where.institutionId = actor.institutionId ?? '00000000-0000-0000-0000-000000000000';
    } else if (query.institutionId) {
      where.institutionId = query.institutionId;
    }

    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { fullName: { contains: term, mode: 'insensitive' } },
        { username: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ status: 'asc' }, { fullName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    const stats = await this.harvestStats(rows.map((r) => r.id));

    return {
      items: rows.map((row) => ({
        ...this.toCurrentUserView(row),
        createdAt: row.createdAt.toISOString(),
        harvestCount: stats.get(row.id)?.count ?? 0,
        lastHarvestOn: stats.get(row.id)?.last ?? null,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async create(actor: AuthenticatedUser, input: CreateUserInput): Promise<CurrentUserView> {
    const username = input.username.trim().toLowerCase();
    const email = input.email.trim().toLowerCase();

    // Quem gerencia uma instituição sempre cadastra dentro da própria casa,
    // ainda que o formulário venha sem o vínculo preenchido.
    const institutionId =
      actor.role === 'INSTITUICAO' ? actor.institutionId : (input.institutionId ?? null);

    await this.assertIdentifiersFree(username, email);
    this.assertCanAssignRole(actor, input.role, institutionId);

    if (input.role === 'INSTITUICAO' && !institutionId) {
      throw new BusinessRuleError(
        'Um usuário do tipo Instituição precisa estar vinculado a uma instituição.',
      );
    }

    if (institutionId) await this.assertInstitutionExists(institutionId);

    const authUserId = await this.supabase.createAuthUser({
      email,
      password: input.password,
      fullName: input.fullName.trim(),
      username,
    });

    try {
      const created = await this.prisma.user.create({
        data: {
          id: authUserId,
          fullName: input.fullName.trim(),
          username,
          email,
          phone: input.phone ?? null,
          role: input.role as UserRole,
          institutionId,
          status: 'ATIVO',
        },
        select: userSelect,
      });

      await this.audit.record({
        actorId: actor.id,
        action: 'USUARIO_CRIADO',
        entity: 'User',
        entityId: created.id,
        after: { username, email, role: input.role },
      });

      return this.toCurrentUserView(created);
    } catch (error) {
      // A conta no Supabase já existe: sem isso, sobra um órfão que impede
      // recriar o usuário com o mesmo e-mail.
      await this.supabase.deleteAuthUser(authUserId);
      throw error;
    }
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateUserInput,
  ): Promise<CurrentUserView> {
    const existing = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!existing) throw new NotFoundError('Usuário', id);

    if (input.role) this.assertCanAssignRole(actor, input.role, input.institutionId ?? null);
    if (input.institutionId) await this.assertInstitutionExists(input.institutionId);

    const username = input.username?.trim().toLowerCase();
    const email = input.email?.trim().toLowerCase();

    if (username && username !== existing.username) {
      const clash = await this.prisma.user.findUnique({ where: { username } });
      if (clash) throw new ConflictError(`O usuário "${username}" já está em uso.`);
    }

    if (email && email !== existing.email) {
      const clash = await this.prisma.user.findUnique({ where: { email } });
      if (clash) throw new ConflictError(`O e-mail "${email}" já está em uso.`);
      await this.supabase.updateEmail(id, email);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: input.fullName?.trim(),
        username,
        email,
        phone: input.phone === undefined ? undefined : input.phone,
        role: input.role as UserRole | undefined,
        status: input.status as UserStatus | undefined,
        institutionId: input.institutionId === undefined ? undefined : input.institutionId,
      },
      select: userSelect,
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'USUARIO_ATUALIZADO',
      entity: 'User',
      entityId: id,
      before: { role: existing.role, status: existing.status },
      after: { role: updated.role, status: updated.status },
    });

    return this.toCurrentUserView(updated);
  }

  async resetPassword(actor: AuthenticatedUser, id: string, password: string): Promise<void> {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundError('Usuário', id);

    await this.supabase.updatePassword(id, password);
    await this.audit.record({
      actorId: actor.id,
      action: 'SENHA_REDEFINIDA',
      entity: 'User',
      entityId: id,
    });
  }

  /**
   * Desativa em vez de apagar. Um colhedor que saiu ainda é o autor de centenas
   * de registros históricos — apagar quebraria a rastreabilidade que motivou
   * dar login a todo mundo.
   */
  async deactivate(actor: AuthenticatedUser, id: string): Promise<void> {
    if (id === actor.id) {
      throw new BusinessRuleError('Você não pode desativar a própria conta.');
    }

    await this.prisma.user.update({ where: { id }, data: { status: 'INATIVO' } });
    await this.audit.record({
      actorId: actor.id,
      action: 'USUARIO_DESATIVADO',
      entity: 'User',
      entityId: id,
    });
  }

  /** Usado pelo módulo de notificações para achar quem avisar. */
  async findRecipientsByIds(ids: string[]) {
    if (!ids.length) return [];
    return this.prisma.user.findMany({
      where: { id: { in: ids }, status: 'ATIVO' },
      select: { id: true, fullName: true, phone: true, email: true },
    });
  }

  private async harvestStats(ids: string[]) {
    if (!ids.length) return new Map<string, { count: number; last: string | null }>();

    const grouped = await this.prisma.harvest.groupBy({
      by: ['collectorUserId'],
      where: { collectorUserId: { in: ids } },
      _count: { _all: true },
      _max: { harvestedOn: true },
    });

    return new Map(
      grouped
        .filter((g): g is typeof g & { collectorUserId: string } => g.collectorUserId !== null)
        .map((g) => [
          g.collectorUserId,
          {
            count: g._count._all,
            last: g._max.harvestedOn?.toISOString().slice(0, 10) ?? null,
          },
        ]),
    );
  }

  private async assertIdentifiersFree(username: string, email: string): Promise<void> {
    const clash = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { username: true, email: true },
    });

    if (clash?.username === username) throw new ConflictError(`O usuário "${username}" já está em uso.`);
    if (clash) throw new ConflictError(`O e-mail "${email}" já está em uso.`);
  }

  private async assertInstitutionExists(id: string): Promise<void> {
    const found = await this.prisma.institution.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundError('Instituição', id);
  }

  /**
   * Um responsável de instituição pode cadastrar os colhedores dele — e só isso.
   * Sem essa trava, quem gerencia uma instituição poderia se promover a admin.
   */
  private assertCanAssignRole(
    actor: AuthenticatedUser,
    role: string,
    institutionId: string | null,
  ): void {
    if (actor.role === 'ADMIN') return;

    if (actor.role === 'COORDENADOR') {
      if (role === 'ADMIN') {
        throw new BusinessRuleError('Apenas um administrador pode criar outro administrador.');
      }
      return;
    }

    if (actor.role === 'INSTITUICAO') {
      if (role !== 'COLHEDOR') {
        throw new BusinessRuleError('Você só pode cadastrar colhedores da sua instituição.');
      }
      if (institutionId && institutionId !== actor.institutionId) {
        throw new BusinessRuleError('Você só pode cadastrar pessoas na sua própria instituição.');
      }
      return;
    }

    throw new BusinessRuleError('Você não tem permissão para gerenciar usuários.');
  }

  private toCurrentUserView(row: UserRow): CurrentUserView {
    return {
      id: row.id,
      fullName: row.fullName,
      username: row.username,
      email: row.email,
      phone: row.phone,
      role: row.role,
      status: row.status,
      institutionId: row.institutionId,
      institutionName: row.institution?.name ?? null,
    };
  }
}
