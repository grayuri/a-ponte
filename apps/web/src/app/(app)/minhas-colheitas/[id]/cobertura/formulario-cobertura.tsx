'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { pedirCobertura, type EstadoFormulario } from '../../actions';
import type { CandidataView } from './page';

function BotaoConfirmar({ desabilitado }: { desabilitado: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || desabilitado}>
      {pending ? 'Registrando…' : 'Confirmar cobertura'}
    </button>
  );
}

export function FormularioCobertura({
  ocorrenciaId,
  candidatas,
}: {
  ocorrenciaId: string;
  candidatas: CandidataView[];
}) {
  const [estado, acao] = useFormState<EstadoFormulario, FormData>(pedirCobertura, {});
  const [escolhida, setEscolhida] = useState('');

  if (estado.sucesso) {
    return (
      <div className="aviso" data-tipo="sucesso" role="status" style={{ margin: 0 }}>
        {estado.sucesso} A instituição escolhida será avisada no WhatsApp.
      </div>
    );
  }

  return (
    <form action={acao}>
      {estado.erro ? (
        <div className="aviso" data-tipo="erro" role="alert">
          {estado.erro}
        </div>
      ) : null}

      <input type="hidden" name="occurrenceId" value={ocorrenciaId} />

      <div className="tabela-envolucro">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Instituição</th>
              <th>Cidade</th>
              <th className="numero">Colheitas no dia</th>
              <th>WhatsApp</th>
            </tr>
          </thead>
          <tbody>
            {candidatas.map((candidata) => (
              <tr key={candidata.id}>
                <td>
                  <input
                    type="radio"
                    name="coveringInstitutionId"
                    id={`c-${candidata.id}`}
                    value={candidata.id}
                    checked={escolhida === candidata.id}
                    onChange={() => setEscolhida(candidata.id)}
                    style={{ width: 'auto' }}
                  />
                </td>
                <td>
                  <label htmlFor={`c-${candidata.id}`} style={{ margin: 0, fontWeight: 500 }}>
                    {candidata.name}
                  </label>
                </td>
                <td>
                  {candidata.city ?? '—'}
                  {candidata.sameCity ? (
                    <>
                      {' '}
                      <span className="etiqueta" data-status="CUMPRIDA">
                        mesma cidade
                      </span>
                    </>
                  ) : null}
                </td>
                <td className="numero">{candidata.commitmentsOnDate}</td>
                <td>
                  {candidata.phone ?? (
                    <span style={{ color: 'var(--vermelho-600)', fontWeight: 600 }}>
                      sem telefone
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="campo" style={{ marginTop: '1rem' }}>
        <label htmlFor="reason">Motivo do remanejamento (opcional)</label>
        <input id="reason" name="reason" placeholder="Ex.: carro da instituição quebrou" />
      </div>

      <div className="linha-botoes">
        <BotaoConfirmar desabilitado={!escolhida} />
      </div>
    </form>
  );
}
