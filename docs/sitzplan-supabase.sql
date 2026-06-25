-- Sitzplan veröffentlichen + öffentliche Suche (Supabase / Postgres)
--
-- Einmalig im Supabase SQL Editor ausführen.
-- Enthält:
-- - seating_plan: published assignment map { entryId: tableNumber }
-- - search_entries(): server-side Suche über vorname/nachname + guests (partial, case-insensitive)

-- 1) Published seating plan (single row)
create table if not exists public.seating_plan (
  id int primary key default 1,
  assignment jsonb not null,
  published_at timestamptz not null default now()
);

alter table public.seating_plan enable row level security;

drop policy if exists "public can read seating plan" on public.seating_plan;
create policy "public can read seating plan"
on public.seating_plan
for select
to anon
using (true);

-- Data API access (defensive; depends on project settings)
grant select on public.seating_plan to anon;
grant select on public.seating_plan to authenticated;

-- 2) Public search function (used by server route; can be public if desired)
create or replace function public.search_entries(search_term text)
returns table (
  id uuid,
  vorname text,
  nachname text,
  guests text[]
)
language sql
stable
as $$
  select
    e.id,
    e.vorname,
    e.nachname,
    e.guests
  from public.entries e
  where
    e.vorname ilike '%' || search_term || '%'
    or e.nachname ilike '%' || search_term || '%'
    or (e.vorname || ' ' || e.nachname) ilike '%' || search_term || '%'
    or exists (
      select 1
      from unnest(coalesce(e.guests, array[]::text[])) as g(guest_name)
      where g.guest_name ilike '%' || search_term || '%'
    )
  order by e.created_at desc
  limit 30;
$$;

-- Allow calling via PostgREST RPC (optional; server-side uses service role anyway)
grant execute on function public.search_entries(text) to anon;
grant execute on function public.search_entries(text) to authenticated;

