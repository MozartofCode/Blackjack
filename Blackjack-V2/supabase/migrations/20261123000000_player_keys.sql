-- Players are identified by sha256(device secret key), not Supabase Auth.
-- No signup and no auth provider to enable. Nicknames are written only by
-- the `daily` Edge Function (service role); everything else stays as before.

drop view if exists public.leaderboard_alltime, public.leaderboard_monthly, public.leaderboard_daily, public.daily_entries;

drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id type text using id::text;
alter table public.profiles add constraint profiles_id_hex check (id ~ '^[0-9a-f]{64}$');

alter table public.daily_runs drop constraint if exists daily_runs_user_id_fkey;
alter table public.daily_runs alter column user_id type text using user_id::text;

alter table public.daily_scores drop constraint if exists daily_scores_user_id_fkey;
alter table public.daily_scores alter column user_id type text using user_id::text;

create view public.daily_entries with (security_invoker = true) as
  select s.day, s.user_id, null::text as bot_id,
         coalesce(p.nickname::text, 'Player ' || left(s.user_id, 4)) as name,
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

-- Public, read-only bucket for the exported bot models (loaded by the Edge Function).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('models', 'models', true, 5242880, array['application/json'])
on conflict (id) do nothing;
