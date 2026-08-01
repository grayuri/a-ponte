'use client';

import { useFormState, useFormStatus } from 'react-dom';
import type { ChainView } from '@a-ponte/contracts';
import {
  criarInstituicao,
  criarLoja,
  criarRede,
  type EstadoCadastro,
} from './actions';

function Botao({ rotulo }: { rotulo: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}>
      {pending ? 'Salvando…' : rotulo}
    </button>
  );
}

function Avisos({ estado }: { estado: EstadoCadastro }) {
  return (
    <>
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
    </>
  );
}

export function FormulariosCadastro({ redes }: { redes: ChainView[] }) {
  const [estadoRede, acaoRede] = useFormState<EstadoCadastro, FormData>(criarRede, {});
  const [estadoLoja, acaoLoja] = useFormState<EstadoCadastro, FormData>(criarLoja, {});
  const [estadoInst, acaoInst] = useFormState<EstadoCadastro, FormData>(criarInstituicao, {});

  return (
    <div className="grade-2">
      <div className="card">
        <div className="card-titulo">Nova loja</div>
        <form action={acaoLoja}>
          <Avisos estado={estadoLoja} />

          <div className="campo">
            <label htmlFor="chainId">Rede</label>
            <select id="chainId" name="chainId" required defaultValue="">
              <option value="">Selecione…</option>
              {redes.map((rede) => (
                <option key={rede.id} value={rede.id}>
                  {rede.name} ({rede.storeCount} loja(s))
                </option>
              ))}
            </select>
          </div>

          <div className="campo">
            <label htmlFor="loja-nome">Nome da loja</label>
            <input id="loja-nome" name="name" required placeholder="São Luiz - Abolição" />
          </div>

          <div className="campo campo-duplo">
            <div>
              <label htmlFor="shiftLabel">Turno (opcional)</label>
              <input id="shiftLabel" name="shiftLabel" placeholder="tarde / noite" />
              <p className="dica">
                Use quando a mesma loja tem duas colheitas em horários diferentes.
              </p>
            </div>
            <div>
              <label htmlFor="loja-cidade">Cidade</label>
              <input id="loja-cidade" name="city" placeholder="Fortaleza" />
            </div>
          </div>

          <div className="linha-botoes">
            <Botao rotulo="Cadastrar loja" />
          </div>
        </form>

        <hr style={{ border: 0, borderTop: '1px solid var(--cinza-200)', margin: '1.25rem 0' }} />

        <div className="card-titulo">Nova rede</div>
        <form action={acaoRede}>
          <Avisos estado={estadoRede} />
          <div className="campo">
            <label htmlFor="rede-nome">Nome da rede</label>
            <input id="rede-nome" name="name" required placeholder="São Luiz, Hortfelix, Lessa…" />
          </div>
          <div className="linha-botoes">
            <Botao rotulo="Cadastrar rede" />
          </div>
        </form>
      </div>

      <div className="card">
        <div className="card-titulo">Nova instituição</div>
        <form action={acaoInst}>
          <Avisos estado={estadoInst} />

          <div className="campo">
            <label htmlFor="inst-nome">Nome da instituição</label>
            <input id="inst-nome" name="name" required />
          </div>

          <div className="campo campo-duplo">
            <div>
              <label htmlFor="shortName">Nome curto</label>
              <input id="shortName" name="shortName" placeholder="Como aparece na escala" />
            </div>
            <div>
              <label htmlFor="inst-cidade">Cidade</label>
              <input id="inst-cidade" name="city" placeholder="Fortaleza" />
            </div>
          </div>

          <div className="campo campo-duplo">
            <div>
              <label htmlFor="contactName">Pessoa de contato</label>
              <input id="contactName" name="contactName" />
            </div>
            <div>
              <label htmlFor="inst-tel">WhatsApp da instituição</label>
              <input id="inst-tel" name="phone" inputMode="tel" placeholder="(85) 99999-9999" />
            </div>
          </div>

          <p className="dica">
            Este é o telefone que recebe a escala quando o compromisso não tem uma pessoa
            nominal.
          </p>

          <div className="linha-botoes">
            <Botao rotulo="Cadastrar instituição" />
          </div>
        </form>
      </div>
    </div>
  );
}
