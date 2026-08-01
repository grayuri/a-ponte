import type { ChainView, InstitutionView, StoreView } from '@a-ponte/contracts';
import { api } from '@/lib/api';
import { FormulariosCadastro } from './formularios-cadastro';

export const metadata = { title: 'Cadastros — Rede Colheita' };

export default async function PaginaCadastros() {
  const [redes, lojas, instituicoes] = await Promise.all([
    api<ChainView[]>('/catalog/chains', { revalidate: false }),
    api<StoreView[]>('/catalog/stores', { query: { includeInactive: true }, revalidate: false }),
    api<InstitutionView[]>('/catalog/institutions', {
      query: { includeInactive: true },
      revalidate: false,
    }),
  ]);

  const semTelefone = instituicoes.filter((i) => i.active && !i.phone).length;

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Cadastros</h1>
        <p>
          Redes, lojas e instituições. Este é o vocabulário compartilhado da operação — é o que
          faz “São Luiz - Del Paseo” ser um lugar só, e não duas grafias diferentes.
        </p>
      </div>

      {semTelefone > 0 ? (
        <div className="aviso" data-tipo="atencao">
          <strong>{semTelefone} instituição(ões) ativa(s) sem telefone.</strong> Quando a escala
          não tem pessoa nominal, é o contato da instituição que recebe a mensagem — sem ele,
          ninguém é avisado.
        </div>
      ) : null}

      <FormulariosCadastro redes={redes} />

      <div className="grade-2" style={{ marginTop: '1.5rem' }}>
        <div className="card">
          <div className="card-titulo">Lojas ({lojas.length})</div>
          <div className="tabela-envolucro">
            <table>
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Rede</th>
                  <th>Cidade</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {lojas.map((loja) => (
                  <tr key={loja.id}>
                    <td>{loja.displayName}</td>
                    <td>{loja.chainName}</td>
                    <td>{loja.city ?? '—'}</td>
                    <td>
                      <span
                        className="etiqueta"
                        data-status={loja.active ? 'CUMPRIDA' : 'CANCELADA'}
                      >
                        {loja.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-titulo">Instituições ({instituicoes.length})</div>
          <div className="tabela-envolucro">
            <table>
              <thead>
                <tr>
                  <th>Instituição</th>
                  <th>Contato</th>
                  <th>Telefone</th>
                  <th className="numero">Pessoas</th>
                </tr>
              </thead>
              <tbody>
                {instituicoes.map((instituicao) => (
                  <tr key={instituicao.id}>
                    <td>{instituicao.name}</td>
                    <td>{instituicao.contactName ?? '—'}</td>
                    <td>
                      {instituicao.phone ?? (
                        <span style={{ color: 'var(--vermelho-600)', fontWeight: 600 }}>—</span>
                      )}
                    </td>
                    <td className="numero">{instituicao.memberCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
