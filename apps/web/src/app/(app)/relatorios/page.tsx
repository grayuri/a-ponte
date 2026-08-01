import type {
  CalendarView,
  RankingRowView,
  WeekdaySummaryView,
} from '@a-ponte/contracts';
import { api } from '@/lib/api';
import { MESES, formatarKg, formatarNumero, hojeIso, primeiroDiaDoAno } from '@/lib/format';

export const metadata = { title: 'Relatórios — Rede Colheita' };

export default async function PaginaRelatorios({
  searchParams,
}: {
  searchParams: { de?: string; ate?: string; ano?: string; mes?: string };
}) {
  const hoje = hojeIso();
  const de = searchParams.de ?? primeiroDiaDoAno(hoje);
  const ate = searchParams.ate ?? hoje;
  const ano = Number(searchParams.ano ?? hoje.slice(0, 4));
  const mes = Number(searchParams.mes ?? hoje.slice(5, 7));

  const [porLoja, porInstituicao, porColhedor, porDia, calendario] = await Promise.all([
    api<RankingRowView[]>('/reports/by-store', { query: { from: de, to: ate }, revalidate: 60 }),
    api<RankingRowView[]>('/reports/by-institution', {
      query: { from: de, to: ate },
      revalidate: 60,
    }),
    api<RankingRowView[]>('/reports/by-collector', {
      query: { from: de, to: ate },
      revalidate: 60,
    }),
    api<WeekdaySummaryView[]>('/reports/by-weekday', {
      query: { from: de, to: ate },
      revalidate: 60,
    }),
    api<CalendarView>('/reports/calendar', { query: { year: ano, month: mes }, revalidate: 60 }),
  ]);

  const urlCsv = `${process.env.NEXT_PUBLIC_API_URL}/reports/export.csv?from=${de}&to=${ate}`;

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Relatórios</h1>
        <p>Colheitas e quilos por loja, instituição, pessoa e dia da semana.</p>
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
          <label htmlFor="mes">Mês do calendário</label>
          <select id="mes" name="mes" defaultValue={mes}>
            {MESES.map((nome, indice) => (
              <option key={nome} value={indice + 1}>
                {nome}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="ano">Ano</label>
          <input id="ano" name="ano" type="number" min={2020} max={2100} defaultValue={ano} />
        </div>
        <button type="submit" data-variante="secundario">
          Aplicar
        </button>
      </form>

      <div className="grade-2">
        <Tabela titulo="Por loja / mercado" linhas={porLoja} />
        <Tabela titulo="Por instituição" linhas={porInstituicao} />
      </div>

      <div className="grade-2" style={{ marginTop: '1rem' }}>
        <Tabela
          titulo="Por pessoa"
          linhas={porColhedor}
          vazio="Nenhum registro com colhedor identificado no período. Registros importados da planilha não têm login associado."
        />

        <div className="card">
          <div className="card-titulo">Por dia da semana</div>
          <div className="tabela-envolucro">
            <table>
              <thead>
                <tr>
                  <th>Dia</th>
                  <th className="numero">Colheitas</th>
                  <th className="numero">Kg</th>
                </tr>
              </thead>
              <tbody>
                {porDia.map((linha) => (
                  <tr key={linha.weekday}>
                    <td>{linha.weekdayLabel}</td>
                    <td className="numero">{formatarNumero(linha.harvestCount)}</td>
                    <td className="numero">{formatarNumero(linha.weightKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-titulo">
          Calendário de colheitas — {MESES[mes - 1]} de {ano}
        </div>

        {calendario.rows.length === 0 ? (
          <p className="dica">Sem registros neste mês.</p>
        ) : (
          <div className="tabela-envolucro">
            <table className="calendario">
              <thead>
                <tr>
                  <th>Loja \ dia</th>
                  {Array.from({ length: calendario.daysInMonth }, (_, i) => (
                    <th key={i} className="numero">
                      {i + 1}
                    </th>
                  ))}
                  <th className="numero">Total</th>
                </tr>
              </thead>
              <tbody>
                {calendario.rows.map((linha) => (
                  <tr key={linha.storeId}>
                    <td>{linha.storeName}</td>
                    {linha.cells.map((celula) => (
                      <td
                        key={celula.day}
                        className={celula.harvestCount > 0 ? 'tem' : undefined}
                        title={
                          celula.harvestCount > 0
                            ? `${celula.harvestCount} colheita(s), ${formatarKg(celula.weightKg)}`
                            : undefined
                        }
                      >
                        {celula.harvestCount > 0 ? celula.harvestCount : ''}
                      </td>
                    ))}
                    <td className="numero">
                      <strong>{linha.totalHarvests}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="linha-botoes">
        <a className="botao" data-variante="secundario" href={urlCsv}>
          Baixar CSV do período
        </a>
      </div>
      <p className="dica">
        O CSV sai com as mesmas colunas da aba DADOS da planilha, separado por ponto e
        vírgula — abre direto no Excel em português.
      </p>
    </>
  );
}

function Tabela({
  titulo,
  linhas,
  vazio = 'Sem registros no período.',
}: {
  titulo: string;
  linhas: RankingRowView[];
  vazio?: string;
}) {
  const total = linhas.reduce((acc, l) => acc + l.weightKg, 0);

  return (
    <div className="card">
      <div className="card-titulo">{titulo}</div>
      {linhas.length === 0 ? (
        <p className="dica">{vazio}</p>
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
              <tr>
                <td>
                  <strong>TOTAL</strong>
                </td>
                <td className="numero">
                  <strong>
                    {formatarNumero(linhas.reduce((acc, l) => acc + l.harvestCount, 0))}
                  </strong>
                </td>
                <td className="numero">
                  <strong>{formatarNumero(total)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
