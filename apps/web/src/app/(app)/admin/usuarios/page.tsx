import type {
  CurrentUserView,
  InstitutionView,
  Paginated,
  UserView,
} from '@a-ponte/contracts';
import { api } from '@/lib/api';
import { formatarData } from '@/lib/format';
import { POR_PAGINA, Paginacao, lerPagina } from '@/components/paginacao';
import { FormularioUsuario } from './formulario-usuario';
import { LinhaUsuario } from './linha-usuario';

export const metadata = { title: 'Pessoas — Rede Colheita' };

const PAPEL_ROTULO: Record<string, string> = {
  ADMIN: 'Administração',
  COORDENADOR: 'Coordenação',
  INSTITUICAO: 'Instituição',
  COLHEDOR: 'Colhedor(a)',
};

export default async function PaginaUsuarios({
  searchParams,
}: {
  searchParams: { busca?: string; papel?: string; pagina?: string };
}) {
  const pagina = lerPagina(searchParams.pagina);

  const [usuarioAtual, lista, instituicoes] = await Promise.all([
    api<CurrentUserView>('/auth/me', { revalidate: false }),
    api<Paginated<UserView>>('/users', {
      query: {
        search: searchParams.busca,
        role: searchParams.papel,
        page: pagina,
        pageSize: POR_PAGINA,
      },
      revalidate: false,
    }),
    api<InstitutionView[]>('/catalog/institutions', { revalidate: 300 }),
  ]);

  const semTelefone = lista.items.filter((u) => !u.phone && u.status === 'ATIVO').length;

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Pessoas</h1>
        <p>
          Quem tem login no sistema. É o cadastro que substitui os nomes digitados à mão no
          formulário — daqui pra frente, cada colheita fica amarrada a uma pessoa real.
        </p>
      </div>

      {semTelefone > 0 ? (
        <div className="aviso" data-tipo="atencao">
          <strong>{semTelefone} pessoa(s) ativa(s) sem telefone.</strong> Elas conseguem entrar
          no sistema, mas não recebem a escala do dia nem a cobrança de pendência no WhatsApp.
        </div>
      ) : null}

      <div className="card">
        <div className="card-titulo">Cadastrar pessoa</div>
        <FormularioUsuario
          instituicoes={instituicoes}
          papelDoAtor={usuarioAtual.role}
          instituicaoDoAtor={usuarioAtual.institutionId}
        />
      </div>

      <form className="filtros" method="get" style={{ marginTop: '1.5rem' }}>
        <div className="campo">
          <label htmlFor="busca">Buscar</label>
          <input
            id="busca"
            name="busca"
            defaultValue={searchParams.busca ?? ''}
            placeholder="Nome, usuário ou e-mail"
          />
        </div>
        <div className="campo">
          <label htmlFor="papel">Papel</label>
          <select id="papel" name="papel" defaultValue={searchParams.papel ?? ''}>
            <option value="">Todos</option>
            {Object.entries(PAPEL_ROTULO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" data-variante="secundario">
          Filtrar
        </button>
      </form>

      <div className="card">
        <div className="card-titulo">{lista.total} pessoa(s)</div>

        {lista.items.length === 0 ? (
          <div className="vazio">
            <strong>Ninguém encontrado.</strong>
            Ajuste a busca ou cadastre a primeira pessoa acima.
          </div>
        ) : (
          <>
          <div className="tabela-envolucro">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Usuário</th>
                  <th>Telefone</th>
                  <th>Papel</th>
                  <th>Instituição</th>
                  <th className="numero">Colheitas</th>
                  <th>Última</th>
                  <th>Situação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {lista.items.map((pessoa) => (
                  <LinhaUsuario
                    key={pessoa.id}
                    pessoa={pessoa}
                    instituicoes={instituicoes}
                    papelRotulo={PAPEL_ROTULO[pessoa.role] ?? pessoa.role}
                    ultimaColheita={
                      pessoa.lastHarvestOn ? formatarData(pessoa.lastHarvestOn) : '—'
                    }
                    podeEditarPapel={
                      usuarioAtual.role === 'ADMIN' || usuarioAtual.role === 'COORDENADOR'
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>

          <Paginacao
            pagina={lista.page}
            totalPaginas={lista.totalPages}
            total={lista.total}
            primeiro={(lista.page - 1) * lista.pageSize + 1}
            ultimo={Math.min(lista.page * lista.pageSize, lista.total)}
            parametro="pagina"
            parametrosAtuais={{ busca: searchParams.busca, papel: searchParams.papel }}
            rotulo="pessoas"
          />
          </>
        )}
      </div>
    </>
  );
}
