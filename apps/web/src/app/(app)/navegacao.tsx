'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { UserRole } from '@a-ponte/contracts';

interface Item {
  href: string;
  rotulo: string;
  papeis: UserRole[];
}

const TODOS: UserRole[] = ['ADMIN', 'COORDENADOR', 'INSTITUICAO', 'COLHEDOR'];
const GESTAO: UserRole[] = ['ADMIN', 'COORDENADOR'];
const GESTAO_E_INSTITUICAO: UserRole[] = ['ADMIN', 'COORDENADOR', 'INSTITUICAO'];

/**
 * A ordem importa: o colhedor abre o app pelo link do WhatsApp e precisa cair
 * em "Minhas colheitas". Coordenação começa no painel.
 */
const ITENS: Item[] = [
  { href: '/minhas-colheitas', rotulo: 'Minhas colheitas', papeis: TODOS },
  { href: '/', rotulo: 'Painel', papeis: GESTAO_E_INSTITUICAO },
  { href: '/pendencias', rotulo: 'Pendências', papeis: GESTAO_E_INSTITUICAO },
  { href: '/colheitas', rotulo: 'Colheitas', papeis: GESTAO_E_INSTITUICAO },
  { href: '/escala', rotulo: 'Escala', papeis: GESTAO_E_INSTITUICAO },
  { href: '/relatorios', rotulo: 'Relatórios', papeis: GESTAO_E_INSTITUICAO },
  { href: '/admin/usuarios', rotulo: 'Pessoas', papeis: GESTAO_E_INSTITUICAO },
  { href: '/admin/cadastros', rotulo: 'Cadastros', papeis: GESTAO },
  { href: '/admin/notificacoes', rotulo: 'Notificações', papeis: GESTAO },
  { href: '/conta', rotulo: 'Minha conta', papeis: TODOS },
];

export function Navegacao({ papel }: { papel: UserRole }) {
  const caminho = usePathname();
  const visiveis = ITENS.filter((item) => item.papeis.includes(papel));

  return (
    <nav className="nav">
      {visiveis.map((item) => {
        const ativo =
          item.href === '/' ? caminho === '/' : caminho.startsWith(item.href);

        return (
          <Link key={item.href} href={item.href} data-ativo={ativo}>
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
