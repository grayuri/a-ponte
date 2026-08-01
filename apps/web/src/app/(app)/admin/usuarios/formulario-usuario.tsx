'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type { InstitutionView, UserRole } from '@a-ponte/contracts';
import { criarUsuario, type EstadoUsuario } from './actions';

function BotaoSalvar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Cadastrando…' : 'Cadastrar pessoa'}
    </button>
  );
}

/** Sugere um usuário a partir do nome: "Ana Lúcia Souza" → "ana.souza". */
function sugerirUsuario(nomeCompleto: string): string {
  const partes = nomeCompleto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0]!;
  return `${partes[0]}.${partes[partes.length - 1]}`;
}

export function FormularioUsuario({
  instituicoes,
  papelDoAtor,
  instituicaoDoAtor,
}: {
  instituicoes: InstitutionView[];
  papelDoAtor: UserRole;
  instituicaoDoAtor: string | null;
}) {
  const [estado, acao] = useFormState<EstadoUsuario, FormData>(criarUsuario, {});
  const [usuario, setUsuario] = useState('');
  const [papel, setPapel] = useState<UserRole>('COLHEDOR');

  const campo = (nome: string) => estado.campos?.[nome];

  // Quem gerencia uma instituição só cadastra colhedores da própria casa.
  const ehGestorDeInstituicao = papelDoAtor === 'INSTITUICAO';
  const podeCriarAdmin = papelDoAtor === 'ADMIN';

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

      <div className="campo campo-duplo">
        <div>
          <label htmlFor="fullName">Nome completo</label>
          <input
            id="fullName"
            name="fullName"
            required
            minLength={3}
            onBlur={(e) => {
              if (!usuario) setUsuario(sugerirUsuario(e.target.value));
            }}
          />
          {campo('fullName') ? <p className="dica">{campo('fullName')}</p> : null}
        </div>
        <div>
          <label htmlFor="username">Usuário (para entrar)</label>
          <input
            id="username"
            name="username"
            required
            value={usuario}
            onChange={(e) => setUsuario(e.target.value.toLowerCase())}
            pattern="[a-z0-9._-]+"
            placeholder="ana.souza"
          />
          {campo('username') ? <p className="dica">{campo('username')}</p> : null}
        </div>
      </div>

      <div className="campo campo-duplo">
        <div>
          <label htmlFor="email">E-mail</label>
          <input id="email" name="email" type="email" required />
          {campo('email') ? <p className="dica">{campo('email')}</p> : null}
        </div>
        <div>
          <label htmlFor="phone">WhatsApp</label>
          <input
            id="phone"
            name="phone"
            inputMode="tel"
            placeholder="(85) 99999-9999"
          />
          <p className="dica">Sem telefone, a pessoa não recebe a escala nem a cobrança.</p>
          {campo('phone') ? <p className="dica">{campo('phone')}</p> : null}
        </div>
      </div>

      <div className="campo campo-duplo">
        <div>
          <label htmlFor="role">Papel</label>
          <select
            id="role"
            name="role"
            value={papel}
            onChange={(e) => setPapel(e.target.value as UserRole)}
            disabled={ehGestorDeInstituicao}
          >
            <option value="COLHEDOR">Colhedor(a) — registra a colheita</option>
            {!ehGestorDeInstituicao ? (
              <option value="INSTITUICAO">Instituição — responde por uma instituição</option>
            ) : null}
            {!ehGestorDeInstituicao ? (
              <option value="COORDENADOR">Coordenação — opera a rede inteira</option>
            ) : null}
            {podeCriarAdmin ? <option value="ADMIN">Administração — acesso total</option> : null}
          </select>
          {ehGestorDeInstituicao ? <input type="hidden" name="role" value="COLHEDOR" /> : null}
        </div>

        <div>
          <label htmlFor="institutionId">Instituição</label>
          <select
            id="institutionId"
            name="institutionId"
            required={papel === 'INSTITUICAO'}
            defaultValue={instituicaoDoAtor ?? ''}
            disabled={ehGestorDeInstituicao}
          >
            <option value="">Sem vínculo</option>
            {instituicoes.map((instituicao) => (
              <option key={instituicao.id} value={instituicao.id}>
                {instituicao.name}
              </option>
            ))}
          </select>
          {ehGestorDeInstituicao && instituicaoDoAtor ? (
            <input type="hidden" name="institutionId" value={instituicaoDoAtor} />
          ) : null}
        </div>
      </div>

      <div className="campo">
        <label htmlFor="password">Senha inicial</label>
        <input id="password" name="password" type="text" required minLength={6} />
        <p className="dica">
          Anote e passe para a pessoa. Ela pode pedir troca à coordenação depois.
        </p>
        {campo('password') ? <p className="dica">{campo('password')}</p> : null}
      </div>

      <div className="linha-botoes">
        <BotaoSalvar />
      </div>
    </form>
  );
}
