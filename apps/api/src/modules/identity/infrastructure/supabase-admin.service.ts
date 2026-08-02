import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AppEnv } from '../../../config/env.config';
import { BusinessRuleError } from '../../../shared/domain/domain-error';

/**
 * Wrapper do cliente admin do Supabase (service role). É a única porta por onde
 * o backend cria, altera e apaga contas — e também por onde assina as URLs das
 * fotos de colheita.
 */
@Injectable()
export class SupabaseAdminService {
  private readonly logger = new Logger(SupabaseAdminService.name);
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService<AppEnv, true>) {
    this.client = createClient(
      this.config.get('SUPABASE_URL', { infer: true }),
      this.config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    this.bucket = this.config.get('SUPABASE_STORAGE_BUCKET', { infer: true });
  }

  async createAuthUser(input: {
    email: string;
    password: string;
    fullName: string;
    username: string;
  }): Promise<string> {
    const { data, error } = await this.client.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true, // não há fluxo de e-mail: quem cadastra é a coordenação
      user_metadata: { full_name: input.fullName, username: input.username },
    });

    if (error || !data.user) {
      throw new BusinessRuleError(
        `Não foi possível criar a conta no Supabase: ${error?.message ?? 'resposta vazia'}`,
      );
    }

    return data.user.id;
  }

  /**
   * Confere uma senha sem abrir sessão de verdade.
   *
   * Usa um cliente separado, com a chave anônima, justamente para NÃO tocar na
   * sessão do cliente admin — autenticar no cliente compartilhado trocaria o
   * contexto de todo o backend pelo do usuário que está trocando a senha.
   */
  async verifyPassword(email: string, password: string): Promise<boolean> {
    const conferidor = createClient(
      this.config.get('SUPABASE_URL', { infer: true }),
      this.config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true }),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { error } = await conferidor.auth.signInWithPassword({ email, password });
    if (error) return false;

    await conferidor.auth.signOut();
    return true;
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    const { error } = await this.client.auth.admin.updateUserById(userId, { password });
    if (error) throw new BusinessRuleError(`Não foi possível trocar a senha: ${error.message}`);
  }

  async updateEmail(userId: string, email: string): Promise<void> {
    const { error } = await this.client.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
    });
    if (error) throw new BusinessRuleError(`Não foi possível trocar o e-mail: ${error.message}`);
  }

  async deleteAuthUser(userId: string): Promise<void> {
    const { error } = await this.client.auth.admin.deleteUser(userId);
    if (error) this.logger.warn(`Falha ao remover conta ${userId}: ${error.message}`);
  }

  /**
   * URL temporária da foto. O bucket é privado: nada de link do Drive que
   * qualquer um abre para sempre, como acontece hoje.
   */
  async signedPhotoUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error) {
      this.logger.warn(`Não foi possível assinar a URL de ${path}: ${error.message}`);
      return null;
    }
    return data?.signedUrl ?? null;
  }

  async removePhoto(path: string): Promise<void> {
    await this.client.storage.from(this.bucket).remove([path]);
  }
}
