import Link from 'next/link';

/** Quantos itens por página em todo o sistema. Um lugar só para mudar. */
export const POR_PAGINA = 10;

/**
 * Fatia uma lista já carregada. As listas de catálogo e de relatório são
 * pequenas (a maior tem 125 itens) e chegam inteiras da API — paginar no
 * cliente evita reescrever cada endpoint e mantém os totais das tabelas
 * corretos, porque o rodapé continua somando a lista toda, não só a página.
 */
export function paginar<T>(itens: T[], pagina: number, porPagina = POR_PAGINA) {
  const totalPaginas = Math.max(1, Math.ceil(itens.length / porPagina));
  const atual = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (atual - 1) * porPagina;

  return {
    itens: itens.slice(inicio, inicio + porPagina),
    pagina: atual,
    totalPaginas,
    total: itens.length,
    primeiro: itens.length === 0 ? 0 : inicio + 1,
    ultimo: Math.min(inicio + porPagina, itens.length),
  };
}

export function lerPagina(valor: string | undefined): number {
  const n = Number(valor ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

interface Props {
  pagina: number;
  totalPaginas: number;
  total: number;
  primeiro: number;
  ultimo: number;
  /** Nome do parâmetro na URL — permite duas tabelas paginadas na mesma tela. */
  parametro: string;
  /** Demais parâmetros da URL, preservados ao trocar de página. */
  parametrosAtuais?: Record<string, string | undefined>;
  rotulo?: string;
}

export function Paginacao({
  pagina,
  totalPaginas,
  total,
  primeiro,
  ultimo,
  parametro,
  parametrosAtuais = {},
  rotulo = 'itens',
}: Props) {
  if (total === 0) return null;

  const href = (destino: number) => {
    const params = new URLSearchParams();
    for (const [chave, valor] of Object.entries(parametrosAtuais)) {
      if (valor !== undefined && valor !== '' && chave !== parametro) {
        params.set(chave, valor);
      }
    }
    if (destino > 1) params.set(parametro, String(destino));
    const qs = params.toString();
    return qs ? `?${qs}` : '?';
  };

  // Janela de páginas em torno da atual: com 13 páginas de instituições,
  // listar todas viraria uma fileira ilegível no celular.
  const janela: number[] = [];
  const inicio = Math.max(1, Math.min(pagina - 2, totalPaginas - 4));
  const fim = Math.min(totalPaginas, Math.max(pagina + 2, 5));
  for (let i = inicio; i <= fim; i++) janela.push(i);

  return (
    <nav className="paginacao" aria-label={`Paginação de ${rotulo}`}>
      <span className="paginacao-info">
        {primeiro}–{ultimo} de {total} {rotulo}
      </span>

      {totalPaginas > 1 ? (
        <span className="paginacao-botoes">
          {pagina > 1 ? (
            <Link href={href(pagina - 1)} scroll={false} aria-label="Página anterior">
              ‹
            </Link>
          ) : (
            <span aria-hidden="true" data-inativo="true">
              ‹
            </span>
          )}

          {inicio > 1 ? (
            <>
              <Link href={href(1)} scroll={false}>
                1
              </Link>
              {inicio > 2 ? <span data-inativo="true">…</span> : null}
            </>
          ) : null}

          {janela.map((n) => (
            <Link
              key={n}
              href={href(n)}
              scroll={false}
              data-atual={n === pagina}
              aria-current={n === pagina ? 'page' : undefined}
            >
              {n}
            </Link>
          ))}

          {fim < totalPaginas ? (
            <>
              {fim < totalPaginas - 1 ? <span data-inativo="true">…</span> : null}
              <Link href={href(totalPaginas)} scroll={false}>
                {totalPaginas}
              </Link>
            </>
          ) : null}

          {pagina < totalPaginas ? (
            <Link href={href(pagina + 1)} scroll={false} aria-label="Próxima página">
              ›
            </Link>
          ) : (
            <span aria-hidden="true" data-inativo="true">
              ›
            </span>
          )}
        </span>
      ) : null}
    </nav>
  );
}
