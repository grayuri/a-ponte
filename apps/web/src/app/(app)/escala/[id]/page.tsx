import Link from 'next/link';
import type {
  CommitmentView,
  HarvestTypeView,
  InstitutionView,
  Paginated,
  StoreView,
  UserView,
} from '@a-ponte/contracts';
import { api } from '@/lib/api';
import { encerrarCompromisso } from '../actions';
import { FormularioCompromisso } from '../formulario-compromisso';

export const metadata = { title: 'Editar compromisso — Rede Colheita' };

export default async function PaginaEditarCompromisso({
  params,
}: {
  params: { id: string };
}) {
  const [compromisso, lojas, instituicoes, tipos, pessoas] = await Promise.all([
    api<CommitmentView>(`/schedule/commitments/${params.id}`, { revalidate: false }),
    api<StoreView[]>('/catalog/stores', { revalidate: 300 }),
    api<InstitutionView[]>('/catalog/institutions', { revalidate: 300 }),
    api<HarvestTypeView[]>('/catalog/harvest-types', { revalidate: 300 }),
    api<Paginated<UserView>>('/users', { query: { pageSize: 200, status: 'ATIVO' } }),
  ]);

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Editar compromisso</h1>
        <p>
          {compromisso.weekdayLabel} · {compromisso.timeLabel ?? compromisso.startTime} ·{' '}
          {compromisso.storeName}
        </p>
      </div>

      <div className="aviso" data-tipo="info">
        Ao salvar, as colheitas <strong>futuras ainda não registradas</strong> são refeitas com
        os novos dados. As passadas ficam como estão — são histórico.
      </div>

      <div className="card">
        <FormularioCompromisso
          compromisso={compromisso}
          lojas={lojas}
          instituicoes={instituicoes}
          tipos={tipos}
          pessoas={pessoas.items}
        />
      </div>

      <div className="card">
        <div className="card-titulo">Encerrar compromisso</div>
        <p className="dica" style={{ marginBottom: '0.75rem' }}>
          Encerrar remove as colheitas futuras ainda não registradas e preserva todo o
          histórico. Use quando a loja sair da rede ou a parceria terminar.
        </p>
        <form action={encerrarCompromisso}>
          <input type="hidden" name="id" value={compromisso.id} />
          <div className="campo">
            <label htmlFor="note">Motivo</label>
            <input id="note" name="note" placeholder="Ex.: loja encerrou a parceria" />
          </div>
          <div className="linha-botoes">
            <button type="submit" data-variante="perigo">
              Encerrar compromisso
            </button>
          </div>
        </form>
      </div>

      <p style={{ marginTop: '1rem' }}>
        <Link href="/escala">← Voltar para a escala</Link>
      </p>
    </>
  );
}
