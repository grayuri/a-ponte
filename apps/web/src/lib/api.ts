import { getAccessToken } from './supabase/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Páginas de painel podem cachear por alguns segundos; a escala do dia, não. */
  revalidate?: number | false;
}

/**
 * Ponte entre o Next.js e a API NestJS. Sempre com o token do Supabase — é
 * assim que o backend sabe quem está pedindo e o que essa pessoa pode ver.
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = await getAccessToken();

  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: options.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: options.revalidate === false ? 'no-store' : undefined,
    next: typeof options.revalidate === 'number' ? { revalidate: options.revalidate } : undefined,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      code?: string;
      message?: string;
      fields?: Array<{ path: string; message: string }>;
    };

    throw new ApiError(
      response.status,
      payload.code ?? 'ERRO',
      payload.message ?? 'Não foi possível concluir a operação.',
      payload.fields,
    );
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Versão que devolve null em 401/403 — para telas que degradam sem quebrar. */
export async function apiSafe<T>(path: string, options?: RequestOptions): Promise<T | null> {
  try {
    return await api<T>(path, options);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
}
