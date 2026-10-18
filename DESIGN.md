# Training Plan — Personal AI Cycling Coach

A personal, single-athlete coaching system that replicates RestOrTrain
(chat-first coach, daily rest/train verdict, plan building and adjustment,
workout delivery to Zwift/Garmin, ride analysis) and adds Oura recovery data,
Melbourne route knowledge, and a full training + health dashboard.

Status: **phase 1 (data foundation) built; phases 2+ to come.**

## Decisions so far

| Topic | Decision |
|---|---|
| Chat surface | Claude (claude.ai / mobile app) via a custom MCP connector |
| Data hub | Intervals.icu (already connected to Garmin, Oura and Zwift) |
| Devices | Garmin Edge 830 (bike computer only), Oura ring, power meter, Wahoo KICKR Core |
| Planning | Full plan to a target event, plus ad-hoc adjustments from chat |
| Hosting | This repo; separate Fly.io app and Supabase project from HOME_ASSIST |
| Tone | Coach should actively keep the athlete motivated |
| Target event | Great Ocean & Otway Classic Ride, 145 km / 1,426 m, goal sub-6 h (date TBC, expected April 2027) |
| Availability | Mon/Tue/Wed indoor; one of Sat/Sun long outdoor ride |
| Home base | Collingwood, VIC (route start point) |
| Routes | Strava |
| Notifications | ntfy |

## Goals

1. Ask anything about training, recovery and health in a Claude chat.
2. Create **bespoke Zwift sessions on demand** — especially mid-week, when
   time, fatigue or life changes — and have them appear in Zwift (ERG on the
   KICKR Core) and on the Edge 830 without manual file handling.
3. A daily rest-or-train verdict that combines Garmin ride load with Oura
   recovery (HRV, resting HR, sleep, temperature).
4. A full periodised plan to a target event, adjusted as reality happens.
5. Outdoor route suggestions around Melbourne that fit the session.
6. A comprehensive dashboard of training and health stats, including history.
7. Motivation: wins, streaks, PBs, progress towards the event.

## Architecture

```
 Edge 830 ──► Garmin Connect ──► Intervals.icu ◄── Oura (basic wellness)
                    ▲                 │  ▲
       planned      │                 │  │ planned workouts (API)
       workouts     │                 ▼  │
                    └──────── Intervals.icu ──► Zwift (Workouts → Custom → Intervals.icu)
                                      │
 Oura API (OAuth, full detail) ──┐    │ activities, streams, load, wellness
                                 ▼    ▼
                   ┌──────────────────────────────────┐
                   │ coach backend (Node/TS, Fly.io)   │
                   │  sync jobs ─► Postgres (Supabase) │
                   │  readiness engine                 │
                   │  workout + plan builder           │
                   │  routes service (+ weather)       │
                   │  MCP server  (/mcp, OAuth)  ◄─────┼── Claude chat (claude.ai / app)
                   │  dashboard API + web UI   ◄───────┼── browser / phone
                   │  scheduler: brief, post-ride,     │
                   │  weekly review ─► push notification│
                   └──────────────────────────────────┘
```

Same stack as HOME_ASSIST (Fastify, pg, node-cron, zod, migrations, Fly
deploy via GitHub Actions) so there is one way of doing things.

**Chat runs in Claude itself.** The MCP server exposes tools; the reasoning
happens in the claude.ai conversation, so there is no per-message API cost.
A Claude Project ("Coach") holds the coaching instructions and athlete
profile so every chat starts with context. The Anthropic API is used only for
unattended jobs (morning brief, post-ride note, weekly review).

## Data sources

| Source | Access | Used for |
|---|---|---|
| Intervals.icu | Personal API key | Activities + streams, power curve, fitness/fatigue/form, Garmin wellness, planned workouts (read/write) |
| Oura API v2 | Single-user OAuth app (PATs retired Dec 2025) | HRV, resting HR, sleep stages/timing, readiness contributors, temperature deviation |
| Open-Meteo | Free, no key | Melbourne forecast: wind direction/speed, rain, heat — for indoor vs outdoor and route choice |
| Strava (optional) | Personal API app | Segments and saved routes, if you use Strava |

Oura is the primary HRV source for trends (overnight, consistent); Garmin
values are kept as a cross-check, never mixed into one baseline.

## Data model (Postgres)

- `activities` — per ride: TSS, IF, NP, avg/max power and HR, duration,
  distance, elevation, indoor/outdoor, route polyline, raw JSON
- `activity_streams` — power/HR/cadence/speed/altitude series (compressed)
- `power_bests` — best power for standard durations (5s…60min) per ride,
  so all-time / season / 90-day curves are a query
- `wellness_daily` — one row per day per source (oura, garmin)
- `load_daily` — CTL, ATL, TSB, ramp rate
- `readiness_daily` — verdict, score, contributing factors, explanation
- `athlete_profile`, `ftp_history`, `weight_history`, `zones`
- `events` — target and secondary events (date, distance, elevation, goal)
- `plans`, `plan_weeks`, `workouts` — structured steps, Intervals.icu event
  id, sync status, planned vs completed link
- `routes` — curated + learned Melbourne routes (see below)
- `checkins` — RPE, soreness, stress, motivation, notes
- `achievements` — PBs, streaks, milestones (feeds motivation)

## Readiness engine

Explicit, tunable rules; Claude explains them rather than inventing a score.

Signals:
- HRV: 7-day rolling mean of ln(rMSSD) vs 60-day normal band
- Resting HR vs baseline
- Sleep duration and 7-day sleep debt
- Oura temperature deviation (early illness flag)
- Form (TSB), ramp rate, yesterday's TSS
- Subjective check-in (RPE, soreness, stress)

Output: **Train as planned / Train, modified / Easy only / Rest**, plus the
reasons and a concrete suggested swap when not "as planned".

## Bespoke Zwift sessions (core feature)

Flow, entirely from chat:

1. "I've got 50 minutes on the trainer Wednesday, legs are heavy from
   Sunday — what should I do?"
2. Claude calls `get_readiness`, `get_load_trend`, `get_plan(week)` and
   proposes one or two sessions that keep the week's intent (e.g. swap
   4×8 threshold for 3×10 sweet spot).
3. You tweak in plain language ("make the last rep a ramp", "add 30s
   sprints at the end", "cadence 100+ on the recoveries").
4. On confirmation, `create_workout` builds a structured workout:
   steps in % FTP (ERG-friendly for the KICKR Core), ramps, repeats,
   cadence targets, free-ride blocks and on-screen text cues.
5. `push_workout` posts it to the Intervals.icu calendar →
   appears in Zwift (Workouts → Custom → Intervals.icu, next 7 days) and in
   Garmin Connect → Edge 830 for outdoor sessions.
6. A `.zwo` file is also generated and downloadable from the dashboard as a
   fallback if the Zwift sync lags.

Rules: power targets always as % FTP (HR-zone workouts don't sync to Zwift);
Zwift FTP must be kept equal to Intervals.icu FTP — the coach checks and
reminds after any FTP change. Write actions always show the change and wait
for confirmation.

A reusable **session library** (sweet spot, threshold, VO2, over-unders,
sprints, endurance, recovery, openers) gives Claude known-good building
blocks; every bespoke session is saved and can be reused ("do that over-under
session from last month again but 10% shorter").

## Melbourne routes

- **Curated library**, seeded once and verified against your own rides:
  e.g. Beach Road, Kew Boulevard, Yarra Boulevard, the 1 in 20 and
  Dandenongs loops, Kinglake, Mt Donna Buang, Arthurs Seat, Capital City /
  Main Yarra trails. Each record: start point, distance, elevation, key
  climbs, surface, traffic notes, best time of day, wind exposure, GPX.
- **Learned from your history**: routes and climbs you actually ride are
  clustered from activity GPS, with your times and power on each.
- **Matching**: `suggest_route(session, time_available, start_point, date)`
  picks routes whose terrain suits the session (long steady climbs for
  threshold, rolling for endurance, flat for tempo) and checks the forecast
  (e.g. avoid a headwind home along Beach Road on a strong southerly; go
  indoor if rain or 38°C+).
- **Delivery**: GPX download; optionally via Strava/RideWithGPS routes, which
  sync courses to the Edge 830.

## Dashboard

Web app served by the same backend, single-user login, phone-friendly.

| Page | Contents |
|---|---|
| Today | Verdict + reasons, readiness contributors, planned session, weather, event countdown |
| Fitness | Performance chart (CTL/ATL/TSB), ramp rate, weekly TSS/hours/distance, planned vs completed |
| Power | Power-duration curve (all-time / season / 90 days, overlay years), FTP and W/kg history, best efforts and PBs |
| Health | HRV with normal band, resting HR, sleep (duration, stages, timing), temperature deviation, Oura vs Garmin comparison |
| Calendar | Plan by week, compliance, phase (base/build/peak/taper), drag-free — changes via chat |
| History | Every ride with drill-down (power/HR/cadence charts, intervals, decoupling), filter by year/route/type, year-on-year comparisons |
| Insights | Sleep vs next-day performance, HRV vs session quality, best training weeks |
| Event | Plan progress, target CTL vs actual, readiness for event |

## Motivation

- Morning brief with one specific, honest line of encouragement
- PB and milestone detection (power bests, longest ride, biggest climbing
  week, consistency streaks) announced after rides
- Weekly review: wins first, then next week
- Progress towards the event: target fitness curve vs actual
- Check-ins when motivation or compliance dips, with an easier fallback plan

## Proactive messages

Claude chat can't initiate, so scheduled messages go via push notification
(ntfy) with a link to the dashboard / a chat prompt:
- ~06:30 after Oura sync: verdict + today's session
- After each ride syncs: short analysis, PBs, one question
- Sunday evening: weekly review + next week's sessions pushed to Zwift/Garmin

## MCP tools (initial set)

Read: `get_today`, `get_readiness`, `get_wellness`, `get_activities`,
`analyze_activity`, `get_power_curve`, `get_load_trend`, `get_plan`,
`get_event`, `suggest_route`, `get_weather`, `compare_periods`

Write (confirm first): `create_workout`, `push_workout`, `move_workout`,
`replace_workout`, `delete_workout`, `build_plan`, `adjust_plan`,
`log_checkin`, `set_ftp`, `set_event`

Guardrails: ramp rate capped (~5–8 CTL/week) unless overridden; no more than
two hard days in a row without confirmation; all writes logged.

## Security

- Secrets in Fly secrets only; nothing in the frontend bundle
- MCP endpoint protected by OAuth (single user) as required by claude.ai
  custom connectors; dashboard behind login
- Supabase RLS on, service role used only by the backend
- Rate limits and a monthly spend cap on Anthropic API jobs

## Phases

| # | Scope | Outcome |
|---|---|---|
| 0 | Setup: Intervals.icu API key, Oura OAuth app, Fly app, Supabase project, Anthropic key, ntfy/Pushover | Credentials ready |
| 1 | Sync + 2-year backfill, power bests, load | All history in one DB |
| 2 | MCP server + read tools, Claude Project instructions | Chat about your data |
| 3 | Workout builder + push to Intervals.icu → Zwift / Edge 830, session library | **Bespoke Zwift sessions from chat** |
| 4 | Readiness engine, morning brief, post-ride notes | Daily rest-or-train |
| 5 | Dashboard (Today, Fitness, Power, Health, History, Calendar) | Full visual tracking |
| 6 | Event plan builder + adjustments, weekly review, motivation | Plan to target event |
| 7 | Melbourne routes + weather matching, Insights page | Outdoor suggestions |

## Open questions

- Confirm the event date (past editions ran in April)
- Session length available on Mon/Tue/Wed, and max long-ride duration
