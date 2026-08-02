'use server';

import { revalidatePath } from 'next/cache';
import type { DispatchResultView } from '@a-ponte/contracts';
import { ApiError, api } from '@/lib/api';

export interface EstadoDisparo {
  mensagem?: string;
  erro?: string;
}

function erro(e: unknown): EstadoDisparo {
  return { erro: e instanceof ApiError ? e.message : 'Não foi possível concluir agora.' };
}

/** Enfileira a escala do dia — o mesmo que o cron faz de manhã. */
export async function dispararEscala(
  _estado: EstadoDisparo,
  formData: FormData,
): Promise<EstadoDisparo> {
  const data = String(formData.get('data') ?? '') || undefined;

  try {
    const r = await api<DispatchResultView>('/notifications/dispatch-schedule', {
      method: 'POST',
      body: { date: data },
    });

    revalidatePath('/admin/notificacoes');
    return {
      mensagem:
        `Escala de ${r.date}: ${r.queued} mensagem(ns) na fila para ${r.recipients} destinatário(s)` +
        (r.skipped > 0 ? `, ${r.skipped} colheita(s) sem telefone para avisar.` : '.'),
    };
  } catch (e) {
    return erro(e);
  }
}

/** Entrega o que está na fila agora. */
export async function drenarFila(): Promise<void> {
  await api('/notifications/flush', { method: 'POST' });
  revalidatePath('/admin/notificacoes');
}

export interface EstadoTemplate {
  erro?: string;
  sucesso?: string;
}

export async function salvarTemplate(
  _estado: EstadoTemplate,
  formData: FormData,
): Promise<EstadoTemplate> {
  const corpo = String(formData.get('body') ?? '').trim();
  const ativo = formData.get('active') === 'on';

  // Um texto ativo e vazio faria a mensagem sair em branco para 233 pessoas.
  if (ativo && corpo.length < 20) {
    return { erro: 'Escreva a mensagem antes de ativá-la (mínimo de 20 caracteres).' };
  }

  try {
    await api('/notifications/templates', {
      method: 'PUT',
      body: { kind: String(formData.get('kind') ?? ''), body: corpo, active: ativo },
    });
  } catch (e) {
    return erro(e);
  }

  revalidatePath('/admin/notificacoes');
  return {
    sucesso: ativo
      ? 'Texto salvo e em uso a partir do próximo disparo.'
      : 'Texto salvo. O sistema continua usando o padrão até você ativá-lo.',
  };
}
