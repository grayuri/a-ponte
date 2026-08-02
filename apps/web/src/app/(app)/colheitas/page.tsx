import Link from 'next/link';
import type {
  HarvestTypeView,
  HarvestView,
  InstitutionView,
  Paginated,
  StoreView,
} from '@a-ponte/contracts';
import { api } from '@/lib/api';
import { formatarData, formatarKg, formatarNumero, hojeIso, somarDias } from '@/lib/format';
import { POR_PAGINA, Paginacao, lerPagina } from '@/components/paginacao';
import { Foto } from './foto';

export const metadata = { title: 'Colheitas — Rede Colheita' };

export default async function PaginaColheitas({
  searchParams,
}: {
  searchParams: {
    de?: string;
    ate?: string;
    loja?: string;
    instituicao?: string;
    tipo?: string;
    comFoto?: string;
    pagina?: string;
  };
}) {
  const hoje = hojeIso();
  const de = searchParams.de ?? somarDias(hoje, -14);
  const ate = searchParams.ate ?? hoje;
  const pagina = lerPagina(searchParams.pagina);
  const somenteComFoto = searchParams.comFoto === '1';

  const [lista, lojas, instituicoes, tipos] = await Promise.all([
    api<Paginated<HarvestView>>('/harvests', {
      query: {
        from: de,
        to: ate,
        storeId: searchParams.loja,
        institutionId: searchParams.instituicao,
        harvestTypeId: searchParams.tipo,
        onlyWithPhoto: somenteComFoto ? 'true' : undefined,
        withPhotos: 'true',
        page: pagina,
        pageSize: POR_PAGINA,
      },
      revalidate: false,
    }),
    api<StoreView[]>('/catalog/stores', { revalidate: 300 }),
    api<InstitutionView[]>('/catalog/institutions', { revalidate: 300 }),
    api<HarvestTypeView[]>('/catalog/harvest-types', { revalidate: 300 }),
  ]);

  const kgNaPagina = lista.items.reduce((acc, h) => acc + h.weightKg, 0);
  const semFoto = lista.items.filter((h) => !h.photoUrl && h.source !== 'IMPORTACAO').length;

  const params = {
    de: searchParams.de,
    ate: searchParams.ate,
    loja: searchParams.loja,
    instituicao: searchParams.instituicao,
    tipo: searchParams.tipo,
    comFoto: searchParams.comFoto,
  };

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Colheitas registradas</h1>
        <p>
          A foto é a evidência de que a colheita aconteceu — o formulário sempre pediu que a
          identificação da instituição aparecesse e que o alimento não estivesse no chão. Aqui
          dá para conferir.
        </p>
      </div>

      <form className="filtros" method="get">
        <div className="campo">
          <label htmlFor="de">De</label>
          <input id="de" name="de" type="date" defaultValue={de} />
        </div>
        <div className="campo">
          <label htmlFor="ate">Até</label>
          <input id="ate" name="ate" type="date" defaultValue={ate} />
        </div>
        <div className="campo">
          <label htmlFor="loja">Loja</label>
          <select id="loja" name="loja" defaultValue={searchParams.loja ?? ''}>
            <option value="">Todas</option>
            {lojas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.displayName}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="instituicao">Instituição</label>
          <select id="instituicao" name="instituicao" defaultValue={searchParams.instituicao ?? ''}>
            <option value="">Todas</option>
            {instituicoes.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="tipo">Tipo</label>
          <select id="tipo" name="tipo" defaultValue={searchParams.tipo ?? ''}>
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="comFoto">Foto</label>
          <select id="comFoto" name="comFoto" defaultValue={searchParams.comFoto ?? ''}>
            <option value="">Todas</option>
            <option value="1">Só com foto</option>
          </select>
        </div>
        <button type="submit" data-variante="secundario">
          Filtrar
        </button>
      </form>

      <div className="grade">
        <div className="kpi">
          <div className="rotulo">Registros no período</div>
          <div className="valor">{formatarNumero(lista.total)}</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Kg nesta página</div>
          <div className="valor">{formatarKg(kgNaPagina)}</div>
        </div>
        {semFoto > 0 ? (
          <div className="kpi" data-destaque="vermelho">
            <div className="rotulo">Sem foto nesta página</div>
            <div className="valor">{semFoto}</div>
            <div className="apoio">registros feitos pelo app</div>
          </div>
        ) : null}
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        {lista.items.length === 0 ? (
          <div className="vazio">
            <strong>Nenhuma colheita no período.</strong>
            Ajuste as datas ou os filtros.
          </div>
        ) : (
          <>
            <div className="galeria">
              {lista.items.map((colheita) => (
                <article key={colheita.id} className="galeria-item">
                  <Foto url={colheita.photoUrl} legenda={`${colheita.storeName} — ${formatarData(colheita.harvestedOn)}`} />

                  <div className="galeria-corpo">
                    <div className="galeria-topo">
                      <strong>{colheita.storeName}</strong>
                      <span className="galeria-peso">{formatarKg(colheita.weightKg)}</span>
                    </div>
                    <div className="meta">
                      {formatarData(colheita.harvestedOn)}
                      {colheita.harvestedAt ? ` · ${colheita.harvestedAt}` : ''} ·{' '}
                      {colheita.harvestTypeLabel}
                    </div>
                    <div className="meta">Destino: {colheita.institutionName}</div>
                    <div className="meta">Por: {colheita.collectorName}</div>
                    {colheita.mainFoods ? (
                      <div className="meta">Alimentos: {colheita.mainFoods}</div>
                    ) : null}
                    {colheita.notes?.includes('drive.google.com') ? (
                      <div className="meta">
                        <a
                          href={colheita.notes.replace(/^.*?(https?:\/\/\S+).*$/s, '$1')}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Foto original no Google Drive
                        </a>
                      </div>
                    ) : null}
                    <div style={{ marginTop: '0.5rem' }}>
                      <Link href={`/minhas-colheitas/${colheita.id}/editar`}>corrigir</Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <Paginacao
              pagina={lista.page}
              totalPaginas={lista.totalPages}
              total={lista.total}
              primeiro={(lista.page - 1) * lista.pageSize + 1}
              ultimo={Math.min(lista.page * lista.pageSize, lista.total)}
              parametro="pagina"
              parametrosAtuais={params}
              rotulo="colheitas"
            />
          </>
        )}
      </div>
    </>
  );
}
