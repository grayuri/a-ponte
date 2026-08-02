import type { ComplianceWeekView, CurrentUserView } from '@a-ponte/contracts';
import { OCCURRENCE_STATUS_LABELS } from '@a-ponte/contracts';
import { api } from '@/lib/api';
import {
  formatarData,
  formatarKg,
  formatarPercentual,
  hojeIso,
  inicioDaSemana,
  somarDias,
} from '@/lib/format';
import { Paginacao, lerPagina, paginar } from '@/components/paginacao';
import { AcoesPendencia } from './acoes-pendencia';

export const metadata = { title: 'Pendências — Rede Colheita' };

export default async function PaginaPendencias({
  searchParams,
}: {
  searchParams: { semana?: string; somentePendentes?: string; pagina?: string };
}) {
  const semana = searchParams.semana ?? inicioDaSemana(hojeIso());
  const somentePendentes = searchParams.somentePendentes === '1';

  const [usuario, dados] = await Promise.all([
    api<CurrentUserView>('/auth/me', { revalidate: false }),
    api<ComplianceWeekView>('/compliance/week', {
      query: { weekStart: semana, onlyPending: somentePendentes },
      revalidate: false,
    }),
  ]);

  const podeVarrer = usuario.role === 'ADMIN' || usuario.role === 'COORDENADOR';
  const pLinhas = paginar(dados.rows, lerPagina(searchParams.pagina));

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Quem preencheu e quem faltou</h1>
        <p>
          Semana de {formatarData(dados.weekStart)} a {formatarData(dados.weekEnd)}. Cada linha é
          um compromisso da escala — loja, dia e instituição responsável.
        </p>
      </div>

      <form className="filtros" method="get">
        <div className="campo">
          <label htmlFor="semana">Semana (segunda-feira)</label>
          <input id="semana" name="semana" type="date" defaultValue={dados.weekStart} />
        </div>
        <div className="campo">
          <label htmlFor="somentePendentes">Exibir</label>
          <select
            id="somentePendentes"
            name="somentePendentes"
            defaultValue={somentePendentes ? '1' : '0'}
          >
            <option value="0">Toda a escala</option>
            <option value="1">Só pendentes</option>
          </select>
        </div>
        <button type="submit" data-variante="secundario">
          Aplicar
        </button>
      </form>

      <div className="filtros">
        <a
          className="botao"
          data-variante="secundario"
          href={`/pendencias?semana=${somarDias(dados.weekStart, -7)}`}
        >
          ← Semana anterior
        </a>
        <a
          className="botao"
          data-variante="secundario"
          href={`/pendencias?semana=${somarDias(dados.weekStart, 7)}`}
        >
          Próxima semana →
        </a>
        {podeVarrer ? <AcoesPendencia hoje={hojeIso()} /> : null}
      </div>

      <div className="grade">
        <div className="kpi" data-destaque={dados.pending > 0 ? 'vermelho' : 'verde'}>
          <div className="rotulo">Pendências</div>
          <div className="valor">{dados.pending}</div>
          <div className="apoio">não deram baixa</div>
        </div>
        <div className="kpi" data-destaque="verde">
          <div className="rotulo">Preencheram</div>
          <div className="valor">{dados.fulfilled}</div>
          <div className="apoio">de {dados.totalCommitments} compromissos</div>
        </div>
        <div className="kpi">
          <div className="rotulo">% preenchido</div>
          <div className="valor">{formatarPercentual(dados.fulfilledRate)}</div>
          <div className="barra" data-tom={dados.fulfilledRate < 0.7 ? 'alerta' : undefined}>
            <span style={{ width: `${dados.fulfilledRate * 100}%` }} />
          </div>
        </div>
        <div className="kpi">
          <div className="rotulo">Justificadas</div>
          <div className="valor">{dados.excused}</div>
          <div className="apoio">avisaram ou remanejaram</div>
        </div>
        <div className="kpi">
          <div className="rotulo">Kg na semana</div>
          <div className="valor">{formatarKg(dados.weightKg)}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-titulo">
          {somentePendentes ? 'Pendências da semana' : 'Escala completa da semana'}
        </div>

        {dados.rows.length === 0 ? (
          <div className="vazio">
            <strong>Nada por aqui.</strong>
            {somentePendentes
              ? 'Nenhuma pendência nesta semana — todo mundo deu baixa.'
              : 'Não há compromissos materializados nesta semana.'}
          </div>
        ) : (
          <>
          <div className="tabela-envolucro">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Loja / mercado</th>
                  <th>Horário</th>
                  <th>Instituição responsável</th>
                  <th>Responsável</th>
                  <th>Situação</th>
                  <th className="numero">Kg</th>
                </tr>
              </thead>
              <tbody>
                {pLinhas.itens.map((linha) => (
                  <tr key={linha.occurrenceId}>
                    <td>{formatarData(linha.date)}</td>
                    <td>{linha.storeName}</td>
                    <td>{linha.timeLabel ?? linha.expectedTime}</td>
                    <td>{linha.institutionName}</td>
                    <td>{linha.assigneeName ?? '—'}</td>
                    <td>
                      <span className="etiqueta" data-status={linha.status}>
                        {OCCURRENCE_STATUS_LABELS[linha.status]}
                      </span>
                    </td>
                    <td className="numero">{linha.weightKg ? formatarKg(linha.weightKg) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Paginacao
            {...pLinhas}
            parametro="pagina"
            parametrosAtuais={{
              semana: searchParams.semana,
              somentePendentes: searchParams.somentePendentes,
            }}
            rotulo="compromissos"
          />
          </>
        )}
      </div>
    </>
  );
}
