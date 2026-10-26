-- Optional: close idle sessions server-side every 10 minutes.
-- Requires the pg_cron extension (Database → Extensions → pg_cron in the Supabase dashboard).
create extension if not exists pg_cron;

select cron.schedule(
  'close-stale-sessions',
  '*/10 * * * *',
  $$select public.close_stale_sessions()$$
);
