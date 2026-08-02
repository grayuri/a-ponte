import Link from 'next/link';
import type {
  CurrentUserView,
  HarvestTypeView,
  HarvestView,
  InstitutionView,
  StoreView,
} from '@a-ponte/contracts';
import { api } from '@/lib/api';
import { formatarData, hojeIso } from '@/lib/format';
import { FormularioEdicao } from './formulario-edicao';

export const metadata = { title: 'Editar colheita — Rede Colheita' };

export default async function PaginaEditarColheita({ params }: { params: { id: string } }) {
  const [colheita, usuario, lojas, instituicoes, tipos] = await Promise.all([
    api<HarvestView>(`/harvests/${params.id}`, { revalidate: false }),
    api<CurrentUserView>('/auth/me', { revalidate: false }),
    api<StoreView[]>('/catalog/stores', { revalidate: 300 }),
    api<InstitutionView[]>('/catalog/institutions', { revalidate: 300 }),
    api<HarvestTypeView[]>('/catalog/harvest-types', { revalidate: 300 }),
  ]);

  const ehCoordenacao = usuario.role === 'ADMIN' || usuario.role === 'COORDENADOR';

  const horasDesde = (Date.now() - new Date(colheita.createdAt).getTime()) / 36e5;
  const foraDaJanela = !ehCoordenacao && usuario.role === 'COLHEDOR' && horasDesde > 48;

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Editar colheita</h1>
        <p>
          {colheita.storeName} · {formatarData(colheita.harvestedOn)} · registrada por{' '}
          {colheita.collectorName}
        </p>
      </div>

      {colheita.source === 'IMPORTACAO' ? (
        <div className="aviso" data-tipo="info">
          Este registro veio da planilha de 2026. Ele não tem colhedor com login associado — o
          nome que aparece é o texto original do formulário.
        </div>
      ) : null}

      {foraDaJanela ? (
        <div className="aviso" data-tipo="atencao">
          A janela de 48 horas para corrigir o próprio registro já passou. Peça o ajuste à
          coordenação — o formulário abaixo vai recusar a alteração.
        </div>
      ) : null}

      <div className="card">
        <FormularioEdicao
          colheita={colheita}
          lojas={lojas}
          instituicoes={instituicoes}
          tipos={tipos}
          podeExcluir={ehCoordenacao}
          hoje={hojeIso()}
        />
      </div>

      <p style={{ marginTop: '1rem' }}>
        <Link href="/minhas-colheitas">← Voltar para minhas colheitas</Link>
      </p>
    </>
  );
}
