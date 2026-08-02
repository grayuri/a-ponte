'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { ChainView, StoreView } from '@a-ponte/contracts';
import { atualizarLoja, desativarLoja, type EstadoCadastro } from './actions';

function BotaoSalvar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} data-variante="pequeno">
      {pending ? 'Salvando…' : 'Salvar'}
    </button>
  );
}

function BotaoDesativar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} data-variante="perigo">
      {pending ? 'Desativando…' : 'Desativar loja'}
    </button>
  );
}

export function LinhaLoja({ loja, redes }: { loja: StoreView; redes: ChainView[] }) {
  const [editando, setEditando] = useState(false);
  const [estado, acao] = useFormState<EstadoCadastro, FormData>(atualizarLoja, {});
  const [estadoDesativar, acaoDesativar] = useFormState<EstadoCadastro, FormData>(
    desativarLoja,
    {},
  );

  if (!editando) {
    return (
      <tr>
        <td>{loja.displayName}</td>
        <td>{loja.chainName}</td>
        <td>{loja.city ?? '—'}</td>
        <td>
          <span className="etiqueta" data-status={loja.active ? 'CUMPRIDA' : 'CANCELADA'}>
            {loja.active ? 'Ativa' : 'Inativa'}
          </span>
        </td>
        <td>
          <button
            type="button"
            data-variante="secundario"
            onClick={() => setEditando(true)}
            style={{ minHeight: 32, padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
          >
            editar
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td colSpan={5}>
        <form action={acao} style={{ padding: '0.5rem 0' }}>
          <input type="hidden" name="id" value={loja.id} />

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
            <label htmlFor={`loja-nome-${loja.id}`}>Nome da loja</label>
            <input id={`loja-nome-${loja.id}`} name="name" defaultValue={loja.name} required />
          </div>

          <div className="campo campo-duplo">
            <div>
              <label htmlFor={`loja-rede-${loja.id}`}>Rede</label>
              <select id={`loja-rede-${loja.id}`} name="chainId" defaultValue={loja.chainId}>
                {redes.map((rede) => (
                  <option key={rede.id} value={rede.id}>
                    {rede.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`loja-turno-${loja.id}`}>Turno</label>
              <input
                id={`loja-turno-${loja.id}`}
                name="shiftLabel"
                defaultValue={loja.shiftLabel ?? ''}
                placeholder="tarde / noite"
              />
            </div>
          </div>

          <div className="campo campo-duplo">
            <div>
              <label htmlFor={`loja-cidade-${loja.id}`}>Cidade</label>
              <input
                id={`loja-cidade-${loja.id}`}
                name="city"
                defaultValue={loja.city ?? ''}
              />
            </div>
            <div>
              <label htmlFor={`loja-end-${loja.id}`}>Endereço</label>
              <input
                id={`loja-end-${loja.id}`}
                name="address"
                defaultValue={loja.address ?? ''}
              />
            </div>
          </div>

          <div className="campo">
            <label
              htmlFor={`loja-ativa-${loja.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <input
                id={`loja-ativa-${loja.id}`}
                name="active"
                type="checkbox"
                defaultChecked={loja.active}
                style={{ width: 'auto' }}
              />
              Loja ativa
            </label>
            <p className="dica">Loja inativa não aparece nas listas nem aceita novos compromissos.</p>
          </div>

          <div className="linha-botoes">
            <BotaoSalvar />
            <button
              type="button"
              data-variante="secundario"
              onClick={() => setEditando(false)}
              style={{ minHeight: 36, padding: '0.4rem 0.7rem', fontSize: '0.82rem' }}
            >
              Fechar
            </button>
          </div>
        </form>

        {loja.active ? (
          <form
            action={acaoDesativar}
            style={{ borderTop: '1px solid var(--cinza-200)', paddingTop: '0.75rem' }}
          >
            <input type="hidden" name="id" value={loja.id} />
            {estadoDesativar.erro ? (
              <div className="aviso" data-tipo="erro" role="alert">
                {estadoDesativar.erro}
              </div>
            ) : null}
            <p className="dica" style={{ marginBottom: '0.5rem' }}>
              Desativar preserva todas as colheitas já registradas nesta loja. Só é possível
              quando ela não tem mais compromissos ativos na escala.
            </p>
            <BotaoDesativar />
          </form>
        ) : null}
      </td>
    </tr>
  );
}
