'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

export interface EstadoCompromisso {
  erro?: string;
  campos?: Record<string, string>;
}

function corpoDoFormulario(formData: FormData) {
  const opcional = (chave: string) => {
    const valor = String(formData.get(chave) ?? '').trim();
    return valor || null;
  };

  return {
    storeId: String(formData.get('storeId') ?? ''),
    institutionId: String(formData.get('institutionId') ?? ''),
    assigneeUserId: opcional('assigneeUserId'),
    harvestTypeId: opcional('harvestTypeId'),
    weekday: Number(formData.get('weekday') ?? 1),
    startTime: String(formData.get('startTime') ?? ''),
    timeLabel: opcional('timeLabel'),
    status: String(formData.get('status') ?? 'ATIVO'),
    statusNote: opcional('statusNote'),
    validFrom: opcional('validFrom'),
    validTo: opcional('validTo'),
  };
}

function extrairErro(error: unknown): EstadoCompromisso {
  if (error instanceof ApiError) {
    return {
      erro: error.message,
      campos: Object.fromEntries((error.fields ?? []).map((f) => [f.path, f.message])),
    };
  }
  return { erro: 'Não foi possível salvar. Tente novamente.' };
}

export async function salvarCompromisso(
  _estado: EstadoCompromisso,
  formData: FormData,
): Promise<EstadoCompromisso> {
  const id = String(formData.get('id') ?? '').trim();

  try {
    if (id) {
      await api(`/schedule/commitments/${id}`, { method: 'PATCH', body: corpoDoFormulario(formData) });
    } else {
      await api('/schedule/commitments', { method: 'POST', body: corpoDoFormulario(formData) });
    }
  } catch (error) {
    return extrairErro(error);
  }

  revalidatePath('/escala');
  revalidatePath('/pendencias');
  redirect('/escala');
}

/**
 * Encerra em vez de apagar: as ocorrências passadas continuam sendo o
 * histórico de cumprimento daquela loja.
 */
export async function encerrarCompromisso(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const nota = String(formData.get('note') ?? '').trim() || undefined;

  await api(`/schedule/commitments/${id}`, { method: 'DELETE', body: { note: nota } });

  revalidatePath('/escala');
  redirect('/escala');
}
