import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import type { AppEnv } from '../../../config/env.config';

/**
 * Verificação do JWT emitido pelo Supabase Auth.
 *
 * Projetos novos assinam com chave assimétrica e publicam a JWKS; projetos
 * antigos ainda usam HS256 com o segredo do projeto. Suportamos os dois porque
 * a alternativa é o login parar de funcionar numa migração do Supabase que
 * ninguém aqui controla.
 */
@Injectable()
export class SupabaseTokenVerifier {
  private readonly logger = new Logger(SupabaseTokenVerifier.name);
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly hsSecret?: Uint8Array;
  private readonly issuer: string;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    const supabaseUrl = this.config.get('SUPABASE_URL', { infer: true });
    this.issuer = `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
    this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));

    const secret = this.config.get('SUPABASE_JWT_SECRET', { infer: true });
    if (secret) this.hsSecret = new TextEncoder().encode(secret);
  }

  async verify(token: string): Promise<JWTPayload> {
    // Assimétrico primeiro: é o padrão atual do Supabase.
    try {
      const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer });
      return payload;
    } catch (asymmetricError) {
      if (!this.hsSecret) {
        this.logger.debug(`Falha na verificação por JWKS: ${String(asymmetricError)}`);
        throw new UnauthorizedException({
          code: 'SESSAO_INVALIDA',
          message: 'Sessão inválida ou expirada. Faça login novamente.',
        });
      }
    }

    try {
      const { payload } = await jwtVerify(token, this.hsSecret, { issuer: this.issuer });
      return payload;
    } catch {
      // O issuer nem sempre bate em projetos antigos; tenta sem essa restrição.
      try {
        const { payload } = await jwtVerify(token, this.hsSecret);
        return payload;
      } catch (error) {
        this.logger.debug(`Falha na verificação HS256: ${String(error)}`);
        throw new UnauthorizedException({
          code: 'SESSAO_INVALIDA',
          message: 'Sessão inválida ou expirada. Faça login novamente.',
        });
      }
    }
  }
}
