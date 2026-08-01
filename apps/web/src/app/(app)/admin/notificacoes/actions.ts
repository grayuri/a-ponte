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
