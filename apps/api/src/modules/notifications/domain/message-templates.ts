import { formatBr } from '../../../shared/domain/date-only';

export interface ScheduleItem {
  storeName: string;
  chainName: string;
  expectedTime: string;
  timeLabel: string | null;
  institutionName: string;
  harvestTypeLabel: string | null;
  occurrenceId: string;
}

const horario = (item: ScheduleItem) => item.timeLabel ?? item.expectedTime;

/**
 * Os textos que hoje o Geraldo digita à mão nos grupos, todo dia.
 *
 * Ficam aqui, juntos e em português, porque são a parte do sistema que as
 * pessoas realmente leem. Templates no banco (tabela notification_templates)
 * sobrescrevem estes — estes são o padrão de fábrica.
 */
export const MessageTemplates = {
  /** "Hoje é seu dia": a escala pessoal do colhedor. */
  escalaDoDia(params: {
    nome: string;
    data: string;
    itens: ScheduleItem[];
    linkApp: string;
  }): string {
    const cabecalho =
      params.itens.length === 1
        ? `Olá, ${params.nome}! Hoje (${formatBr(params.data)}) você está na escala de colheita:`
        : `Olá, ${params.nome}! Hoje (${formatBr(params.data)}) você tem ${params.itens.length} colheitas na escala:`;

    const linhas = params.itens
      .map(
        (item, i) =>
          `${params.itens.length > 1 ? `${i + 1}. ` : '• '}*${item.storeName}* — ${horario(item)}\n` +
          `   Destino: ${item.institutionName}` +
          (item.harvestTypeLabel ? `\n   Tipo: ${item.harvestTypeLabel}` : ''),
      )
      .join('\n');

    return (
      `${cabecalho}\n\n${linhas}\n\n` +
      `Depois de colher, registre no app — peso, alimentos e foto:\n${params.linkApp}\n\n` +
      `_Projeto Colheita • Rede Colheita_`
    );
  },

  /** A cobrança do fim do dia, que hoje é conferência manual na planilha. */
  cobrancaPendencia(params: {
    nome: string;
    data: string;
    itens: ScheduleItem[];
    linkApp: string;
  }): string {
    const plural = params.itens.length > 1;

    const linhas = params.itens
      .map((item) => `• *${item.storeName}* — ${horario(item)} → ${item.institutionName}`)
      .join('\n');

    return (
      `Oi, ${params.nome}! Ainda não recebemos o registro d${plural ? 'as' : 'a'} colheita` +
      `${plural ? 's' : ''} de hoje (${formatBr(params.data)}):\n\n${linhas}\n\n` +
      `Se você colheu, registre agora — leva menos de um minuto:\n${params.linkApp}\n\n` +
      `Se não foi possível ir, avise pelo app para sairmos da cobrança.\n\n` +
      `_Projeto Colheita • Rede Colheita_`
    );
  },

  /**
   * Aviso de cobertura atribuída.
   *
   * Note que NÃO é uma pergunta. Quando esta mensagem sai, a coordenação já
   * decidiu e o remanejamento já está gravado — perguntar "vocês conseguem?"
   * daria a entender que ainda dá para recusar sem avisar ninguém, e a loja
   * ficaria sem colheita com todo mundo achando que estava resolvido.
   */
  coberturaAtribuida(params: {
    nome: string;
    data: string;
    storeName: string;
    horario: string;
    instituicaoOriginal: string;
    linkApp: string;
  }): string {
    return (
      `Olá, ${params.nome}! Vocês foram escalados para uma cobertura.\n\n` +
      `A *${params.instituicaoOriginal}* não vai conseguir colher, e esta colheita passou ` +
      `para vocês:\n\n` +
      `• *${params.storeName}* — ${formatBr(params.data)}, às ${params.horario}\n\n` +
      `Depois de colher, registre no app:\n${params.linkApp}\n\n` +
      `Se não for possível assumir, avise a coordenação o quanto antes para a loja não ` +
      `ficar sem ninguém.\n\n` +
      `_Projeto Colheita • Rede Colheita_`
    );
  },

  /** Resumo semanal para a coordenação. */
  resumoSemanal(params: {
    nome: string;
    inicio: string;
    fim: string;
    cumpridas: number;
    total: number;
    pendentes: number;
    kg: number;
    linkApp: string;
  }): string {
    const taxa = params.total > 0 ? Math.round((params.cumpridas / params.total) * 100) : 0;

    return (
      `Resumo da semana ${formatBr(params.inicio)} a ${formatBr(params.fim)}\n\n` +
      `• Colheitas cumpridas: ${params.cumpridas} de ${params.total} (${taxa}%)\n` +
      `• Pendentes: ${params.pendentes}\n` +
      `• Total colhido: ${params.kg.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} kg\n\n` +
      `Painel completo: ${params.linkApp}\n\n` +
      `_Projeto Colheita • Rede Colheita_`
    );
  },
};

/** Aplica {{placeholders}} a um template vindo do banco. */
export function renderTemplate(body: string, vars: Record<string, string | number>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : '',
  );
}
