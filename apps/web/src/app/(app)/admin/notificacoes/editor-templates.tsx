'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { salvarTemplate, type EstadoTemplate } from './actions';

export interface TemplateView {
  kind: string;
  body: string;
  active: boolean;
  textoPadrao: string;
  previa: string;
  usandoPersonalizado: boolean;
}

const ROTULO: Record<string, string> = {
  ESCALA_DO_DIA: 'Escala do dia',
  COBRANCA_PENDENCIA: 'Cobrança de pendência',
};

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} data-variante="pequeno">
      {pending ? 'Salvando…' : 'Salvar texto'}
    </button>
  );
}

function Editor({ template }: { template: TemplateView }) {
  const [estado, acao] = useFormState<EstadoTemplate, FormData>(salvarTemplate, {});
  const [aberto, setAberto] = useState(false);

  return (
    <div style={{ borderTop: '1px solid var(--cinza-100)', padding: '0.85rem 0' }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}
      >
        <div>
          <strong>{ROTULO[template.kind] ?? template.kind}</strong>
          <div className="dica" style={{ marginTop: 0 }}>
            {template.usandoPersonalizado
              ? 'usando texto personalizado'
              : 'usando o texto padrão do sistema'}
          </div>
        </div>
        <button
          type="button"
          data-variante="secundario"
          onClick={() => setAberto(!aberto)}
          style={{ minHeight: 32, padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
        >
          {aberto ? 'fechar' : 'editar texto'}
        </button>
      </div>

      {!aberto ? (
        <pre
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            fontSize: '0.85rem',
            background: 'var(--cinza-50)',
            border: '1px solid var(--cinza-200)',
            borderRadius: 'var(--raio)',
            padding: '0.6rem 0.75rem',
            margin: '0.6rem 0 0',
          }}
        >
          {template.previa}
        </pre>
      ) : (
        <form action={acao} style={{ marginTop: '0.75rem' }}>
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

          <input type="hidden" name="kind" value={template.kind} />

          <div className="campo">
            <label htmlFor={`body-${template.kind}`}>Texto da mensagem</label>
            <textarea
              id={`body-${template.kind}`}
              name="body"
              rows={10}
              defaultValue={template.body || template.textoPadrao}
              style={{ fontFamily: 'inherit', fontSize: '0.9rem' }}
            />
            <p className="dica">
              Trechos entre chaves são substituídos na hora do envio:{' '}
              <code>{'{{nome}}'}</code>, <code>{'{{data}}'}</code>, <code>{'{{itens}}'}</code>{' '}
              (a lista de colheitas) e <code>{'{{link}}'}</code>.
            </p>
          </div>

          <div className="campo">
            <label
              htmlFor={`ativo-${template.kind}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <input
                id={`ativo-${template.kind}`}
                name="active"
                type="checkbox"
                defaultChecked={template.active}
                style={{ width: 'auto' }}
              />
              Usar este texto no lugar do padrão
            </label>
            <p className="dica">
              Desmarcado, o sistema volta a usar o texto de fábrica — sem precisar apagar o
              que você escreveu.
            </p>
          </div>

          <div className="linha-botoes">
            <Botao />
          </div>
        </form>
      )}
    </div>
  );
}

export function EditorTemplates({ templates }: { templates: TemplateView[] }) {
  return (
    <div className="card">
      <div className="card-titulo">Textos das mensagens</div>
      <p className="dica" style={{ marginBottom: '0.5rem' }}>
        O que aparece abaixo é exatamente o que a pessoa recebe. Ajustar o tom depois de ver a
        reação nos primeiros dias não exige mexer no código.
      </p>
      {templates.map((template) => (
        <Editor key={template.kind} template={template} />
      ))}
    </div>
  );
}
