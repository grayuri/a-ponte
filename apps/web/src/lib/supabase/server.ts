import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** O formato que o @supabase/ssr entrega em setAll. */
type CookieParaGravar = { name: string; value: string; options?: CookieOptions };

/**
 * Cliente Supabase do lado do servidor, com a sessão vinda dos cookies.
 * Toda página protegida passa por aqui para descobrir quem está logado.
 */
export function createSupabaseServerClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet: CookieParaGravar[]) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Server Component não pode escrever cookie. O middleware já
            // renova a sessão, então ignorar aqui é seguro.
          }
        },
      },
    },
  );
}

/** Token de acesso da sessão atual, para chamar a API NestJS. */
export async function getAccessToken(): Promise<string | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
