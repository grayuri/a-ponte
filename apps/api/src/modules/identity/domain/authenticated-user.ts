import { UserRole } from '@prisma/client';

/** O usuário resolvido a partir do JWT do Supabase + espelho local. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: UserRole;
  institutionId: string | null;
}

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  ADMIN: 40,
  COORDENADOR: 30,
  INSTITUICAO: 20,
  COLHEDOR: 10,
};

export function hasAtLeast(user: AuthenticatedUser, role: UserRole): boolean {
  return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[role];
}

/** Coordenação enxerga a rede inteira; instituição e colhedor, só o seu pedaço. */
export function seesWholeNetwork(user: AuthenticatedUser): boolean {
  return user.role === 'ADMIN' || user.role === 'COORDENADOR';
}
