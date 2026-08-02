'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { trocarSenha, type EstadoSenha } from './actions';

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Trocando…' : 'Trocar senha'}
    </button>
  );
}

export function FormularioSenha() {
  const [estado, acao] = useFormState<EstadoSenha, FormData>(trocarSenha, {});

  return (
    <form action={acao}>
      {estado.erro ? (
        <div className="aviso" data-tipo="erro" role="alert">
          {estado.erro}
        </div>
      ) : null}
      {estado.sucesso ? (
        <div className="aviso" data-tipo="sucesso" role="status">
          {estado.sucesso}
        </div>
      ) : null}

      <div className="campo">
        <label htmlFor="currentPassword">Senha atual</label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="campo campo-duplo">
        <div>
          <label htmlFor="newPassword">Nova senha</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
        <div>
          <label htmlFor="confirmacao">Repita a nova senha</label>
          <input
            id="confirmacao"
            name="confirmacao"
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
          />
        </div>
      </div>

      <div className="linha-botoes">
        <Botao />
      </div>
    </form>
  );
}
