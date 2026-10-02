-- ==============================================================================
-- Daily task reminder schedule
-- Calls the `task-reminder` Edge Function at 20:00 IST (14:30 UTC), Monday to Friday.
-- pg_cron schedules in UTC, so 8 PM IST is 14:30 UTC (IST = UTC+5:30).
-- Run once in the Supabase SQL Editor after deploying the function.
-- Replace <CRON_SECRET> with the same value you set as the function's CRON_SECRET secret.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Keep the secret in Vault instead of in the job definition
SELECT vault.create_secret('<CRON_SECRET>', 'task_reminder_cron_secret')
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'task_reminder_cron_secret');

-- Replace any previous version of the job
SELECT cron.unschedule('daily-task-reminder')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-task-reminder');

SELECT cron.schedule(
    'daily-task-reminder',
    '30 14 * * 1-5',
    $$
    SELECT net.http_post(
        url := 'https://cmmeevutwxaxrygwaiyd.supabase.co/functions/v1/task-reminder',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'task_reminder_cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
    );
    $$
);

-- Check it:   SELECT jobname, schedule, active FROM cron.job;
-- Run history: SELECT status, return_message, start_time FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
-- Stop it:    SELECT cron.unschedule('daily-task-reminder');
