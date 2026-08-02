'use client';

import { useState } from 'react';

/**
 * Foto da colheita.
 *
 * Usa `<img>` e não `next/image` de propósito: a URL é assinada e expira em
 * uma hora, então o otimizador do Next cacheria um endereço morto e passaria
 * a servir imagem quebrada. Além disso, `next/image` exigiria liberar o
 * domínio do Supabase em `remotePatterns` — configuração a mais para nenhum
 * ganho, já que estas são miniaturas.
 */
export function Foto({ url, legenda }: { url: string | null; legenda: string }) {
  const [ampliada, setAmpliada] = useState(false);
  const [falhou, setFalhou] = useState(false);

  if (!url || falhou) {
    return (
      <div className="galeria-foto galeria-foto--vazia">
        {falhou ? 'foto indisponível' : 'sem foto'}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="galeria-foto"
        onClick={() => setAmpliada(true)}
        aria-label={`Ampliar foto de ${legenda}`}
      >
        <img src={url} alt={legenda} loading="lazy" onError={() => setFalhou(true)} />
      </button>

      {ampliada ? (
        // Clicar em qualquer lugar fecha: numa tela pequena, caçar um "X"
        // com uma mão só é pior que fechar sem querer.
        <div
          className="lightbox"
          role="dialog"
          aria-label={legenda}
          onClick={() => setAmpliada(false)}
        >
          <img src={url} alt={legenda} />
          <p>{legenda}</p>
        </div>
      ) : null}
    </>
  );
}
