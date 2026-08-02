'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type {
  HarvestTypeView,
  HarvestView,
  InstitutionView,
  StoreView,
} from '@a-ponte/contracts';
import { editarColheita, excluirColheita, type EstadoFormulario } from '../../actions';

function BotaoSalvar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Salvando…' : 'Salvar alterações'}
    </button>
  );
}

function BotaoExcluir() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} data-variante="perigo">
      {pending ? 'Excluindo…' : 'Excluir registro'}
    </button>
  );
}

export function FormularioEdicao({
  colheita,
  lojas,
  instituicoes,
  tipos,
  podeExcluir,
  hoje,
}: {
  colheita: HarvestView;
  lojas: StoreView[];
  instituicoes: InstitutionView[];
  tipos: HarvestTypeView[];
  podeExcluir: boolean;
  hoje: string;
}) {
  const [estado, acao] = useFormState<EstadoFormulario, FormData>(editarColheita, {});
  const campo = (nome: string) => estado.campos?.[nome];

  return (
    <>
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

        <input type="hidden" name="id" value={colheita.id} />

        <div className="campo">
          <label htmlFor="storeId">Loja / mercado</label>
          <select id="storeId" name="storeId" required defaultValue={colheita.storeId}>
            {lojas.map((loja) => (
              <option key={loja.id} value={loja.id}>
                {loja.displayName}
              </option>
            ))}
          </select>
          {campo('storeId') ? <p className="dica">{campo('storeId')}</p> : null}
        </div>

        <div className="campo">
          <label htmlFor="institutionId">Destino (instituição)</label>
          <select
            id="institutionId"
            name="institutionId"
            required
            defaultValue={colheita.institutionId}
          >
            {instituicoes.map((inst) => (
              <option key={inst.id} value={inst.id}>
                {inst.name}
              </option>
            ))}
          </select>
        </div>

        <div className="campo">
          <label htmlFor="harvestTypeId">Tipo de colheita</label>
          <select
            id="harvestTypeId"
            name="harvestTypeId"
            required
            defaultValue={colheita.harvestTypeId}
          >
            {tipos.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.label}
              </option>
            ))}
          </select>
        </div>

        <div className="campo campo-duplo">
          <div>
            <label htmlFor="harvestedOn">Data</label>
            <input
              id="harvestedOn"
              name="harvestedOn"
              type="date"
              required
              max={hoje}
              defaultValue={colheita.harvestedOn}
            />
          </div>
          <div>
            <label htmlFor="harvestedAt">Horário</label>
            <input
              id="harvestedAt"
              name="harvestedAt"
              type="time"
              defaultValue={colheita.harvestedAt ?? ''}
            />
          </div>
        </div>
        {campo('harvestedOn') ? <p className="dica">{campo('harvestedOn')}</p> : null}

        <div className="campo">
          <label htmlFor="weightKg">Quilos colhidos</label>
          <input
            id="weightKg"
            name="weightKg"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0.1"
            required
            defaultValue={colheita.weightKg}
          />
          {campo('weightKg') ? <p className="dica">{campo('weightKg')}</p> : null}
        </div>

        <div className="campo">
          <label htmlFor="mainFoods">Alimentos mais colhidos</label>
          <input id="mainFoods" name="mainFoods" defaultValue={colheita.mainFoods ?? ''} />
        </div>

        <div className="campo">
          <label htmlFor="notes">Observações</label>
          <textarea id="notes" name="notes" rows={2} defaultValue={colheita.notes ?? ''} />
        </div>

        <div className="linha-botoes">
          <BotaoSalvar />
        </div>
      </form>

      {podeExcluir ? (
        <form
          action={excluirColheita}
          style={{ borderTop: '1px solid var(--cinza-200)', marginTop: '1.25rem', paddingTop: '1rem' }}
        >
          <input type="hidden" name="id" value={colheita.id} />
          <div className="card-titulo">Excluir</div>
          <p className="dica" style={{ marginBottom: '0.75rem' }}>
            {colheita.occurrenceId
              ? 'Este registro deu baixa numa colheita da escala. Ao excluir, ela volta a contar como pendente.'
              : 'Este registro não está ligado à escala.'}{' '}
            A exclusão não pode ser desfeita.
          </p>
          <BotaoExcluir />
        </form>
      ) : null}
    </>
  );
}
