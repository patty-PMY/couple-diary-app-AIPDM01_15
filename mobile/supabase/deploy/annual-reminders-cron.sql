-- 先在目標 Supabase 專案啟用 pg_cron、pg_net 與 Vault。
-- 在 Dashboard 將真實值存入 Vault，不要提交至 Git：
-- annual_reminder_url = https://<project-ref>.supabase.co/functions/v1/dispatch-annual-reminders
-- annual_reminder_secret = 與 Edge Function REMINDER_DISPATCH_SECRET 相同的至少 32 字元隨機值
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'annual_reminder_url')
    or not exists (select 1 from vault.decrypted_secrets where name = 'annual_reminder_secret') then
    raise exception 'Configure annual_reminder_url and annual_reminder_secret in Vault first';
  end if;
end $$;
select cron.unschedule(jobid) from cron.job where jobname = 'our-days-annual-reminders';
select cron.schedule('our-days-annual-reminders', '* * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'annual_reminder_url'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'annual_reminder_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 60000
  );
$$);
