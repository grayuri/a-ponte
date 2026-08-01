'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { rodarVarredura, type EstadoVarredura } from './actions';

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} data-variante="secundario">
      {pending ? 'Verificando…' : 'Verificar pendências agora'}
    </button>
  );
}

export function AcoesPendencia() {
  const [estado, acao] = useFormState<EstadoVarredura, FormData>(rodarVarredura, {});

  return (
    <>
      <form action={acao}>
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
