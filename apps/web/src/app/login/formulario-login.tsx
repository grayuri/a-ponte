'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { entrar, type EstadoLogin } from './actions';

function BotaoEntrar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Entrando…' : 'Entrar'}
    </button>
  );
}

export function FormularioLogin({ proximo }: { proximo: string }) {
  const [estado, acao] = useFormState<EstadoLogin, FormData>(entrar, {});

  return (
    <form action={acao}>
      {estado.erro ? (
        <div className="aviso" data-tipo="erro" role="alert">
          {estado.erro}
        </div>
      ) : null}

      <input type="hidden" name="proximo" value={proximo} />

      <div className="campo">
        <label htmlFor="identifier">Usuário ou e-mail</label>
        <input
          id="identifier"
          name="identifier"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          required
          placeholder="seu.usuario"
        />
      </div>

      <div className="campo">
        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>

      <BotaoEntrar />
    </form>
  );
}
