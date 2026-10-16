-- StudyHub invite-only starter schema for Supabase.
-- Run in Supabase SQL Editor on a NEW project. Review policies before production.
create extension if not exists pgcrypto;

create table if not exists public.studyhub_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  max_uses integer not null default 1 check (max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  subject text not null check (subject in ('Mathematics','English','Science')),
  title text not null,
  description text not null default '',
  content text not null default '',
  language text not null default 'both' check (language in ('my','en','both')),
  published boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.studyhub_invites enable row level security;
alter table public.profiles enable row level security;
alter table public.lessons enable row level security;

-- Users can read/update only their own profile.
drop policy if exists "profile read own" on public.profiles;
create policy "profile read own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profile update own" on public.profiles;
create policy "profile update own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Members may read published lessons only.
drop policy if exists "members read published lessons" on public.lessons;
create policy "members read published lessons" on public.lessons for select to authenticated using (published = true);

-- No direct client policies on invites: invite verification/consumption must use functions.
revoke all on public.studyhub_invites from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.lessons to authenticated;

-- Hash invite codes in the database. Share the raw code only with the intended invitee.
create or replace function public.check_studyhub_invite(invite_code_input text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.studyhub_invites i
    where i.code_hash = encode(extensions.digest(convert_to(trim(invite_code_input), 'UTF8'), 'sha256'), 'hex')
      and i.active = true
      and (i.expires_at is null or i.expires_at > now())
      and i.uses < i.max_uses
  );
$$;

-- Atomically consume exactly one use; simultaneous attempts cannot over-redeem.
create or replace function public.redeem_studyhub_invite(invite_code_input text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.studyhub_invites i
     set uses = uses + 1
   where i.code_hash = encode(extensions.digest(convert_to(trim(invite_code_input), 'UTF8'), 'sha256'), 'hex')
     and i.active = true
     and (i.expires_at is null or i.expires_at > now())
     and i.uses < i.max_uses;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

revoke all on function public.check_studyhub_invite(text) from public;
revoke all on function public.redeem_studyhub_invite(text) from public;
grant execute on function public.check_studyhub_invite(text) to anon, authenticated;
grant execute on function public.redeem_studyhub_invite(text) to anon, authenticated;

-- Create a profile after every new auth user. The browser's display_name metadata is length-limited.
create or replace function public.studyhub_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 60))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_studyhub_auth_user_created on auth.users;
create trigger on_studyhub_auth_user_created
after insert on auth.users
for each row execute procedure public.studyhub_new_user_profile();

-- SECURITY NOTE:
-- Invite codes are redeemed from the browser after auth.signUp, so a hostile client could
-- create an unverified auth account before redeeming. That account still has no member
-- data access without verified email and the RLS policies above. For a hardened production
-- launch, move signup+invite redemption into an Edge Function that validates the code,
-- creates the user with the Admin API server-side, and consumes the invite transactionally.
-- Never expose the Supabase service_role key in frontend code.
