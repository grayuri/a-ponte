'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, api } from '@/lib/api';

export interface EstadoUsuario {
  erro?: string;
  sucesso?: string;
  campos?: Record<string, string>;
}

function extrairErro(error: unknown): EstadoUsuario {
  if (error instanceof ApiError) {
    return {
      erro: error.message,
      campos: Object.fromEntries((error.fields ?? []).map((f) => [f.path, f.message])),
    };
  }
  return { erro: 'Não foi possível concluir. Tente novamente.' };
}

/**
 * O telefone é o que faz a mensagem chegar. Sem ele, a pessoa entra no sistema
 * mas nunca recebe a escala nem a cobrança — por isso normalizamos aqui e o
 * backend valida o formato E.164.
 */
function normalizarTelefone(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, '');
  if (!digitos) return null;
  if (bruto.trim().startsWith('+')) return `+${digitos}`;
  // 10 ou 11 dígitos = número brasileiro sem DDI.
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`;
  return `+${digitos}`;
}

export async function criarUsuario(
  _estado: EstadoUsuario,
  formData: FormData,
): Promise<EstadoUsuario> {
  const telefone = normalizarTelefone(String(formData.get('phone') ?? ''));
  const instituicao = String(formData.get('institutionId') ?? '').trim();

  try {
    await api('/users', {
      method: 'POST',
      body: {
        fullName: String(formData.get('fullName') ?? '').trim(),
        username: String(formData.get('username') ?? '')
          .trim()
          .toLowerCase(),
        email: String(formData.get('email') ?? '')
          .trim()
          .toLowerCase(),
        password: String(formData.get('password') ?? ''),
        phone: telefone,
        role: String(formData.get('role') ?? 'COLHEDOR'),
        institutionId: instituicao || null,
      },
    });
  } catch (error) {
    return extrairErro(error);
  }

  revalidatePath('/admin/usuarios');
  return { sucesso: 'Pessoa cadastrada. Passe o usuário e a senha para ela.' };
}

export async function atualizarUsuario(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const telefoneBruto = String(formData.get('phone') ?? '');
  const instituicao = String(formData.get('institutionId') ?? '').trim();

  await api(`/users/${id}`, {
    method: 'PATCH',
    body: {
      fullName: String(formData.get('fullName') ?? '').trim(),
      phone: telefoneBruto ? normalizarTelefone(telefoneBruto) : null,
      role: String(formData.get('role') ?? 'COLHEDOR'),
      status: String(formData.get('status') ?? 'ATIVO'),
      institutionId: instituicao || null,
    },
  });

  revalidatePath('/admin/usuarios');
}

export async function redefinirSenha(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '');
  const senha = String(formData.get('password') ?? '');

  if (senha.length < 6) return;

  await api(`/users/${id}/password`, { method: 'POST', body: { password: senha } });
  revalidatePath('/admin/usuarios');
}
