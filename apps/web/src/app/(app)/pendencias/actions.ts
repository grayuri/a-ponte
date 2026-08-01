'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, api } from '@/lib/api';

export interface EstadoVarredura {
  mensagem?: string;
  erro?: string;
}

/**
 * Roda a varredura de pendência na hora, sem esperar o corte do dia.
 * É a mesma rotina do cron — útil quando a coordenação quer conferir e cobrar
 * antes do horário, ou quando o container ficou fora do ar no horário certo.
 */
export async function rodarVarredura(
  _estado: EstadoVarredura,
  formData: FormData,
): Promise<EstadoVarredura> {
  const data = String(formData.get('data') ?? '') || undefined;

  try {
    const resultado = await api<{
      date: string;
      markedPending: number;
      alertsQueued: number;
      skippedWithoutPhone: number;
    }>('/compliance/sweep', { method: 'POST', body: { date: data } });

    revalidatePath('/pendencias');

    const partes = [
      `${resultado.markedPending} pendência(s) marcada(s)`,
      `${resultado.alertsQueued} cobrança(s) na fila`,
    ];
    if (resultado.skippedWithoutPhone > 0) {
      partes.push(`${resultado.skippedWithoutPhone} sem telefone cadastrado`);
    }

    return { mensagem: `Varredura de ${resultado.date}: ${partes.join(', ')}.` };
  } catch (error) {
    return {
      erro:
        error instanceof ApiError
          ? error.message
          : 'Não foi possível rodar a varredura agora.',
    };
  }
}
