import type { NotificationLogView, Paginated } from '@a-ponte/contracts';
import { api } from '@/lib/api';
import { hojeIso } from '@/lib/format';
import { POR_PAGINA, Paginacao, lerPagina } from '@/components/paginacao';
import { EditorTemplates, type TemplateView } from './editor-templates';
import { PainelDisparo } from './painel-disparo';

export const metadata = { title: 'Notificações — Rede Colheita' };

const TIPO_ROTULO: Record<string, string> = {
  ESCALA_DO_DIA: 'Escala do dia',
  COBRANCA_PENDENCIA: 'Cobrança de pendência',
  RESUMO_SEMANAL: 'Resumo semanal',
  PEDIDO_COBERTURA: 'Pedido de cobertura',
};

const SITUACAO_ROTULO: Record<string, string> = {
  NA_FILA: 'Na fila',
  ENVIADA: 'Enviada',
  FALHOU: 'Falhou',
  CANCELADA: 'Cancelada',
};

interface InfoGateway {
  driver: string;
  supportsGroups: boolean;
  dryRun: boolean;
  connected: boolean | null;
  connectionDetail: string | null;
}

export default async function PaginaNotificacoes({
  searchParams,
}: {
  searchParams: { tipo?: string; situacao?: string; pagina?: string };
}) {
  const pagina = lerPagina(searchParams.pagina);

  const [gateway, templates, log] = await Promise.all([
    api<InfoGateway>('/notifications/gateway', { revalidate: false }),
    api<TemplateView[]>('/notifications/templates', { revalidate: false }),
    api<Paginated<NotificationLogView>>('/notifications', {
      query: {
        kind: searchParams.tipo,
        status: searchParams.situacao,
        page: pagina,
        pageSize: POR_PAGINA,
      },
      revalidate: false,
    }),
  ]);

  const naFila = log.items.filter((n) => n.status === 'NA_FILA').length;

  return (
    <>
      <div className="cabecalho-pagina">
        <h1>Notificações</h1>
        <p>
          A escala do dia e a cobrança de pendência que hoje são digitadas à mão nos grupos.
          Cada mensagem fica registrada com o texto exato e o resultado da entrega.
        </p>
      </div>

      {gateway.driver === 'console' ? (
        <div className="aviso" data-tipo="info">
          <strong>Canal em modo de simulação.</strong> As mensagens são montadas e gravadas
          normalmente, mas <strong>nada é enviado</strong> — dá para conferir e aprovar todos os
          textos antes de decidir o provedor de WhatsApp. Para ligar um provedor de verdade,
          configure <code>NOTIFICATIONS_DRIVER=webhook</code> e{' '}
          <code>NOTIFICATIONS_WEBHOOK_URL</code> na API.
        </div>
      ) : gateway.dryRun ? (
        <div className="aviso" data-tipo="atencao">
          <strong>Canal “{gateway.driver}” configurado, mas em modo seco.</strong> Nada sai para
          fora enquanto <code>NOTIFICATIONS_DRY_RUN=true</code>.
        </div>
      ) : (
        <div className="aviso" data-tipo="sucesso">
          <strong>Enviando de verdade pelo canal “{gateway.driver}”.</strong>
          {gateway.supportsGroups
            ? ' Este canal suporta envio para grupos.'
            : ' Este canal envia apenas mensagens individuais — não posta em grupos do WhatsApp.'}
        </div>
      )}

      {gateway.connected === false ? (
        <div className="aviso" data-tipo="erro" role="alert">
          <strong>A sessão do WhatsApp está fora do ar.</strong>{' '}
          {gateway.connectionDetail ?? 'Motivo não informado pelo provedor.'} As mensagens
          continuam sendo montadas e ficam na fila, mas <strong>nenhuma sai</strong> enquanto
          isso não for resolvido.
        </div>
      ) : null}

      {gateway.connected === true && gateway.connectionDetail ? (
        <div className="aviso" data-tipo="atencao">
          <strong>Sessão conectada, com ressalva.</strong> {gateway.connectionDetail}
        </div>
      ) : null}

      {gateway.driver === 'z-api' ? (
        <div className="aviso" data-tipo="info">
          <strong>O Z-API mantém uma sessão do WhatsApp Web</strong>, que depende do celular do
          número ficar online e pode cair sozinha. Confira este quadro antes de contar com o
          disparo da manhã. As mensagens saem espaçadas de propósito — rajada é o padrão que
          mais atrai bloqueio.
        </div>
      ) : null}

      <PainelDisparo hoje={hojeIso()} naFila={naFila} />

      <EditorTemplates templates={templates} />

      <form className="filtros" method="get" style={{ marginTop: '1.5rem' }}>
        <div className="campo">
          <label htmlFor="tipo">Tipo</label>
          <select id="tipo" name="tipo" defaultValue={searchParams.tipo ?? ''}>
            <option value="">Todos</option>
            {Object.entries(TIPO_ROTULO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="situacao">Situação</label>
          <select id="situacao" name="situacao" defaultValue={searchParams.situacao ?? ''}>
            <option value="">Todas</option>
            {Object.entries(SITUACAO_ROTULO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" data-variante="secundario">
          Filtrar
        </button>
      </form>

      <div className="card">
        <div className="card-titulo">Últimas mensagens ({log.total})</div>

        {log.items.length === 0 ? (
          <div className="vazio">
            <strong>Nenhuma mensagem ainda.</strong>
            Use “Disparar escala do dia” acima para gerar as primeiras e conferir os textos.
          </div>
        ) : (
          log.items.map((mensagem) => (
            <div
              key={mensagem.id}
              style={{
                borderTop: '1px solid var(--cinza-100)',
                padding: '0.85rem 0',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <strong>{mensagem.recipientName ?? 'Sem nome'}</strong>{' '}
                  <span style={{ color: 'var(--cinza-500)' }}>{mensagem.recipientAddress}</span>
                  <div className="dica" style={{ marginTop: 0 }}>
                    {TIPO_ROTULO[mensagem.kind] ?? mensagem.kind} ·{' '}
                    {new Date(mensagem.createdAt).toLocaleString('pt-BR')}
                    {mensagem.attempts > 0 ? ` · ${mensagem.attempts} tentativa(s)` : ''}
                  </div>
                </div>
                <span
                  className="etiqueta"
                  data-status={
                    mensagem.status === 'ENVIADA'
                      ? 'CUMPRIDA'
                      : mensagem.status === 'FALHOU'
                        ? 'PENDENTE'
                        : mensagem.status === 'CANCELADA'
                          ? 'CANCELADA'
                          : 'PLANEJADA'
                  }
                >
                  {SITUACAO_ROTULO[mensagem.status] ?? mensagem.status}
                </span>
              </div>

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
                {mensagem.body}
              </pre>

              {mensagem.error ? (
                <div className="aviso" data-tipo="erro" style={{ marginTop: '0.5rem' }}>
                  {mensagem.error}
                </div>
              ) : null}
            </div>
          ))
        )}

        <Paginacao
          pagina={log.page}
          totalPaginas={log.totalPages}
          total={log.total}
          primeiro={(log.page - 1) * log.pageSize + 1}
          ultimo={Math.min(log.page * log.pageSize, log.total)}
          parametro="pagina"
          parametrosAtuais={{ tipo: searchParams.tipo, situacao: searchParams.situacao }}
          rotulo="mensagens"
        />
      </div>
    </>
  );
}
