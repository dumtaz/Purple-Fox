-- Purple Fox: one table that holds your plans, scripts and host settings.
-- Paste this into Supabase -> SQL Editor -> New query, then press Run.
create table if not exists public.pf_state (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pf_state enable row level security;

-- Each signed-in person can only see and change their own row.
drop policy if exists "pf_state read own" on public.pf_state;
drop policy if exists "pf_state insert own" on public.pf_state;
drop policy if exists "pf_state update own" on public.pf_state;
create policy "pf_state read own" on public.pf_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "pf_state insert own" on public.pf_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "pf_state update own" on public.pf_state for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

grant select, insert, update on public.pf_state to authenticated;
revoke all on public.pf_state from anon;
