import type { ChainView, InstitutionView, StoreView } from '@a-ponte/contracts';
import { api } from '@/lib/api';
import { Paginacao, lerPagina, paginar } from '@/components/paginacao';
import { FormulariosCadastro } from './formularios-cadastro';
import { LinhaInstituicao } from './linha-instituicao';
import { LinhaLoja } from './linha-loja';

export const metadata = { title: 'Cadastros — Rede Colheita' };

const contem = (valor: string | null | undefined, termo: string) =>
  (valor ?? '').toLowerCase().includes(termo);

export default async function PaginaCadastros({
  searchParams,
}: {
  searchParams: { pl?: string; pi?: string; bl?: string; bi?: string };
}) {
  const [redes, lojas, instituicoes] = await Promise.all([
    api<ChainView[]>('/catalog/chains', { revalidate: false }),
    api<StoreView[]>('/catalog/stores', { query: { includeInactive: true }, revalidate: false }),
    api<InstitutionView[]>('/catalog/institutions', {
      query: { includeInactive: true },
      revalidate: false,
    }),
  ]);

  const buscaLoja = (searchParams.bl ?? '').trim().toLowerCase();
  const buscaInst = (searchParams.bi ?? '').trim().toLowerCase();

  const lojasFiltradas = buscaLoja
    ? lojas.filter(
        (l) => contem(l.name, buscaLoja) || contem(l.chainName, buscaLoja) || contem(l.city, buscaLoja),
      )
    : lojas;

  const instFiltradas = buscaInst
    ? instituicoes.filter(
        (i) =>
          contem(i.name, buscaInst) ||
          contem(i.shortName, buscaInst) ||
          contem(i.contactName, buscaInst) ||
          contem(i.city, buscaInst),
      )
    : instituicoes;

  const pLojas = paginar(lojasFiltradas, lerPagina(searchParams.pl));
  const pInst = paginar(instFiltradas, lerPagina(searchParams.pi));

  const semTelefone = instituicoes.filter((i) => i.active && !i.phone).length;
  const params = { pl: searchParams.pl, pi: searchParams.pi, bl: searchParams.bl, bi: searchParams.bi };

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
          ninguém é avisado. Clique em <strong>editar</strong> na lista abaixo para preencher.
        </div>
      ) : null}

      <FormulariosCadastro redes={redes} />

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-titulo">Lojas ({lojas.length})</div>

        <form className="filtros" method="get">
          {searchParams.bi ? <input type="hidden" name="bi" value={searchParams.bi} /> : null}
          {searchParams.pi ? <input type="hidden" name="pi" value={searchParams.pi} /> : null}
          <div className="campo">
            <label htmlFor="bl">Buscar loja</label>
            <input id="bl" name="bl" defaultValue={searchParams.bl ?? ''} placeholder="Nome, rede ou cidade" />
          </div>
          <button type="submit" data-variante="secundario">
            Buscar
          </button>
        </form>

        {pLojas.total === 0 ? (
          <div className="vazio">
            <strong>Nenhuma loja encontrada.</strong>
            {buscaLoja ? 'Ajuste a busca.' : 'Cadastre a primeira acima.'}
          </div>
        ) : (
          <>
            <div className="tabela-envolucro">
              <table>
                <thead>
                  <tr>
                    <th>Loja</th>
                    <th>Rede</th>
                    <th>Cidade</th>
                    <th>Situação</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pLojas.itens.map((loja) => (
                    <LinhaLoja key={loja.id} loja={loja} redes={redes} />
                  ))}
                </tbody>
              </table>
            </div>

            <Paginacao
              {...pLojas}
              parametro="pl"
              parametrosAtuais={params}
              rotulo="lojas"
            />
          </>
        )}
      </div>

      <div className="card">
        <div className="card-titulo">Instituições ({instituicoes.length})</div>

        <form className="filtros" method="get">
          {searchParams.bl ? <input type="hidden" name="bl" value={searchParams.bl} /> : null}
          {searchParams.pl ? <input type="hidden" name="pl" value={searchParams.pl} /> : null}
          <div className="campo">
            <label htmlFor="bi">Buscar instituição</label>
            <input
              id="bi"
              name="bi"
              defaultValue={searchParams.bi ?? ''}
              placeholder="Nome, contato ou cidade"
            />
          </div>
          <button type="submit" data-variante="secundario">
            Buscar
          </button>
        </form>

        {pInst.total === 0 ? (
          <div className="vazio">
            <strong>Nenhuma instituição encontrada.</strong>
            {buscaInst ? 'Ajuste a busca.' : 'Cadastre a primeira acima.'}
          </div>
        ) : (
          <>
            <div className="tabela-envolucro">
              <table>
                <thead>
                  <tr>
                    <th>Instituição</th>
                    <th>Contato</th>
                    <th>Telefone</th>
                    <th className="numero">Pessoas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pInst.itens.map((instituicao) => (
                    <LinhaInstituicao key={instituicao.id} instituicao={instituicao} />
                  ))}
                </tbody>
              </table>
            </div>

            <Paginacao
              {...pInst}
              parametro="pi"
              parametrosAtuais={params}
              rotulo="instituições"
            />
          </>
        )}
      </div>
    </>
  );
}
