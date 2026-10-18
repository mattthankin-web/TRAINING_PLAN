-- Initial athlete context and target event, from the planning conversation.

insert into coach.athlete_profile (id, home_base, timezone, availability, equipment)
values (
  1,
  'Collingwood, VIC',
  'Australia/Melbourne',
  '{
    "mon": "indoor",
    "tue": "indoor",
    "wed": "indoor",
    "thu": "unavailable",
    "fri": "unavailable",
    "sat": "outdoor_long_or_rest",
    "sun": "outdoor_long_or_rest",
    "rule": "One of Saturday/Sunday is the long outdoor ride"
  }',
  '{
    "bike_computer": "Garmin Edge 830",
    "trainer": "Wahoo KICKR Core (ERG via Zwift)",
    "power_meter": true,
    "recovery": "Oura ring",
    "apps": ["Intervals.icu", "Zwift", "Strava", "Garmin Connect"]
  }'
)
on conflict (id) do nothing;

-- Date left null until confirmed: past editions ran in April, the next is
-- expected around April 2027.
insert into coach.goal_events (name, location, distance_km, elevation_m, goal, priority, notes)
select
  'Great Ocean & Otway Classic Ride (145 km)',
  'Torquay, VIC (Elephant Walk Reserve)',
  145,
  1426,
  'Finish in under 6 hours',
  'A',
  'Inland through the Otways to Lorne, then back along the Great Ocean Road to Torquay. Includes the ~12 km Benwerrin climb.'
where not exists (select 1 from coach.goal_events);
