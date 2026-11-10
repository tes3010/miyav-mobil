-- =============================================================
--  Akdeniz Bilgi S.K. Voleybol — Veritabanı kurulumu
--  Supabase > SQL Editor > New query > bu dosyanın tamamını yapıştır > Run
--  Tekrar çalıştırmak güvenlidir (var olanları bozmaz).
-- =============================================================

-- ---------- TAKIMLAR ----------
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null,
  category    text not null default 'mini',          -- 'midi' | 'mini'
  sort        int  not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- OYUNCULAR ----------
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  full_name   text not null,
  jersey_no   int,
  position    text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists players_team_idx on public.players(team_id);

-- ---------- YOKLAMA ----------
create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  date        date not null,
  status      text not null check (status in ('geldi','gelmedi','izinli','sakat','gec')),
  note        text,
  created_at  timestamptz not null default now(),
  unique (player_id, date)
);
create index if not exists attendance_team_date_idx on public.attendance(team_id, date);

-- ---------- MAÇLAR (skorbord + canlı istatistik) ----------
create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  team_id     uuid references public.teams(id) on delete set null,
  date        date not null default current_date,
  home_name   text not null,
  away_name   text not null,
  home_sets   int not null default 0,
  away_sets   int not null default 0,
  sets        jsonb not null default '[]',     -- [{home:25, away:21}, ...]
  events      jsonb not null default '[]',     -- sayı / istatistik kayıtları
  finished    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ---------- TEKNİK ÇALIŞMALAR (aşama 4) ----------
create table if not exists public.drills (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  team_id     uuid not null references public.teams(id) on delete cascade,
  date        date not null,
  skill       text not null,                  -- servis | manset | pas | plase | smac
  technique   text,
  target_side text,                           -- 'rakip' | 'kendi'
  from_zone   int,
  to_zones    int[] not null default '{}',
  direction   text,                           -- capraz | paralel | duz
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists drills_team_date_idx on public.drills(team_id, date);

create table if not exists public.drill_results (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  drill_id    uuid not null references public.drills(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  attempts    int not null default 0,
  errors      int not null default 0,
  hits        int,
  unique (drill_id, player_id)
);

-- ---------- FİZİKSEL ÖLÇÜMLER (aşama 5) ----------
create table if not exists public.measurements (
  id             uuid primary key default gen_random_uuid(),
  owner          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  player_id      uuid not null references public.players(id) on delete cascade,
  date           date not null,
  height_cm      numeric(5,1),
  weight_kg      numeric(5,1),
  sitting_cm     numeric(5,1),
  wingspan_cm    numeric(5,1),
  note           text,
  created_at     timestamptz not null default now()
);

-- ---------- ANTRENMAN ARŞİVİ (aşama 6) ----------
create table if not exists public.trainings (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  team_id     uuid references public.teams(id) on delete set null,
  date        date not null,
  title       text,
  focus       text,
  pdf_path    text,
  analysis    jsonb,
  created_at  timestamptz not null default now()
);

-- ---------- AYARLAR (teknik listeleri vb.) ----------
create table if not exists public.settings (
  owner       uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data        jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- =============================================================
--  GÜVENLİK: her hoca yalnızca kendi verisini görür (RLS)
-- =============================================================
do $$
declare t text;
begin
  foreach t in array array['teams','players','attendance','matches','drills',
                           'drill_results','measurements','trainings','settings']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists "sahibi" on public.%I', t);
    execute format('create policy "sahibi" on public.%I for all to authenticated
                    using (owner = auth.uid()) with check (owner = auth.uid())', t);
  end loop;
end $$;

-- =============================================================
--  PDF DEPOSU (antrenman arşivi için, gizli)
-- =============================================================
insert into storage.buckets (id, name, public)
values ('antrenmanlar', 'antrenmanlar', false)
on conflict (id) do nothing;

drop policy if exists "antrenman pdf sahibi" on storage.objects;
create policy "antrenman pdf sahibi" on storage.objects for all to authenticated
  using (bucket_id = 'antrenmanlar' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'antrenmanlar' and (storage.foldername(name))[1] = auth.uid()::text);
