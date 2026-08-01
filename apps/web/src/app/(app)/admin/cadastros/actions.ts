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

export async function criarInstituicao(
  _estado: EstadoCadastro,
  formData: FormData,
): Promise<EstadoCadastro> {
  const telefoneBruto = String(formData.get('phone') ?? '').trim();
  const digitos = telefoneBruto.replace(/\D/g, '');
  const telefone = digitos
    ? telefoneBruto.startsWith('+')
      ? `+${digitos}`
      : digitos.length === 10 || digitos.length === 11
        ? `+55${digitos}`
        : `+${digitos}`
    : null;

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
