'use client';

import { useState } from 'react';
import type { InstitutionView, UserView } from '@a-ponte/contracts';
import { atualizarUsuario, redefinirSenha } from './actions';

export function LinhaUsuario({
  pessoa,
  instituicoes,
  papelRotulo,
  ultimaColheita,
  podeEditarPapel,
}: {
  pessoa: UserView;
  instituicoes: InstitutionView[];
  papelRotulo: string;
  ultimaColheita: string;
  podeEditarPapel: boolean;
}) {
  const [editando, setEditando] = useState(false);

  if (!editando) {
    return (
      <tr>
        <td>{pessoa.fullName}</td>
        <td>{pessoa.username}</td>
        <td>
          {pessoa.phone ?? (
            <span style={{ color: 'var(--vermelho-600)', fontWeight: 600 }}>sem telefone</span>
          )}
        </td>
        <td>{papelRotulo}</td>
        <td>{pessoa.institutionName ?? '—'}</td>
        <td className="numero">{pessoa.harvestCount}</td>
        <td>{ultimaColheita}</td>
        <td>
          <span className="etiqueta" data-status={pessoa.status === 'ATIVO' ? 'CUMPRIDA' : 'CANCELADA'}>
            {pessoa.status === 'ATIVO' ? 'Ativo' : 'Inativo'}
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
      <td colSpan={9}>
        <form action={atualizarUsuario} style={{ padding: '0.5rem 0' }}>
          <input type="hidden" name="id" value={pessoa.id} />

          <div className="campo campo-duplo">
            <div>
              <label htmlFor={`nome-${pessoa.id}`}>Nome completo</label>
              <input id={`nome-${pessoa.id}`} name="fullName" defaultValue={pessoa.fullName} required />
            </div>
            <div>
              <label htmlFor={`tel-${pessoa.id}`}>WhatsApp</label>
              <input
                id={`tel-${pessoa.id}`}
                name="phone"
                defaultValue={pessoa.phone ?? ''}
                placeholder="(85) 99999-9999"
              />
            </div>
          </div>

          <div className="campo campo-duplo">
            <div>
              <label htmlFor={`papel-${pessoa.id}`}>Papel</label>
              <select
                id={`papel-${pessoa.id}`}
                name="role"
                defaultValue={pessoa.role}
                disabled={!podeEditarPapel}
              >
                <option value="COLHEDOR">Colhedor(a)</option>
                <option value="INSTITUICAO">Instituição</option>
                <option value="COORDENADOR">Coordenação</option>
                <option value="ADMIN">Administração</option>
              </select>
              {!podeEditarPapel ? <input type="hidden" name="role" value={pessoa.role} /> : null}
            </div>
            <div>
              <label htmlFor={`inst-${pessoa.id}`}>Instituição</label>
              <select
                id={`inst-${pessoa.id}`}
                name="institutionId"
                defaultValue={pessoa.institutionId ?? ''}
              >
                <option value="">Sem vínculo</option>
                {instituicoes.map((instituicao) => (
                  <option key={instituicao.id} value={instituicao.id}>
                    {instituicao.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="campo">
            <label htmlFor={`status-${pessoa.id}`}>Situação</label>
            <select id={`status-${pessoa.id}`} name="status" defaultValue={pessoa.status}>
              <option value="ATIVO">Ativo</option>
              <option value="INATIVO">Inativo — não entra e sai das listas</option>
            </select>
            <p className="dica">
              Desativar preserva todo o histórico de colheitas da pessoa.
            </p>
          </div>

          <div className="linha-botoes">
            <button type="submit" data-variante="pequeno">
              Salvar
            </button>
            <button
              type="button"
              data-variante="secundario"
              onClick={() => setEditando(false)}
              style={{ minHeight: 36, padding: '0.4rem 0.7rem', fontSize: '0.82rem' }}
            >
              Cancelar
            </button>
          </div>
        </form>

        <form action={redefinirSenha} style={{ borderTop: '1px solid var(--cinza-200)', paddingTop: '0.75rem' }}>
          <input type="hidden" name="id" value={pessoa.id} />
          <div className="campo">
            <label htmlFor={`senha-${pessoa.id}`}>Nova senha</label>
            <input
              id={`senha-${pessoa.id}`}
              name="password"
              type="text"
              minLength={6}
              placeholder="mínimo 6 caracteres"
            />
          </div>
          <div className="linha-botoes">
            <button type="submit" data-variante="secundario">
              Redefinir senha
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}
