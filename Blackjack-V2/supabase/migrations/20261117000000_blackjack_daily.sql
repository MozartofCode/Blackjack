-- Blackjack Daily schema.
-- Writes to runs/tables happen only in the `daily` Edge Function (service role).
-- Clients read leaderboards through views and manage their own nickname.

create extension if not exists citext with schema extensions;

-- ─── Players ────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname extensions.citext unique
    check (char_length(nickname) between 2 and 16 and nickname ~ '^[A-Za-z0-9_\- ]+$'),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "profiles are public" on public.profiles for select using (true);
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- ─── Bots ───────────────────────────────────────────────────────────────────
create table public.bots (
  id text primary key,
  name text not null,
  handle text not null
);
alter table public.bots enable row level security;
create policy "bots are public" on public.bots for select using (true);

insert into public.bots (id, name, handle) values
  ('bot1', 'Bot 1 · The Counter', 'Counter'),
  ('bot2', 'Bot 2 · Echo', 'Echo'),
  ('bot3', 'Bot 3 · Mirror', 'Mirror'),
  ('bot4', 'Bot 4 · Forest', 'Forest'),
  ('bot5', 'Bot 5 · Sapling', 'Sapling'),
  ('bot6', 'Bot 6 · Q', 'Q');

-- ─── Daily tables (secret shoe seed: never readable by clients) ─────────────
create table public.daily_tables (
  day date primary key,
  seed_secret text not null,
  lineup text[] not null,
  created_at timestamptz not null default now()
);
alter table public.daily_tables enable row level security; -- no policies: service role only

-- Official bot scores: the same shoe played with the human seat empty.
create table public.bot_daily_results (
  day date not null references public.daily_tables (day) on delete cascade,
  bot_id text not null references public.bots (id),
  final_bankroll numeric not null,
  primary key (day, bot_id)
);
alter table public.bot_daily_results enable row level security;
create policy "bot results are public" on public.bot_daily_results for select using (true);

-- ─── Runs (full engine state incl. shoe: service role only) ─────────────────
create table public.daily_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null references public.daily_tables (day),
  state jsonb not null,
  version integer not null default 0,
  status text not null default 'playing' check (status in ('playing', 'finished')),
  final_bankroll numeric,
  profit numeric,
  hand_results text,
  bots_beaten integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, day)
);
alter table public.daily_runs enable row level security; -- no policies: service role only

create index daily_runs_leaderboard on public.daily_runs (day, final_bankroll desc, finished_at)
  where status = 'finished';
create index daily_runs_user on public.daily_runs (user_id, day);

-- ─── Public scores ──────────────────────────────────────────────────────────
-- Safe, public copy of finished runs (never the engine state). Filled by a
-- trigger so the Edge Function only has to finish the run.
create table public.daily_scores (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  final_bankroll numeric not null,
  profit numeric not null,
  hand_results text,
  bots_beaten integer,
  finished_at timestamptz not null,
  primary key (user_id, day)
);
alter table public.daily_scores enable row level security;
create policy "scores are public" on public.daily_scores for select using (true);
create index daily_scores_day on public.daily_scores (day, final_bankroll desc, finished_at);

create function public.copy_finished_run() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'finished' and (old.status is distinct from 'finished') then
    insert into public.daily_scores (user_id, day, final_bankroll, profit, hand_results, bots_beaten, finished_at)
    values (new.user_id, new.day, new.final_bankroll, new.profit, new.hand_results, new.bots_beaten, new.finished_at)
    on conflict (user_id, day) do nothing;
  end if;
  return new;
end;
$$;
revoke execute on function public.copy_finished_run() from public, anon, authenticated;

create trigger daily_runs_finished after update of status on public.daily_runs
  for each row execute function public.copy_finished_run();

-- ─── Leaderboards ───────────────────────────────────────────────────────────
-- security_invoker: views respect the caller's RLS (all sources are public).

create view public.daily_entries with (security_invoker = true) as
  select s.day, s.user_id, null::text as bot_id,
         coalesce(p.nickname::text, 'Player ' || left(s.user_id::text, 4)) as name,
         s.final_bankroll, s.profit, s.hand_results, s.bots_beaten, s.finished_at, false as is_bot
  from public.daily_scores s
  left join public.profiles p on p.id = s.user_id
  union all
  select b.day, null, b.bot_id, bots.name, b.final_bankroll, b.final_bankroll - 1000, null, null, null, true
  from public.bot_daily_results b
  join public.bots on bots.id = b.bot_id;

create view public.leaderboard_daily with (security_invoker = true) as
  select e.*,
         rank() over (partition by e.day order by e.final_bankroll desc, e.finished_at asc nulls last) as rank
  from public.daily_entries e;

create view public.leaderboard_monthly with (security_invoker = true) as
  select date_trunc('month', e.day)::date as month,
         e.user_id, e.bot_id, max(e.name) as name, bool_or(e.is_bot) as is_bot,
         sum(e.profit) as total_profit, count(*) as days_played, max(e.final_bankroll) as best_day,
         rank() over (partition by date_trunc('month', e.day) order by sum(e.profit) desc) as rank
  from public.daily_entries e
  group by date_trunc('month', e.day), e.user_id, e.bot_id;

create view public.leaderboard_alltime with (security_invoker = true) as
  select e.user_id, e.bot_id, max(e.name) as name, bool_or(e.is_bot) as is_bot,
         sum(e.profit) as total_profit, count(*) as days_played,
         round(avg(e.profit / 10.0), 1) as avg_roi_pct, max(e.final_bankroll) as best_day,
         rank() over (order by sum(e.profit) desc) as rank
  from public.daily_entries e
  group by e.user_id, e.bot_id;

grant select on public.daily_entries, public.leaderboard_daily, public.leaderboard_monthly,
  public.leaderboard_alltime to anon, authenticated;
