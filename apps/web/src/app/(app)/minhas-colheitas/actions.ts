'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

export interface EstadoFormulario {
  erro?: string;
  campos?: Record<string, string>;
  sucesso?: string;
}

function extrairErro(error: unknown): EstadoFormulario {
  if (error instanceof ApiError) {
    return {
      erro: error.message,
      campos: Object.fromEntries((error.fields ?? []).map((f) => [f.path, f.message])),
    };
  }
  return { erro: 'Não foi possível concluir. Verifique sua conexão e tente novamente.' };
}

/**
 * Registra a colheita. Quando vem de um item da escala, o backend dá baixa na
 * ocorrência e cancela a cobrança pendente na mesma transação.
 */
export async function registrarColheita(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const ocorrencia = String(formData.get('occurrenceId') ?? '').trim();
  const foto = String(formData.get('photoPath') ?? '').trim();

  const corpo = {
    occurrenceId: ocorrencia || null,
    storeId: String(formData.get('storeId') ?? ''),
    institutionId: String(formData.get('institutionId') ?? ''),
    harvestTypeId: String(formData.get('harvestTypeId') ?? ''),
    harvestedOn: String(formData.get('harvestedOn') ?? ''),
    harvestedAt: String(formData.get('harvestedAt') ?? '') || null,
    weightKg: Number(String(formData.get('weightKg') ?? '0').replace(',', '.')),
    mainFoods: String(formData.get('mainFoods') ?? '') || null,
    photoPath: foto || null,
    notes: String(formData.get('notes') ?? '') || null,
  };

  try {
    await api('/harvests', { method: 'POST', body: corpo });
  } catch (error) {
    return extrairErro(error);
  }

  revalidatePath('/minhas-colheitas');
  redirect('/minhas-colheitas?registrada=1');
}

/** "Não vou poder ir hoje" — tira da cobrança e registra o motivo. */
export async function justificarAusencia(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = String(formData.get('occurrenceId') ?? '');
  const motivo = String(formData.get('reason') ?? '').trim();

  if (motivo.length < 3) return { erro: 'Explique brevemente o motivo.' };

  try {
    await api(`/occurrences/${id}/excuse`, { method: 'POST', body: { reason: motivo } });
  } catch (error) {
    return extrairErro(error);
  }

  revalidatePath('/minhas-colheitas');
  revalidatePath('/pendencias');
  return { sucesso: 'Avisamos a coordenação. Esta colheita saiu da cobrança.' };
}

/** Pede cobertura de outra instituição — o "quem vai?" que hoje é manual. */
export async function pedirCobertura(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const id = String(formData.get('occurrenceId') ?? '');
  const instituicao = String(formData.get('coveringInstitutionId') ?? '');
  const motivo = String(formData.get('reason') ?? '').trim();

  if (!instituicao) return { erro: 'Escolha a instituição que vai cobrir.' };

  try {
    await api(`/occurrences/${id}/reassign`, {
      method: 'POST',
      body: { coveringInstitutionId: instituicao, reason: motivo || null },
    });
  } catch (error) {
    return extrairErro(error);
  }

  revalidatePath('/minhas-colheitas');
  revalidatePath('/escala');
  return { sucesso: 'Cobertura registrada.' };
}
