import { NextResponse, type NextRequest } from 'next/server';
import { getAccessToken } from '@/lib/supabase/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

/**
 * Ponte de download do CSV.
 *
 * Um `<a href>` apontando direto para a API não funciona: o navegador manda
 * os cookies do Next.js, mas a API espera `Authorization: Bearer`. O download
 * voltava como o JSON de "não autenticado" — e, pior, com cara de bug do
 * relatório em vez de problema de credencial.
 *
 * Aqui o servidor do Next busca o arquivo com o token da sessão e devolve o
 * conteúdo. O token nunca chega ao navegador.
 */
export async function GET(request: NextRequest) {
  const token = await getAccessToken();

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const de = request.nextUrl.searchParams.get('de');
  const ate = request.nextUrl.searchParams.get('ate');

  if (!de || !ate) {
    return NextResponse.json(
      { message: 'Informe o período (de e até) para exportar.' },
      { status: 400 },
    );
  }

  const alvo = new URL(`${API_URL}/reports/export.csv`);
  alvo.searchParams.set('from', de);
  alvo.searchParams.set('to', ate);

  const resposta = await fetch(alvo.toString(), {
    headers: { authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!resposta.ok) {
    const erro = (await resposta.json().catch(() => ({}))) as { message?: string };
    return NextResponse.json(
      { message: erro.message ?? 'Não foi possível gerar o arquivo.' },
      { status: resposta.status },
    );
  }

  // Bytes, não texto: `text()` decodifica como UTF-8 e DESCARTA o BOM que a
  // API escreve de propósito. Sem esse BOM o Excel em português abre o
  // arquivo com os acentos embaralhados — "Instituição" vira "InstituiÃ§Ã£o".
  const bytes = await resposta.arrayBuffer();

  return new NextResponse(bytes, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="colheitas-${de}-a-${ate}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
