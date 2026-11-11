-- 僅供本機空白 PostgreSQL 使用的 Supabase 依賴契約。
-- 這不是完整的 Supabase Auth 服務，不可套用到託管 Supabase 專案。
create schema auth;
create schema extensions;
create role anon nologin;
create role authenticated nologin;
create table auth.users (
  id uuid primary key,
  raw_user_meta_data jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
