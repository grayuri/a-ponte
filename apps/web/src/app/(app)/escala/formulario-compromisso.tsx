'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { WEEKDAY_LABELS } from '@a-ponte/contracts';
import type {
  CommitmentView,
  HarvestTypeView,
  InstitutionView,
  StoreView,
  UserView,
} from '@a-ponte/contracts';
import { salvarCompromisso, type EstadoCompromisso } from './actions';

function BotaoSalvar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar compromisso'}
    </button>
  );
}

export function FormularioCompromisso({
  compromisso,
  lojas,
  instituicoes,
  tipos,
  pessoas,
}: {
  compromisso: CommitmentView | null;
  lojas: StoreView[];
  instituicoes: InstitutionView[];
  tipos: HarvestTypeView[];
  pessoas: UserView[];
}) {
  const [estado, acao] = useFormState<EstadoCompromisso, FormData>(salvarCompromisso, {});
  const campo = (nome: string) => estado.campos?.[nome];

  return (
    <form action={acao}>
      {estado.erro ? (
        <div className="aviso" data-tipo="erro" role="alert">
          {estado.erro}
        </div>
      ) : null}

      <input type="hidden" name="id" value={compromisso?.id ?? ''} />

      <div className="campo campo-duplo">
        <div>
          <label htmlFor="weekday">Dia da semana</label>
          <select id="weekday" name="weekday" required defaultValue={compromisso?.weekday ?? 1}>
            {Object.entries(WEEKDAY_LABELS).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="startTime">Horário</label>
          <input
            id="startTime"
            name="startTime"
            type="time"
            required
            defaultValue={compromisso?.startTime ?? '15:30'}
          />
          {campo('startTime') ? <p className="dica">{campo('startTime')}</p> : null}
        </div>
      </div>

      <div className="campo">
        <label htmlFor="timeLabel">Rótulo do horário (opcional)</label>
        <input
          id="timeLabel"
          name="timeLabel"
          defaultValue={compromisso?.timeLabel ?? ''}
          placeholder="Ex.: 16h / 21:45h, ENTRE 15:30h e 16h"
        />
        <p className="dica">
          Use quando o horário real não é um relógio só — o texto aparece na mensagem
          enviada ao colhedor.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="storeId">Loja / mercado</label>
        <select id="storeId" name="storeId" required defaultValue={compromisso?.storeId ?? ''}>
          <option value="">Selecione…</option>
          {lojas.map((loja) => (
            <option key={loja.id} value={loja.id}>
              {loja.displayName}
            </option>
          ))}
        </select>
        {campo('storeId') ? <p className="dica">{campo('storeId')}</p> : null}
      </div>

      <div className="campo">
        <label htmlFor="institutionId">Instituição responsável</label>
        <select
          id="institutionId"
          name="institutionId"
          required
          defaultValue={compromisso?.institutionId ?? ''}
        >
          <option value="">Selecione…</option>
          {instituicoes.map((instituicao) => (
            <option key={instituicao.id} value={instituicao.id}>
              {instituicao.name}
            </option>
          ))}
        </select>
      </div>

      <div className="campo">
        <label htmlFor="assigneeUserId">Pessoa responsável (opcional)</label>
        <select
          id="assigneeUserId"
          name="assigneeUserId"
          defaultValue={compromisso?.assigneeUserId ?? ''}
        >
          <option value="">Sem pessoa fixa — a instituição responde</option>
          {pessoas.map((pessoa) => (
            <option key={pessoa.id} value={pessoa.id}>
              {pessoa.fullName}
              {pessoa.institutionName ? ` · ${pessoa.institutionName}` : ''}
            </option>
          ))}
        </select>
        <p className="dica">
          Com pessoa definida, a mensagem do dia vai direto para ela. Sem pessoa, vai para
          o contato da instituição.
        </p>
      </div>

      <div className="campo">
        <label htmlFor="harvestTypeId">Tipo de colheita (opcional)</label>
        <select
          id="harvestTypeId"
          name="harvestTypeId"
          defaultValue={compromisso?.harvestTypeId ?? ''}
        >
          <option value="">Não especificado</option>
          {tipos.map((tipo) => (
            <option key={tipo.id} value={tipo.id}>
              {tipo.label}
            </option>
          ))}
        </select>
      </div>

      <div className="campo campo-duplo">
        <div>
          <label htmlFor="validFrom">Vale a partir de (opcional)</label>
          <input
            id="validFrom"
            name="validFrom"
            type="date"
            defaultValue={compromisso?.validFrom ?? ''}
          />
        </div>
        <div>
          <label htmlFor="validTo">Vale até (opcional)</label>
          <input id="validTo" name="validTo" type="date" defaultValue={compromisso?.validTo ?? ''} />
        </div>
      </div>

      <div className="campo">
        <label htmlFor="status">Situação</label>
        <select id="status" name="status" defaultValue={compromisso?.status ?? 'ATIVO'}>
          <option value="ATIVO">Ativo</option>
          <option value="SUSPENSO">Suspenso temporariamente</option>
          <option value="ENCERRADO">Encerrado</option>
        </select>
      </div>

      <div className="campo">
        <label htmlFor="statusNote">Observação da situação</label>
        <input
          id="statusNote"
          name="statusNote"
          defaultValue={compromisso?.statusNote ?? ''}
          placeholder="Ex.: loja fechada por 3 meses para reforma"
        />
        <p className="dica">
          Suspenso não gera escala nem cobrança — é aqui que entram os avisos que antes
          ficavam no lugar do nome do responsável na planilha.
        </p>
      </div>

      <div className="linha-botoes">
        <BotaoSalvar />
        <a className="botao" data-variante="secundario" href="/escala">
          Cancelar
        </a>
      </div>
    </form>
  );
}
