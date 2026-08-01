'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente do navegador. Usado só para duas coisas: fazer login e enviar a foto
 * da colheita direto para o Storage. Nenhuma leitura de dado de negócio passa
 * por aqui — isso é responsabilidade da API NestJS.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
