import { redirect } from 'next/navigation';
import type { CurrentUserView } from '@a-ponte/contracts';
import { ApiError, api } from '@/lib/api';
import { sair } from '../login/actions';
import { Navegacao } from './navegacao';

const PAPEL_ROTULO: Record<string, string> = {
  ADMIN: 'Administração',
  COORDENADOR: 'Coordenação',
  INSTITUICAO: 'Instituição',
  COLHEDOR: 'Colhedor(a)',
};

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  let usuario: CurrentUserView;

  try {
    usuario = await api<CurrentUserView>('/auth/me', { revalidate: false });
  } catch (error) {
    // Sessão válida no Supabase mas sem perfil liberado no sistema, ou token
    // expirado: manda para o login em vez de mostrar uma tela quebrada.
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      redirect('/login');
    }
    throw error;
  }

  return (
    <div className="app">
      <header className="topo">
        <div className="marca">
          Rede Colheita
          <span>Projeto Colheita · A Ponte</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="usuario">
            <div style={{ fontWeight: 600 }}>{usuario.fullName}</div>
            <div>
              {PAPEL_ROTULO[usuario.role] ?? usuario.role}
              {usuario.institutionName ? ` · ${usuario.institutionName}` : ''}
            </div>
          </div>

          <form action={sair}>
            <button type="submit" data-variante="secundario" data-variante-2="pequeno"
              style={{ minHeight: 36, padding: '0.4rem 0.7rem', fontSize: '0.82rem' }}>
              Sair
            </button>
          </form>
        </div>
      </header>

      <Navegacao papel={usuario.role} />

      <main>{children}</main>
    </div>
  );
}
