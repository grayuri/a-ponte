'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { OCCURRENCE_STATUS_LABELS, type OccurrenceView } from '@a-ponte/contracts';
import { justificarAusencia, type EstadoFormulario } from './actions';

function BotaoEnviar({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} data-variante="pequeno">
      {pending ? 'Enviando…' : rotulo}
    </button>
  );
}

export function CartaoOcorrencia({
  ocorrencia,
  podeAgir,
}: {
  ocorrencia: OccurrenceView;
  podeAgir: boolean;
}) {
  const [justificando, setJustificando] = useState(false);
  const [estado, acao] = useFormState<EstadoFormulario, FormData>(justificarAusencia, {});

  return (
    <div className="colheita" data-status={ocorrencia.status}>
      <div className="topo-cartao">
        <div>
          <div className="loja">{ocorrencia.storeName}</div>
          <div className="meta">
            Destino: <strong>{ocorrencia.coveringInstitutionName ?? ocorrencia.institutionName}</strong>
            {ocorrencia.coveringInstitutionName ? (
              <> (cobrindo {ocorrencia.institutionName})</>
            ) : null}
            {ocorrencia.harvestTypeLabel ? <> · {ocorrencia.harvestTypeLabel}</> : null}
          </div>
          {ocorrencia.statusReason ? (
            <div className="meta">Motivo: {ocorrencia.statusReason}</div>
          ) : null}
        </div>

        <div style={{ textAlign: 'right' }}>
          <div className="horario">{ocorrencia.timeLabel ?? ocorrencia.expectedTime}</div>
          <span className="etiqueta" data-status={ocorrencia.status}>
            {OCCURRENCE_STATUS_LABELS[ocorrencia.status]}
          </span>
        </div>
      </div>

      {ocorrencia.status === 'CUMPRIDA' && ocorrencia.weightKg !== null ? (
        <div className="meta" style={{ marginTop: '0.5rem' }}>
          Registrado: <strong>{ocorrencia.weightKg.toLocaleString('pt-BR')} kg</strong>
        </div>
      ) : null}

      {estado.sucesso ? (
        <div className="aviso" data-tipo="sucesso" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          {estado.sucesso}
        </div>
      ) : null}

      {podeAgir && !estado.sucesso ? (
        <>
          <div className="linha-botoes">
            <Link
              className="botao"
              data-variante="pequeno"
              href={`/minhas-colheitas/registrar?ocorrencia=${ocorrencia.id}`}
            >
              Registrar colheita
            </Link>

            {!justificando ? (
              <button
                type="button"
                data-variante="secundario"
                onClick={() => setJustificando(true)}
                style={{ minHeight: 36, padding: '0.4rem 0.7rem', fontSize: '0.82rem' }}
              >
                Não vou poder ir
              </button>
            ) : null}

            <Link
              className="botao"
              data-variante="secundario"
              href={`/minhas-colheitas/${ocorrencia.id}/cobertura`}
              style={{ minHeight: 36, padding: '0.4rem 0.7rem', fontSize: '0.82rem' }}
            >
              Passar para outra instituição
            </Link>
          </div>

          {justificando ? (
            <form action={acao} style={{ marginTop: '0.75rem' }}>
              <input type="hidden" name="occurrenceId" value={ocorrencia.id} />

              {estado.erro ? (
                <div className="aviso" data-tipo="erro">
                  {estado.erro}
                </div>
              ) : null}

              <div className="campo">
                <label htmlFor={`motivo-${ocorrencia.id}`}>Por que não vai ser possível?</label>
                <input
                  id={`motivo-${ocorrencia.id}`}
                  name="reason"
                  required
                  minLength={3}
                  placeholder="Ex.: carro quebrado, equipe indisponível"
                />
                <p className="dica">
                  A coordenação é avisada e esta colheita sai da cobrança do dia.
                </p>
              </div>

              <div className="linha-botoes">
                <BotaoEnviar rotulo="Avisar coordenação" />
                <button
                  type="button"
                  data-variante="secundario"
                  onClick={() => setJustificando(false)}
                  style={{ minHeight: 36, padding: '0.4rem 0.7rem', fontSize: '0.82rem' }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
