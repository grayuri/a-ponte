import Link from 'next/link';
import type {
  HarvestTypeView,
  InstitutionView,
  OccurrenceView,
  StoreView,
} from '@a-ponte/contracts';
import { api, apiSafe } from '@/lib/api';
import { hojeIso } from '@/lib/format';
import { FormularioColheita } from './formulario-colheita';

export const metadata = { title: 'Registrar colheita — Rede Colheita' };

export default async function PaginaRegistrar({
  searchParams,
}: {
  searchParams: { ocorrencia?: string };
}) {
  const [lojas, instituicoes, tipos] = await Promise.all([
    api<StoreView[]>('/catalog/stores', { revalidate: 300 }),
    api<InstitutionView[]>('/catalog/institutions', { revalidate: 300 }),
    api<HarvestTypeView[]>('/catalog/harvest-types', { revalidate: 300 }),
  ]);

  // Quando vem da escala, os campos já chegam preenchidos: o colhedor só
  // informa peso, alimentos e foto. É o mínimo de digitação possível de pé,
  // dentro do supermercado.
  const ocorrencia = searchParams.ocorrencia
    ? await apiSafe<OccurrenceView>(`/occurrences/${searchParams.ocorrencia}`, {
        revalidate: false,
      })
    : null;

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Registrar colheita</h1>
        <p>
          {ocorrencia
            ? `${ocorrencia.storeName} · ${ocorrencia.timeLabel ?? ocorrencia.expectedTime}`
            : 'Colheita fora da escala — informe onde e quanto foi colhido.'}
        </p>
      </div>

      {searchParams.ocorrencia && !ocorrencia ? (
        <div className="aviso" data-tipo="atencao">
          Não foi possível carregar essa colheita da escala. Você ainda pode registrar
          preenchendo os campos abaixo.
        </div>
      ) : null}

      <div className="card">
        <FormularioColheita
          lojas={lojas}
          instituicoes={instituicoes}
          tipos={tipos}
          ocorrencia={ocorrencia}
          hoje={hojeIso()}
        />
      </div>

      <p style={{ marginTop: '1rem' }}>
        <Link href="/minhas-colheitas">← Voltar para minhas colheitas</Link>
      </p>
    </>
  );
}
