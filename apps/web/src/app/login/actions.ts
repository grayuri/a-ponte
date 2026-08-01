'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export interface EstadoLogin {
  erro?: string;
}

/**
 * Login por NOME DE USUÁRIO ou E-MAIL.
 *
 * O Supabase Auth só entende e-mail. Quando o que a pessoa digita não parece
 * um e-mail, perguntamos à API qual e-mail corresponde àquele usuário e só
 * então autenticamos. A API responde sempre 200 (com email: null quando não
 * acha), para que esta rota não vire um verificador de contas existentes.
 */
export async function entrar(_estado: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const identificador = String(formData.get('identifier') ?? '').trim();
  const senha = String(formData.get('password') ?? '');
  const proximo = String(formData.get('proximo') ?? '/') || '/';

  if (identificador.length < 3 || senha.length < 6) {
    return { erro: 'Informe seu usuário ou e-mail e a senha.' };
  }

  let email = identificador.toLowerCase();

  if (!email.includes('@')) {
    try {
      const resposta = await fetch(`${API_URL}/auth/resolve-identifier`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier: identificador }),
        cache: 'no-store',
      });

      const dados = (await resposta.json().catch(() => ({}))) as { email?: string | null };
      if (!dados.email) return { erro: 'Usuário ou senha inválidos.' };
      email = dados.email;
    } catch {
      return { erro: 'Não foi possível falar com o servidor. Tente novamente.' };
    }
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) {
    // Mensagem genérica de propósito: dizer "senha errada" confirma que a
    // conta existe.
    return { erro: 'Usuário ou senha inválidos.' };
  }

  redirect(proximo.startsWith('/') ? proximo : '/');
}

export async function sair(): Promise<void> {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
