'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { dispararEscala, drenarFila, type EstadoDisparo } from './actions';

function BotaoDisparar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Montando mensagens…' : 'Disparar escala do dia'}
    </button>
  );
}

export function PainelDisparo({ hoje, naFila }: { hoje: string; naFila: number }) {
  const [estado, acao] = useFormState<EstadoDisparo, FormData>(dispararEscala, {});

  return (
    <div className="card">
      <div className="card-titulo">Disparo manual</div>

      {estado.mensagem ? (
        <div className="aviso" data-tipo="sucesso" role="status">
          {estado.mensagem}
        </div>
      ) : null}
      {estado.erro ? (
        <div className="aviso" data-tipo="erro" role="alert">
          {estado.erro}
        </div>
      ) : null}

      <form action={acao} className="filtros" style={{ marginBottom: 0 }}>
        <div className="campo">
          <label htmlFor="data">Dia da escala</label>
          <input id="data" name="data" type="date" defaultValue={hoje} />
        </div>
        <BotaoDisparar />
      </form>

      <p className="dica">
        Monta uma mensagem por pessoa, com todas as colheitas dela naquele dia — quem tem três
        colheitas recebe uma mensagem, não três.
      </p>

      {naFila > 0 ? (
        <form action={drenarFila} style={{ marginTop: '0.75rem' }}>
          <button type="submit" data-variante="secundario">
            Entregar {naFila} mensagem(ns) na fila agora
          </button>
        </form>
      ) : null}
    </div>
  );
}
