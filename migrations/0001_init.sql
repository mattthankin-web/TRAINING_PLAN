-- Phase 1 schema: the data foundation everything else (readiness, chat tools,
-- dashboard, plans) reads from.
--
-- Everything lives in a dedicated `coach` schema so this app can share a Supabase
-- project with others without colliding in `public`.

create schema if not exists coach;

-- One row per activity, as reported by Intervals.icu (which ingests the Edge 830
-- via Garmin Connect and indoor rides via Zwift). `raw` keeps the full payload so
-- later phases can use fields we don't model yet without a re-sync.
create table if not exists coach.activities (
  id text primary key,                 -- Intervals.icu activity id, e.g. "i12345678"
  start_date_local timestamp not null,
  type text not null,                  -- Ride, VirtualRide, GravelRide, ...
  name text,
  indoor boolean not null default false,
  moving_time_s int,
  elapsed_time_s int,
  distance_m numeric,
  elevation_gain_m numeric,
  training_load int,                   -- TSS-equivalent
  intensity numeric,                   -- Intensity factor, as a percentage (e.g. 82.4)
  normalized_power int,
  avg_power int,
  avg_hr int,
  max_hr int,
  avg_cadence numeric,
  ftp int,                             -- FTP in effect for this ride
  weight_kg numeric,
  decoupling numeric,                  -- aerobic decoupling %, Pw:HR
  efficiency_factor numeric,
  variability_index numeric,
  calories int,
  rpe int,
  feel int,
  route_id int,
  paired_event_id int,                 -- the planned workout this ride completed, if any
  source text,
  raw jsonb not null,
  synced_at timestamptz not null default now()
);
create index if not exists activities_start_idx on coach.activities (start_date_local desc);

-- Best average power per standard duration per ride, taken from each activity's
-- power curve. Lets all-time / season / last-90-days curves and PB detection be a
-- plain query instead of re-fetching streams.
create table if not exists coach.activity_power_bests (
  activity_id text not null references coach.activities(id) on delete cascade,
  duration_s int not null,
  watts int not null,
  watts_per_kg numeric,
  synced_at timestamptz not null default now(),
  primary key (activity_id, duration_s)
);
create index if not exists power_bests_duration_idx on coach.activity_power_bests (duration_s, watts desc);

-- Fitness model per day from Intervals.icu (CTL = fitness, ATL = fatigue).
-- Form (TSB) is derived rather than stored, so it can never drift from its inputs.
create table if not exists coach.load_daily (
  date date primary key,
  ctl numeric,
  atl numeric,
  tsb numeric generated always as (ctl - atl) stored,
  ramp_rate numeric,
  daily_load numeric,
  synced_at timestamptz not null default now()
);

-- Health data per day per source. Sources are kept apart on purpose: Oura and
-- Garmin measure HRV over different windows, so baselines must never mix them.
--   source = 'intervals' — wellness as Intervals.icu holds it (Garmin/Oura-fed)
--   source = 'oura'      — pulled directly from the Oura API, with full detail
create table if not exists coach.wellness_daily (
  date date not null,
  source text not null check (source in ('intervals', 'oura')),
  hrv_rmssd numeric,
  resting_hr numeric,
  lowest_hr numeric,
  avg_sleeping_hr numeric,
  sleep_s int,
  deep_sleep_s int,
  rem_sleep_s int,
  light_sleep_s int,
  awake_s int,
  sleep_efficiency numeric,
  sleep_latency_s int,
  bedtime_start timestamptz,
  bedtime_end timestamptz,
  sleep_score numeric,
  readiness_score numeric,
  temperature_deviation numeric,       -- °C vs personal baseline (Oura)
  respiratory_rate numeric,
  spo2 numeric,
  weight_kg numeric,
  vo2max numeric,
  steps int,
  -- Subjective scores logged in Intervals.icu (1–4 scale there)
  soreness int,
  fatigue int,
  stress int,
  mood int,
  motivation int,
  readiness_contributors jsonb,
  sleep_contributors jsonb,
  raw jsonb not null,
  synced_at timestamptz not null default now(),
  primary key (date, source)
);

-- OAuth tokens for providers that need them (Oura). Encrypted at rest by the app;
-- Oura refresh tokens are single-use, so the latest one must always be persisted.
create table if not exists coach.oauth_tokens (
  provider text primary key,
  access_token_enc text not null,
  refresh_token_enc text not null,
  expires_at timestamptz not null,
  scope text,
  updated_at timestamptz not null default now()
);

-- Audit trail of sync runs, for the dashboard's "last synced" and for debugging.
create table if not exists coach.sync_runs (
  id bigserial primary key,
  job text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  detail jsonb
);

-- Target events the plan builds towards.
create table if not exists coach.goal_events (
  id serial primary key,
  name text not null,
  event_date date,                     -- null until confirmed
  location text,
  distance_km numeric,
  elevation_m numeric,
  goal text,
  priority text not null default 'A',  -- A = main goal, B/C = supporting events
  notes text,
  created_at timestamptz not null default now()
);

-- Single-row athlete context used by the coach (availability, home base, etc.).
create table if not exists coach.athlete_profile (
  id int primary key default 1 check (id = 1),
  name text,
  home_base text,
  timezone text not null default 'Australia/Melbourne',
  -- Day -> what's possible, e.g. {"mon": "indoor", "sat": "outdoor_long"}
  availability jsonb not null default '{}',
  equipment jsonb not null default '{}',
  notes text,
  updated_at timestamptz not null default now()
);

-- Nothing reaches these tables through Supabase's anon/authenticated API roles:
-- the backend connects directly as the table owner, which bypasses RLS. Enabling
-- RLS with no policies closes off accidental exposure via PostgREST.
alter table coach.schema_migrations enable row level security;
alter table coach.activities enable row level security;
alter table coach.activity_power_bests enable row level security;
alter table coach.load_daily enable row level security;
alter table coach.wellness_daily enable row level security;
alter table coach.oauth_tokens enable row level security;
alter table coach.sync_runs enable row level security;
alter table coach.goal_events enable row level security;
alter table coach.athlete_profile enable row level security;
