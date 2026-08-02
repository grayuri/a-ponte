'use server';

import { ApiError, api } from '@/lib/api';

export interface EstadoSenha {
  erro?: string;
  sucesso?: string;
}

export async function trocarSenha(
  _estado: EstadoSenha,
  formData: FormData,
): Promise<EstadoSenha> {
  const atual = String(formData.get('currentPassword') ?? '');
  const nova = String(formData.get('newPassword') ?? '');
  const confirmacao = String(formData.get('confirmacao') ?? '');

  if (nova.length < 6) {
    return { erro: 'A nova senha precisa ter ao menos 6 caracteres.' };
  }

  // Confere aqui antes de gastar uma ida ao servidor: errar a confirmação é
  // o engano mais comum, e a resposta imediata evita a viagem.
  if (nova !== confirmacao) {
    return { erro: 'A nova senha e a confirmação não são iguais.' };
  }

  try {
    await api('/auth/change-password', {
      method: 'POST',
      body: { currentPassword: atual, newPassword: nova },
    });
  } catch (error) {
    return {
      erro: error instanceof ApiError ? error.message : 'Não foi possível trocar a senha.',
    };
  }

  return { sucesso: 'Senha alterada. Use a nova na próxima vez que entrar.' };
}
