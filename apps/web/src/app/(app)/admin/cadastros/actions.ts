'use server';

import { revalidatePath } from 'next/cache';
import { ApiError, api } from '@/lib/api';

export interface EstadoCadastro {
  erro?: string;
  sucesso?: string;
}

function extrairErro(error: unknown): EstadoCadastro {
  return {
    erro:
      error instanceof ApiError ? error.message : 'Não foi possível salvar. Tente novamente.',
  };
}

export async function criarRede(
  _estado: EstadoCadastro,
  formData: FormData,
): Promise<EstadoCadastro> {
  try {
    await api('/catalog/chains', {
      method: 'POST',
      body: { name: String(formData.get('name') ?? '').trim() },
    });
  } catch (error) {
    return extrairErro(error);
  }

  revalidatePath('/admin/cadastros');
  return { sucesso: 'Rede cadastrada.' };
}

export async function criarLoja(
  _estado: EstadoCadastro,
  formData: FormData,
): Promise<EstadoCadastro> {
  try {
    await api('/catalog/stores', {
      method: 'POST',
      body: {
        chainId: String(formData.get('chainId') ?? ''),
        name: String(formData.get('name') ?? '').trim(),
        shiftLabel: String(formData.get('shiftLabel') ?? '').trim() || null,
        city: String(formData.get('city') ?? '').trim() || null,
        active: true,
      },
    });
  } catch (error) {
    return extrairErro(error);
  }

  revalidatePath('/admin/cadastros');
  return { sucesso: 'Loja cadastrada.' };
}

/**
 * O telefone é o que faz a mensagem chegar. Aceita o formato que a pessoa
 * digita ((85) 99999-9999) e converte para E.164, que é o que o backend valida
 * e o que qualquer provedor de WhatsApp exige.
 */
function normalizarTelefone(bruto: string): string | null {
  const texto = bruto.trim();
  const digitos = texto.replace(/\D/g, '');
  if (!digitos) return null;
  if (texto.startsWith('+')) return `+${digitos}`;
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`;
  return `+${digitos}`;
}

export async function criarInstituicao(
  _estado: EstadoCadastro,
  formData: FormData,
): Promise<EstadoCadastro> {
  const telefone = normalizarTelefone(String(formData.get('phone') ?? ''));

  try {
    await api('/catalog/institutions', {
      method: 'POST',
      body: {
        name: String(formData.get('name') ?? '').trim(),
        shortName: String(formData.get('shortName') ?? '').trim() || null,
        contactName: String(formData.get('contactName') ?? '').trim() || null,
        phone: telefone,
        city: String(formData.get('city') ?? '').trim() || null,
        active: true,
      },
    });
  } catch (error) {
    return extrairErro(error);
  }

  revalidatePath('/admin/cadastros');
  return { sucesso: 'Instituição cadastrada.' };
}

// ---------------------------------------------------------------- edição

export async function atualizarLoja(
  _estado: EstadoCadastro,
  formData: FormData,
): Promise<EstadoCadastro> {
  const id = String(formData.get('id') ?? '');

  try {
    await api(`/catalog/stores/${id}`, {
      method: 'PATCH',
      body: {
        chainId: String(formData.get('chainId') ?? ''),
        name: String(formData.get('name') ?? '').trim(),
        shiftLabel: String(formData.get('shiftLabel') ?? '').trim() || null,
        city: String(formData.get('city') ?? '').trim() || null,
        address: String(formData.get('address') ?? '').trim() || null,
        active: formData.get('active') === 'on',
      },
    });
  } catch (error) {
    return extrairErro(error);
  }

  revalidatePath('/admin/cadastros');
  revalidatePath('/escala');
  return { sucesso: 'Loja atualizada.' };
}

export async function atualizarInstituicao(
  _estado: EstadoCadastro,
  formData: FormData,
): Promise<EstadoCadastro> {
  const id = String(formData.get('id') ?? '');

  try {
    await api(`/catalog/institutions/${id}`, {
      method: 'PATCH',
      body: {
        name: String(formData.get('name') ?? '').trim(),
        shortName: String(formData.get('shortName') ?? '').trim() || null,
        contactName: String(formData.get('contactName') ?? '').trim() || null,
        phone: normalizarTelefone(String(formData.get('phone') ?? '')),
        city: String(formData.get('city') ?? '').trim() || null,
        address: String(formData.get('address') ?? '').trim() || null,
        active: formData.get('active') === 'on',
      },
    });
  } catch (error) {
    return extrairErro(error);
  }

  revalidatePath('/admin/cadastros');
  revalidatePath('/escala');
  return { sucesso: 'Instituição atualizada.' };
}

/**
 * Desativa em vez de apagar: loja e instituição são referenciadas por
 * colheitas históricas, e apagá-las levaria junto o relatório do ano.
 * O backend recusa se ainda houver compromisso ativo na escala.
 */
export async function desativarLoja(
  _estado: EstadoCadastro,
  formData: FormData,
): Promise<EstadoCadastro> {
  try {
    await api(`/catalog/stores/${String(formData.get('id') ?? '')}`, { method: 'DELETE' });
  } catch (error) {
    return extrairErro(error);
  }

  revalidatePath('/admin/cadastros');
  return { sucesso: 'Loja desativada. O histórico dela foi preservado.' };
}

export async function desativarInstituicao(
  _estado: EstadoCadastro,
  formData: FormData,
): Promise<EstadoCadastro> {
  try {
    await api(`/catalog/institutions/${String(formData.get('id') ?? '')}`, { method: 'DELETE' });
  } catch (error) {
    return extrairErro(error);
  }

  revalidatePath('/admin/cadastros');
  return { sucesso: 'Instituição desativada. O histórico dela foi preservado.' };
}
