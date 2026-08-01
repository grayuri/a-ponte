'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import type {
  HarvestTypeView,
  InstitutionView,
  OccurrenceView,
  StoreView,
} from '@a-ponte/contracts';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { registrarColheita, type EstadoFormulario } from '../actions';

function BotaoSalvar({ enviandoFoto }: { enviandoFoto: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || enviandoFoto}>
      {enviandoFoto ? 'Enviando foto…' : pending ? 'Salvando…' : 'Registrar colheita'}
    </button>
  );
}

export function FormularioColheita({
  lojas,
  instituicoes,
  tipos,
  ocorrencia,
  hoje,
}: {
  lojas: StoreView[];
  instituicoes: InstitutionView[];
  tipos: HarvestTypeView[];
  ocorrencia: OccurrenceView | null;
  hoje: string;
}) {
  const [estado, acao] = useFormState<EstadoFormulario, FormData>(registrarColheita, {});
  const [caminhoFoto, setCaminhoFoto] = useState('');
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState<string | null>(null);

  /**
   * A foto vai direto do celular para o Storage do Supabase, na pasta do
   * próprio usuário. Só o caminho é enviado à API — o arquivo não trafega duas
   * vezes, o que importa muito numa conexão de dentro do supermercado.
   */
  async function enviarFoto(arquivo: File) {
    setErroFoto(null);
    setEnviandoFoto(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErroFoto('Sua sessão expirou. Entre novamente.');
        return;
      }

      const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const caminho = `${user.id}/${Date.now()}.${extensao}`;

      const { error } = await supabase.storage
        .from('colheitas')
        .upload(caminho, arquivo, { upsert: false, contentType: arquivo.type });

      if (error) {
        setErroFoto(`Não foi possível enviar a foto: ${error.message}`);
        return;
      }

      setCaminhoFoto(caminho);
    } finally {
      setEnviandoFoto(false);
    }
  }

  const campo = (nome: string) => estado.campos?.[nome];

  return (
    <form action={acao}>
      {estado.erro ? (
        <div className="aviso" data-tipo="erro" role="alert">
          {estado.erro}
        </div>
      ) : null}

      <input type="hidden" name="occurrenceId" value={ocorrencia?.id ?? ''} />
      <input type="hidden" name="photoPath" value={caminhoFoto} />

      <div className="campo">
        <label htmlFor="storeId">Loja / mercado</label>
        <select
          id="storeId"
          name="storeId"
          required
          defaultValue={ocorrencia?.storeId ?? ''}
          // Vindo da escala, a loja é a da escala — mudar aqui descasaria o
          // registro do compromisso que ele dá baixa.
          disabled={Boolean(ocorrencia)}
        >
          <option value="">Selecione…</option>
          {lojas.map((loja) => (
            <option key={loja.id} value={loja.id}>
              {loja.displayName}
            </option>
          ))}
        </select>
        {ocorrencia ? (
          <input type="hidden" name="storeId" value={ocorrencia.storeId} />
        ) : null}
        {campo('storeId') ? <p className="dica">{campo('storeId')}</p> : null}
      </div>

      <div className="campo">
        <label htmlFor="institutionId">Destino da colheita (instituição)</label>
        <select
          id="institutionId"
          name="institutionId"
          required
          defaultValue={ocorrencia?.coveringInstitutionId ?? ocorrencia?.institutionId ?? ''}
        >
          <option value="">Selecione…</option>
          {instituicoes.map((instituicao) => (
            <option key={instituicao.id} value={instituicao.id}>
              {instituicao.name}
            </option>
          ))}
        </select>
        {campo('institutionId') ? <p className="dica">{campo('institutionId')}</p> : null}
      </div>

      <div className="campo">
        <label htmlFor="harvestTypeId">Tipo de colheita</label>
        <select id="harvestTypeId" name="harvestTypeId" required defaultValue="">
          <option value="">Selecione…</option>
          {tipos.map((tipo) => (
            <option key={tipo.id} value={tipo.id}>
              {tipo.label}
            </option>
          ))}
        </select>
        {campo('harvestTypeId') ? <p className="dica">{campo('harvestTypeId')}</p> : null}
      </div>

      <div className="campo campo-duplo">
        <div>
          <label htmlFor="harvestedOn">Data da colheita</label>
          <input
            id="harvestedOn"
            name="harvestedOn"
            type="date"
            required
            max={hoje}
            defaultValue={ocorrencia?.date ?? hoje}
          />
        </div>
        <div>
          <label htmlFor="harvestedAt">Horário</label>
          <input
            id="harvestedAt"
            name="harvestedAt"
            type="time"
            defaultValue={ocorrencia?.expectedTime ?? ''}
          />
        </div>
      </div>
      {campo('harvestedOn') ? <p className="dica">{campo('harvestedOn')}</p> : null}

      <div className="campo">
        <label htmlFor="weightKg">Quantos quilos foram colhidos?</label>
        <input
          id="weightKg"
          name="weightKg"
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0.1"
          required
          placeholder="Ex.: 42.5"
        />
        {campo('weightKg') ? <p className="dica">{campo('weightKg')}</p> : null}
      </div>

      <div className="campo">
        <label htmlFor="mainFoods">Alimentos mais colhidos</label>
        <input
          id="mainFoods"
          name="mainFoods"
          placeholder="Ex.: banana, cenoura, pão"
        />
        <p className="dica">Uma lista curta já ajuda no relatório do mês.</p>
      </div>

      <div className="campo">
        <label htmlFor="foto">Foto da colheita</label>
        <input
          id="foto"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(evento) => {
            const arquivo = evento.target.files?.[0];
            if (arquivo) void enviarFoto(arquivo);
          }}
        />
        <p className="dica">
          Uma imagem só. Evite fotografar a colheita no chão e, se der, deixe a
          identificação da instituição visível.
        </p>
        {erroFoto ? (
          <div className="aviso" data-tipo="erro" style={{ marginTop: '0.5rem' }}>
            {erroFoto}
          </div>
        ) : null}
        {caminhoFoto ? (
          <div className="aviso" data-tipo="sucesso" style={{ marginTop: '0.5rem' }}>
            Foto enviada.
          </div>
        ) : null}
      </div>

      <div className="campo">
        <label htmlFor="notes">Observações (opcional)</label>
        <textarea id="notes" name="notes" rows={2} />
      </div>

      <div className="linha-botoes">
        <BotaoSalvar enviandoFoto={enviandoFoto} />
      </div>
    </form>
  );
}
