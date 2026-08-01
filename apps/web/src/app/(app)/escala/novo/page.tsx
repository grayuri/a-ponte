import Link from 'next/link';
import type {
  HarvestTypeView,
  InstitutionView,
  Paginated,
  StoreView,
  UserView,
} from '@a-ponte/contracts';
import { api } from '@/lib/api';
import { FormularioCompromisso } from '../formulario-compromisso';

export const metadata = { title: 'Novo compromisso — Rede Colheita' };

export default async function PaginaNovoCompromisso() {
  const [lojas, instituicoes, tipos, pessoas] = await Promise.all([
    api<StoreView[]>('/catalog/stores', { revalidate: 300 }),
    api<InstitutionView[]>('/catalog/institutions', { revalidate: 300 }),
    api<HarvestTypeView[]>('/catalog/harvest-types', { revalidate: 300 }),
    api<Paginated<UserView>>('/users', { query: { pageSize: 200, status: 'ATIVO' } }),
  ]);

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Novo compromisso da escala</h1>
        <p>Uma regra recorrente: toda semana, no mesmo dia e horário, na mesma loja.</p>
      </div>

      <div className="card">
        <FormularioCompromisso
          compromisso={null}
          lojas={lojas}
          instituicoes={instituicoes}
          tipos={tipos}
          pessoas={pessoas.items}
        />
      </div>

      <p style={{ marginTop: '1rem' }}>
        <Link href="/escala">← Voltar para a escala</Link>
      </p>
    </>
  );
}
