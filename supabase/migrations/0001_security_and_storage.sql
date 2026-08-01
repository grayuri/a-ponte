-- =============================================================================
-- Rede Colheita — configuração do Supabase que o Prisma não gerencia.
--
-- ORDEM DE EXECUÇÃO:
--   1) npm run db:migrate --workspace @a-ponte/api   (cria o schema public)
--   2) este arquivo, no SQL Editor do Supabase ou via `supabase db push`
--
-- Modelo de segurança: o Next.js NUNCA fala direto com o Postgres. Ele
-- autentica no Supabase Auth e conversa com a API NestJS, que é dona de toda
-- regra de negócio. Por isso as tabelas ficam com RLS ligado e sem policy
-- nenhuma: `anon` e `authenticated` não leem nada, e só o backend (service
-- role / dono do schema) passa. É defesa em profundidade, não a autorização
-- principal — essa vive nos guards do NestJS.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. RLS ligado e fechado em todas as tabelas do domínio
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'users', 'retail_chains', 'stores', 'institutions', 'harvest_types',
    'schedule_commitments', 'schedule_occurrences', 'harvests',
    'notification_templates', 'notifications', 'outbox_events', 'audit_log'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('alter table public.%I force row level security', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Ciclo de vida da conta: auth.users é a fonte da identidade
-- -----------------------------------------------------------------------------

-- Apagar a conta no Supabase apaga o espelho local.
create or replace function public.handle_auth_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.users where id = old.id;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
  after delete on auth.users
  for each row execute function public.handle_auth_user_deleted();

-- Trocar o e-mail no Supabase mantém o espelho coerente.
create or replace function public.handle_auth_user_email_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.users set email = new.email, updated_at = now() where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_auth_user_email_changed();

-- -----------------------------------------------------------------------------
-- 3. Storage das fotos de colheita (substitui os links soltos do Google Drive)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'colheitas',
  'colheitas',
  false,
  10485760, -- 10 MB: foto de celular passa folgado, vídeo não entope o bucket
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic']
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Upload direto do celular: o colhedor autenticado só escreve dentro da
-- própria pasta (<uid>/...). Leitura é sempre por URL assinada emitida
-- pelo backend, então não há policy de select para o cliente.
drop policy if exists "colhedor envia a propria foto" on storage.objects;
create policy "colhedor envia a propria foto"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'colheitas'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "colhedor le a propria foto" on storage.objects;
create policy "colhedor le a propria foto"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'colheitas'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- -----------------------------------------------------------------------------
-- 4. Índices que o Prisma não expressa
-- -----------------------------------------------------------------------------

-- Busca de responsável/instituição por texto no painel administrativo.
create extension if not exists pg_trgm;

create index if not exists users_full_name_trgm_idx
  on public.users using gin (full_name gin_trgm_ops);

create index if not exists institutions_name_trgm_idx
  on public.institutions using gin (name gin_trgm_ops);

create index if not exists stores_name_trgm_idx
  on public.stores using gin (name gin_trgm_ops);

-- O relatório mensal filtra sempre por faixa de data + agrupa por loja/tipo.
create index if not exists harvests_month_idx
  on public.harvests (date_trunc('month', harvested_on), store_id);
