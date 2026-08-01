import type { CommitmentView, CurrentUserView } from '@a-ponte/contracts';
import { WEEKDAY_LABELS } from '@a-ponte/contracts';
import { api } from '@/lib/api';

export const metadata = { title: 'Escala — Rede Colheita' };

interface DiaDaEscala {
  weekday: number;
  weekdayLabel: string;
  commitments: CommitmentView[];
}

export default async function PaginaEscala() {
  const [usuario, quadro] = await Promise.all([
    api<CurrentUserView>('/auth/me', { revalidate: false }),
    api<DiaDaEscala[]>('/schedule/board', { revalidate: false }),
  ]);

  const podeEditar = usuario.role === 'ADMIN' || usuario.role === 'COORDENADOR';
  const total = quadro.reduce((acc, dia) => acc + dia.commitments.length, 0);

  // A semana começa na segunda, como a operação enxerga.
  const ordenados = [...quadro].sort(
    (a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7),
  );

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Escala consolidada</h1>
        <p>
          {total} compromisso(s) recorrente(s). Cada linha é a regra “toda{' '}
          {WEEKDAY_LABELS[1].toLowerCase()}, tal horário, tal loja, tal instituição” — o
          sistema materializa os dias concretos e cobra o preenchimento.
        </p>
      </div>

      {podeEditar ? (
        <div className="filtros">
          <a className="botao" href="/escala/novo">
            + Novo compromisso
          </a>
        </div>
      ) : null}

      {total === 0 ? (
        <div className="card">
          <div className="vazio">
            <strong>A escala ainda está vazia.</strong>
            {podeEditar
              ? 'Cadastre os compromissos ou importe a aba ESCALA da planilha pela linha de comando.'
              : 'Fale com a coordenação.'}
          </div>
        </div>
      ) : null}

      {ordenados.map((dia) =>
        dia.commitments.length === 0 ? null : (
          <div className="card" key={dia.weekday}>
            <div className="card-titulo">
              {dia.weekdayLabel} — {dia.commitments.length} colheita(s)
            </div>
            <div className="tabela-envolucro">
              <table>
                <thead>
                  <tr>
                    <th>Horário</th>
                    <th>Loja / mercado</th>
                    <th>Rede</th>
                    <th>Instituição responsável</th>
                    <th>Responsável</th>
                    <th>Tipo</th>
                    {podeEditar ? <th></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {dia.commitments.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {item.timeLabel ?? item.startTime}
                      </td>
                      <td>{item.storeName}</td>
                      <td>{item.chainName}</td>
                      <td>{item.institutionName}</td>
                      <td>
                        {item.assigneeName ?? (
                          <span style={{ color: 'var(--cinza-500)' }}>
                            {item.statusNote ?? 'a definir'}
                          </span>
                        )}
                      </td>
                      <td>{item.harvestTypeLabel ?? '—'}</td>
                      {podeEditar ? (
                        <td>
                          <a href={`/escala/${item.id}`}>editar</a>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ),
      )}
    </>
  );
}
