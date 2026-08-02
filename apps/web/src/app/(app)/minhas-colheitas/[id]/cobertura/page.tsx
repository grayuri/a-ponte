import Link from 'next/link';
import type { OccurrenceView } from '@a-ponte/contracts';
import { api } from '@/lib/api';
import { formatarDataExtenso } from '@/lib/format';
import { FormularioCobertura } from './formulario-cobertura';

export const metadata = { title: 'Pedir cobertura — Rede Colheita' };

export interface CandidataView {
  id: string;
  name: string;
  city: string | null;
  phone: string | null;
  commitmentsOnDate: number;
  sameCity: boolean;
}

export default async function PaginaCobertura({ params }: { params: { id: string } }) {
  const [ocorrencia, candidatas] = await Promise.all([
    api<OccurrenceView>(`/occurrences/${params.id}`, { revalidate: false }),
    api<CandidataView[]>(`/occurrences/${params.id}/coverage-candidates`, { revalidate: false }),
  ]);

  const semTelefone = candidatas.filter((c) => !c.phone).length;

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Quem vai cobrir?</h1>
        <p>
          {ocorrencia.storeName} · {formatarDataExtenso(ocorrencia.date)} ·{' '}
          {ocorrencia.timeLabel ?? ocorrencia.expectedTime}
        </p>
      </div>

      <div className="aviso" data-tipo="info">
        A colheita está escalada para <strong>{ocorrencia.institutionName}</strong>. Ao escolher
        outra instituição, ela assume esta data — e recebe um aviso no WhatsApp com a loja, o
        dia e o horário.
      </div>

      {semTelefone > 0 ? (
        <div className="aviso" data-tipo="atencao">
          {semTelefone} das instituições abaixo não têm WhatsApp cadastrado. Elas podem ser
          escolhidas, mas <strong>não serão avisadas automaticamente</strong> — alguém vai
          precisar ligar.
        </div>
      ) : null}

      <div className="card">
        <div className="card-titulo">
          Instituições disponíveis — as com menos colheitas nesse dia aparecem primeiro
        </div>

        {candidatas.length === 0 ? (
          <div className="vazio">
            <strong>Nenhuma outra instituição ativa cadastrada.</strong>
            Cadastre instituições em Cadastros para poder remanejar colheitas.
          </div>
        ) : (
          <FormularioCobertura ocorrenciaId={ocorrencia.id} candidatas={candidatas} />
        )}
      </div>

      <p style={{ marginTop: '1rem' }}>
        <Link href="/minhas-colheitas">← Voltar para minhas colheitas</Link>
      </p>
    </>
  );
}
