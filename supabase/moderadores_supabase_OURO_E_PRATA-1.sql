-- OURO & PRATA — Estrutura de Moderadores
-- Execute este arquivo no Supabase SQL Editor ANTES de publicar o main.js modificado.
-- O cadastro usa apenas USUÁRIO + SENHA. A conta de autenticação recebe internamente
-- um e-mail técnico @moderadores.ouroprata.local; esse e-mail não é mostrado ao usuário.

create extension if not exists pgcrypto;

create table if not exists public.moderators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text not null unique,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz null,
  approved_by uuid null references auth.users(id)
);

alter table public.moderators enable row level security;

create or replace function public.is_ouro_prata_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt()->>'email','')) = 'copadasnacoesouroeprata@gmail.com'
     and exists (
       select 1 from public.profiles p
       where p.id = auth.uid() and p.role = 'admin'
     );
$$;

create or replace function public.is_approved_moderator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.moderators m
    where m.user_id = auth.uid()
      and m.approved = true
  );
$$;

grant execute on function public.is_ouro_prata_admin() to anon, authenticated;
grant execute on function public.is_approved_moderator() to anon, authenticated;

drop policy if exists "moderators_request_insert" on public.moderators;
create policy "moderators_request_insert"
on public.moderators
for insert
to anon, authenticated
with check (approved = false and approved_by is null and approved_at is null);

drop policy if exists "moderators_read_own_or_admin" on public.moderators;
create policy "moderators_read_own_or_admin"
on public.moderators
for select
to authenticated
using (user_id = auth.uid() or public.is_ouro_prata_admin());

drop policy if exists "moderators_admin_update" on public.moderators;
create policy "moderators_admin_update"
on public.moderators
for update
to authenticated
using (public.is_ouro_prata_admin())
with check (public.is_ouro_prata_admin());

drop policy if exists "moderators_admin_delete" on public.moderators;
create policy "moderators_admin_delete"
on public.moderators
for delete
to authenticated
using (public.is_ouro_prata_admin());

-- Permite ao moderador aprovado atualizar uma partida que ainda não esteja encerrada.
-- O frontend bloqueia todas as áreas fora de Ao vivo e bloqueia alterações após o
-- encerramento. Esta política acrescenta a autorização de banco para o fluxo ao vivo.
drop policy if exists "moderators_update_live_matches" on public.matches;
create policy "moderators_update_live_matches"
on public.matches
for update
to authenticated
using (public.is_approved_moderator() and status <> 'encerrado')
with check (public.is_approved_moderator());

-- Ocorrências: incluir, alterar e excluir somente enquanto a partida não estiver encerrada.
drop policy if exists "moderators_insert_live_events" on public.match_events;
create policy "moderators_insert_live_events"
on public.match_events
for insert
to authenticated
with check (
  public.is_approved_moderator()
  and exists (
    select 1 from public.matches m
    where m.id = match_events.match_id
      and m.status <> 'encerrado'
  )
);

drop policy if exists "moderators_update_live_events" on public.match_events;
create policy "moderators_update_live_events"
on public.match_events
for update
to authenticated
using (
  public.is_approved_moderator()
  and exists (
    select 1 from public.matches m
    where m.id = match_events.match_id
      and m.status <> 'encerrado'
  )
)
with check (public.is_approved_moderator());

drop policy if exists "moderators_delete_live_events" on public.match_events;
create policy "moderators_delete_live_events"
on public.match_events
for delete
to authenticated
using (
  public.is_approved_moderator()
  and exists (
    select 1 from public.matches m
    where m.id = match_events.match_id
      and m.status <> 'encerrado'
  )
);

-- Escalações: incluir/alterar enquanto a partida não estiver encerrada.
drop policy if exists "moderators_insert_live_lineups" on public.match_lineups;
create policy "moderators_insert_live_lineups"
on public.match_lineups
for insert
to authenticated
with check (
  public.is_approved_moderator()
  and exists (
    select 1 from public.matches m
    where m.id = match_lineups.match_id
      and m.status <> 'encerrado'
  )
);

drop policy if exists "moderators_update_live_lineups" on public.match_lineups;
create policy "moderators_update_live_lineups"
on public.match_lineups
for update
to authenticated
using (
  public.is_approved_moderator()
  and exists (
    select 1 from public.matches m
    where m.id = match_lineups.match_id
      and m.status <> 'encerrado'
  )
)
with check (public.is_approved_moderator());

drop policy if exists "moderators_delete_live_lineups" on public.match_lineups;
create policy "moderators_delete_live_lineups"
on public.match_lineups
for delete
to authenticated
using (
  public.is_approved_moderator()
  and exists (
    select 1 from public.matches m
    where m.id = match_lineups.match_id
      and m.status <> 'encerrado'
  )
);

-- Índices
create index if not exists moderators_user_id_idx on public.moderators(user_id);
create index if not exists moderators_approved_idx on public.moderators(approved);
