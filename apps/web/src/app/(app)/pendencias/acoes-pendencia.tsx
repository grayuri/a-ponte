'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { rodarVarredura, type EstadoVarredura } from './actions';

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} data-variante="secundario">
      {pending ? 'Verificando…' : 'Verificar pendências'}
    </button>
  );
}

/**
 * A varredura aceita uma data porque o corte pode ter passado com o sistema
 * fora do ar — e sem poder varrer um dia anterior, aquele dia ficaria sem
 * cobrança para sempre.
 */
export function AcoesPendencia({ hoje }: { hoje: string }) {
  const [estado, acao] = useFormState<EstadoVarredura, FormData>(rodarVarredura, {});

  return (
    <>
      <form action={acao} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
        <div className="campo" style={{ marginTop: 0 }}>
          <label htmlFor="data-varredura">Verificar o dia</label>
          <input id="data-varredura" name="data" type="date" defaultValue={hoje} max={hoje} />
        </div>
        <Botao />
      </form>

      {estado.mensagem ? (
        <div className="aviso" data-tipo="sucesso" style={{ width: '100%', margin: 0 }}>
          {estado.mensagem}
        </div>
      ) : null}
      {estado.erro ? (
        <div className="aviso" data-tipo="erro" style={{ width: '100%', margin: 0 }}>
          {estado.erro}
        </div>
      ) : null}
    </>
  );
}
