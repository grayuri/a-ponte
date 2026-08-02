'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { InstitutionView } from '@a-ponte/contracts';
import {
  atualizarInstituicao,
  desativarInstituicao,
  type EstadoCadastro,
} from './actions';

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
      {pending ? 'Desativando…' : 'Desativar instituição'}
    </button>
  );
}

export function LinhaInstituicao({ instituicao }: { instituicao: InstitutionView }) {
  const [editando, setEditando] = useState(false);
  const [estado, acao] = useFormState<EstadoCadastro, FormData>(atualizarInstituicao, {});
  const [estadoDesativar, acaoDesativar] = useFormState<EstadoCadastro, FormData>(
    desativarInstituicao,
    {},
  );

  if (!editando) {
    return (
      <tr>
        <td>
          {instituicao.name}
          {!instituicao.active ? (
            <>
              {' '}
              <span className="etiqueta" data-status="CANCELADA">
                Inativa
              </span>
            </>
          ) : null}
        </td>
        <td>{instituicao.contactName ?? '—'}</td>
        <td>
          {instituicao.phone ?? (
            <span style={{ color: 'var(--vermelho-600)', fontWeight: 600 }}>sem telefone</span>
          )}
        </td>
        <td className="numero">{instituicao.memberCount}</td>
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
          <input type="hidden" name="id" value={instituicao.id} />

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
            <label htmlFor={`inst-nome-${instituicao.id}`}>Nome da instituição</label>
            <input
              id={`inst-nome-${instituicao.id}`}
              name="name"
              defaultValue={instituicao.name}
              required
            />
          </div>

          <div className="campo campo-duplo">
            <div>
              <label htmlFor={`inst-curto-${instituicao.id}`}>Nome curto</label>
              <input
                id={`inst-curto-${instituicao.id}`}
                name="shortName"
                defaultValue={instituicao.shortName ?? ''}
              />
            </div>
            <div>
              <label htmlFor={`inst-cidade-${instituicao.id}`}>Cidade</label>
              <input
                id={`inst-cidade-${instituicao.id}`}
                name="city"
                defaultValue={instituicao.city ?? ''}
              />
            </div>
          </div>

          <div className="campo campo-duplo">
            <div>
              <label htmlFor={`inst-contato-${instituicao.id}`}>Pessoa de contato</label>
              <input
                id={`inst-contato-${instituicao.id}`}
                name="contactName"
                defaultValue={instituicao.contactName ?? ''}
              />
            </div>
            <div>
              <label htmlFor={`inst-tel-${instituicao.id}`}>WhatsApp</label>
              <input
                id={`inst-tel-${instituicao.id}`}
                name="phone"
                inputMode="tel"
                defaultValue={instituicao.phone ?? ''}
                placeholder="(85) 99999-9999"
              />
            </div>
          </div>

          <div className="campo">
            <label htmlFor={`inst-end-${instituicao.id}`}>Endereço</label>
            <input
              id={`inst-end-${instituicao.id}`}
              name="address"
              defaultValue={instituicao.address ?? ''}
            />
          </div>

          <p className="dica">
            Sem o WhatsApp preenchido, esta instituição não recebe a escala do dia nem a
            cobrança de pendência quando o compromisso não tem uma pessoa nominal.
          </p>

          <div className="campo">
            <label
              htmlFor={`inst-ativa-${instituicao.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <input
                id={`inst-ativa-${instituicao.id}`}
                name="active"
                type="checkbox"
                defaultChecked={instituicao.active}
                style={{ width: 'auto' }}
              />
              Instituição ativa
            </label>
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

        {instituicao.active ? (
          <form
            action={acaoDesativar}
            style={{ borderTop: '1px solid var(--cinza-200)', paddingTop: '0.75rem' }}
          >
            <input type="hidden" name="id" value={instituicao.id} />
            {estadoDesativar.erro ? (
              <div className="aviso" data-tipo="erro" role="alert">
                {estadoDesativar.erro}
              </div>
            ) : null}
            <p className="dica" style={{ marginBottom: '0.5rem' }}>
              Desativar preserva todo o histórico de colheitas desta instituição. Só é
              possível quando ela não tem mais compromissos na escala nem pessoas ativas
              vinculadas.
            </p>
            <BotaoDesativar />
          </form>
        ) : null}
      </td>
    </tr>
  );
}
