import { redirect } from 'next/navigation';
import type {
  CurrentUserView,
  DashboardKpiView,
  MonthlyPointView,
  RankingRowView,
} from '@a-ponte/contracts';
import { api } from '@/lib/api';
import {
  formatarKg,
  formatarNumero,
  formatarPercentual,
  hojeIso,
  primeiroDiaDoAno,
} from '@/lib/format';

export const metadata = { title: 'Painel — Rede Colheita' };

export default async function PaginaPainel({
  searchParams,
}: {
  searchParams: { de?: string; ate?: string };
}) {
  const usuario = await api<CurrentUserView>('/auth/me', { revalidate: false });

  // O colhedor não tem painel: o app dele é a lista do dia.
  if (usuario.role === 'COLHEDOR') redirect('/minhas-colheitas');

  const hoje = hojeIso();
  const de = searchParams.de ?? primeiroDiaDoAno(hoje);
  const ate = searchParams.ate ?? hoje;
  const ano = Number(de.slice(0, 4));

  const [kpis, mensal, porInstituicao, porLoja] = await Promise.all([
    api<DashboardKpiView>('/reports/kpis', { query: { from: de, to: ate }, revalidate: 60 }),
    api<MonthlyPointView[]>('/reports/monthly', { query: { year: ano }, revalidate: 60 }),
    api<RankingRowView[]>('/reports/by-institution', {
      query: { from: de, to: ate },
      revalidate: 60,
    }),
    api<RankingRowView[]>('/reports/by-store', { query: { from: de, to: ate }, revalidate: 60 }),
  ]);

  const tipos = Object.entries(kpis.weightByTypeKg).sort((a, b) => b[1] - a[1]);
  const maiorMes = Math.max(1, ...mensal.map((m) => m.weightKg));

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Painel de gestão</h1>
        <p>
          Indicadores consolidados das colheitas — {de.split('-').reverse().join('/')} a{' '}
          {ate.split('-').reverse().join('/')}
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
        <button type="submit" data-variante="secundario">
          Aplicar
        </button>
      </form>

      <div className="grade">
        <div className="kpi" data-destaque="verde">
          <div className="rotulo">Total colhido</div>
          <div className="valor">{formatarKg(kpis.totalWeightKg)}</div>
          <div className="apoio">{formatarNumero(kpis.harvestCount)} colheitas</div>
        </div>

        <div className="kpi">
          <div className="rotulo">Média por colheita</div>
          <div className="valor">{formatarKg(kpis.averageKgPerHarvest)}</div>
          <div className="apoio">por registro</div>
        </div>

        <div className="kpi">
          <div className="rotulo">Instituições</div>
          <div className="valor">{kpis.institutionCount}</div>
          <div className="apoio">receberam alimento</div>
        </div>

        <div className="kpi">
          <div className="rotulo">Lojas</div>
          <div className="valor">{kpis.storeCount}</div>
          <div className="apoio">com colheita registrada</div>
        </div>

        <div className="kpi">
          <div className="rotulo">Colhedores</div>
          <div className="valor">{kpis.collectorCount}</div>
          <div className="apoio">pessoas identificadas</div>
        </div>

        <div className="kpi" data-destaque={kpis.pendingCount > 0 ? 'vermelho' : 'verde'}>
          <div className="rotulo">Preenchimento</div>
          <div className="valor">{formatarPercentual(kpis.fulfilledRate)}</div>
          <div className="apoio">
            {kpis.pendingCount > 0
              ? `${kpis.pendingCount} pendência(s) no período`
              : 'sem pendências no período'}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-titulo">Evolução mensal de {ano}</div>
        <div className="tabela-envolucro">
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th className="numero">Colheitas</th>
                <th className="numero">Kg</th>
                <th style={{ width: '40%' }}>% do ano</th>
              </tr>
            </thead>
            <tbody>
              {mensal.map((ponto) => (
                <tr key={ponto.month}>
                  <td>{ponto.monthLabel}</td>
                  <td className="numero">{formatarNumero(ponto.harvestCount)}</td>
                  <td className="numero">{formatarNumero(ponto.weightKg)}</td>
                  <td>
                    <div className="barra" aria-label={formatarPercentual(ponto.share)}>
                      <span style={{ width: `${(ponto.weightKg / maiorMes) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-titulo">Colheita por tipo</div>
        {tipos.length === 0 ? (
          <p className="dica">Sem registros no período.</p>
        ) : (
          <div className="tabela-envolucro">
            <table>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th className="numero">Kg</th>
                  <th className="numero">% do total</th>
                </tr>
              </thead>
              <tbody>
                {tipos.map(([tipo, kg]) => (
                  <tr key={tipo}>
                    <td>{tipo}</td>
                    <td className="numero">{formatarNumero(kg)}</td>
                    <td className="numero">
                      {formatarPercentual(kpis.totalWeightKg ? kg / kpis.totalWeightKg : 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grade-2" style={{ marginTop: '1rem' }}>
        <Ranking titulo="Top instituições por kg" linhas={porInstituicao.slice(0, 10)} />
        <Ranking titulo="Top lojas por kg" linhas={porLoja.slice(0, 10)} />
      </div>
    </>
  );
}

function Ranking({ titulo, linhas }: { titulo: string; linhas: RankingRowView[] }) {
  return (
    <div className="card">
      <div className="card-titulo">{titulo}</div>
      {linhas.length === 0 ? (
        <p className="dica">Sem registros no período.</p>
      ) : (
        <div className="tabela-envolucro">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th className="numero">Colheitas</th>
                <th className="numero">Kg</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha) => (
                <tr key={linha.id}>
                  <td>{linha.label}</td>
                  <td className="numero">{formatarNumero(linha.harvestCount)}</td>
                  <td className="numero">{formatarNumero(linha.weightKg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
