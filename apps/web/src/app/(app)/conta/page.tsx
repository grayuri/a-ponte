import type { CurrentUserView } from '@a-ponte/contracts';
import { api } from '@/lib/api';
import { FormularioSenha } from './formulario-senha';

export const metadata = { title: 'Minha conta — Rede Colheita' };

const PAPEL_ROTULO: Record<string, string> = {
  ADMIN: 'Administração',
  COORDENADOR: 'Coordenação',
  INSTITUICAO: 'Responsável por instituição',
  COLHEDOR: 'Colhedor(a)',
};

export default async function PaginaConta() {
  const usuario = await api<CurrentUserView>('/auth/me', { revalidate: false });

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Minha conta</h1>
        <p>Seus dados de acesso ao sistema.</p>
      </div>

      <div className="card">
        <div className="card-titulo">Dados</div>
        <div className="tabela-envolucro">
          <table>
            <tbody>
              <tr>
                <th style={{ width: '40%' }}>Nome</th>
                <td>{usuario.fullName}</td>
              </tr>
              <tr>
                <th>Usuário</th>
                <td>{usuario.username}</td>
              </tr>
              <tr>
                <th>E-mail</th>
                <td>{usuario.email}</td>
              </tr>
              <tr>
                <th>WhatsApp</th>
                <td>
                  {usuario.phone ?? (
                    <span style={{ color: 'var(--vermelho-600)', fontWeight: 600 }}>
                      não cadastrado — você não recebe a escala do dia
                    </span>
                  )}
                </td>
              </tr>
              <tr>
                <th>Papel</th>
                <td>{PAPEL_ROTULO[usuario.role] ?? usuario.role}</td>
              </tr>
              {usuario.institutionName ? (
                <tr>
                  <th>Instituição</th>
                  <td>{usuario.institutionName}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <p className="dica">
          Para alterar nome, telefone ou instituição, fale com a coordenação.
        </p>
      </div>

      <div className="card">
        <div className="card-titulo">Trocar senha</div>
        <FormularioSenha />
      </div>
    </>
  );
}
