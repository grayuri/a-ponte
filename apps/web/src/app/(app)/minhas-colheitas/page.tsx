import Link from 'next/link';
import type { CurrentUserView, HarvestView, OccurrenceView, Paginated } from '@a-ponte/contracts';
import { api } from '@/lib/api';
import { formatarData, formatarDataExtenso, formatarKg, hojeIso, somarDias } from '@/lib/format';
import { CartaoOcorrencia } from './cartao-ocorrencia';

export const metadata = { title: 'Minhas colheitas — Rede Colheita' };

export default async function PaginaMinhasColheitas({
  searchParams,
}: {
  searchParams: { data?: string; registrada?: string };
}) {
  const hoje = hojeIso();
  const data = searchParams.data ?? hoje;

  const [usuario, ocorrencias, historico] = await Promise.all([
    api<CurrentUserView>('/auth/me', { revalidate: false }),
    api<OccurrenceView[]>('/occurrences/my-day', { query: { date: data }, revalidate: false }),
    api<Paginated<HarvestView>>('/harvests', {
      query: { pageSize: 8, page: 1 },
      revalidate: false,
    }),
  ]);

  const pendentes = ocorrencias.filter(
    (o) => o.status === 'PLANEJADA' || o.status === 'PENDENTE',
  );
  const resolvidas = ocorrencias.filter(
    (o) => o.status !== 'PLANEJADA' && o.status !== 'PENDENTE',
  );

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Olá, {usuario.fullName.split(' ')[0]}!</h1>
        <p>
          {data === hoje ? 'Hoje é ' : ''}
          {formatarDataExtenso(data)}
          {ocorrencias.length === 0
            ? ' — você não tem colheita na escala.'
            : ` — ${ocorrencias.length} colheita${ocorrencias.length > 1 ? 's' : ''} na escala.`}
        </p>
      </div>

      {searchParams.registrada ? (
        <div className="aviso" data-tipo="sucesso" role="status">
          Colheita registrada. Obrigado!
        </div>
      ) : null}

      <div className="filtros">
        <Link
          className="botao"
          data-variante="secundario"
          href={`/minhas-colheitas?data=${somarDias(data, -1)}`}
        >
          ← Dia anterior
        </Link>
        {data !== hoje ? (
          <Link className="botao" data-variante="secundario" href="/minhas-colheitas">
            Hoje
          </Link>
        ) : null}
        <Link
          className="botao"
          data-variante="secundario"
          href={`/minhas-colheitas?data=${somarDias(data, 1)}`}
        >
          Próximo dia →
        </Link>
        <Link className="botao" href="/minhas-colheitas/registrar">
          + Registrar colheita avulsa
        </Link>
      </div>

      {ocorrencias.length === 0 ? (
        <div className="card">
          <div className="vazio">
            <strong>Nenhuma colheita na escala para este dia.</strong>
            Se você colheu mesmo assim, use “Registrar colheita avulsa”.
          </div>
        </div>
      ) : null}

      {pendentes.map((ocorrencia) => (
        <CartaoOcorrencia key={ocorrencia.id} ocorrencia={ocorrencia} podeAgir />
      ))}

      {resolvidas.length > 0 ? (
        <>
          <h2 style={{ margin: '1.5rem 0 0.75rem' }}>Já resolvidas</h2>
          {resolvidas.map((ocorrencia) => (
            <CartaoOcorrencia key={ocorrencia.id} ocorrencia={ocorrencia} podeAgir={false} />
          ))}
        </>
      ) : null}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="card-titulo">Seus últimos registros</div>
        {historico.items.length === 0 ? (
          <p className="dica">Você ainda não registrou nenhuma colheita.</p>
        ) : (
          <div className="tabela-envolucro">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Loja</th>
                  <th>Destino</th>
                  <th className="numero">Kg</th>
                </tr>
              </thead>
              <tbody>
                {historico.items.map((registro) => (
                  <tr key={registro.id}>
                    <td>{formatarData(registro.harvestedOn)}</td>
                    <td>{registro.storeName}</td>
                    <td>{registro.institutionName}</td>
                    <td className="numero">{formatarKg(registro.weightKg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
