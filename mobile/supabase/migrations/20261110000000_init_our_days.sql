create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  adult_confirmed boolean not null default false,
  consent_version text not null,
  consent_at timestamptz not null,
  created_at timestamptz not null default now()
);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if coalesce((metadata ->> 'adult_confirmed')::boolean, false) is not true then
    raise exception 'Adult confirmation is required';
  end if;
  if coalesce((metadata ->> 'consent_accepted')::boolean, false) is not true then
    raise exception 'Consent is required';
  end if;

  insert into public.profiles (id, adult_confirmed, consent_version, consent_at)
  values (
    new.id,
    true,
    coalesce(metadata ->> 'consent_version', 'v1'),
    coalesce((metadata ->> 'consent_at')::timestamptz, now())
  );
  return new;
end;
$$;

create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

create table public.couples (
  id uuid primary key default extensions.gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id),
  unique (user_id)
);

create or replace function public.is_couple_member(target_couple_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.couple_members cm
    where cm.couple_id = target_couple_id and cm.user_id = auth.uid()
  );
$$;

create table public.couple_invitations (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.create_couple_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_couple_id uuid;
  invite_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'User already belongs to a couple';
  end if;

  insert into public.couples default values returning id into new_couple_id;
  insert into public.couple_members (couple_id, user_id) values (new_couple_id, auth.uid());
  insert into public.couple_invitations (couple_id, created_by, token_hash, expires_at)
  values (
    new_couple_id,
    auth.uid(),
    encode(extensions.digest(convert_to(invite_token, 'UTF8'), 'sha256'), 'hex'),
    now() + interval '48 hours'
  );
  return invite_token;
end;
$$;

create or replace function public.accept_couple_invite(invite_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.couple_invitations%rowtype;
  member_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if invite_token is null or length(invite_token) < 32 then
    raise exception 'Invalid invitation';
  end if;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'User already belongs to a couple';
  end if;

  select * into invitation
  from public.couple_invitations ci
  where ci.token_hash = encode(extensions.digest(convert_to(invite_token, 'UTF8'), 'sha256'), 'hex')
    and ci.accepted_at is null
    and ci.expires_at > now()
  for update;
  if not found then
    raise exception 'Invitation is invalid, expired, or already used';
  end if;
  if invitation.created_by = auth.uid() then
    raise exception 'The invitation creator cannot accept their own invitation';
  end if;

  perform 1 from public.couples where id = invitation.couple_id for update;
  select count(*) into member_count
  from public.couple_members where couple_id = invitation.couple_id;
  if member_count >= 2 then
    raise exception 'Couple already has two members';
  end if;

  insert into public.couple_members (couple_id, user_id) values (invitation.couple_id, auth.uid());
  update public.couple_invitations
  set accepted_by = auth.uid(), accepted_at = now()
  where id = invitation.id;
  return invitation.couple_id;
end;
$$;

create table public.calendar_events (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'Asia/Taipei',
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table public.anniversary_dates (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  event_date date not null,
  repeats_yearly boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, couple_id)
);

create table public.anniversary_reminders (
  id uuid primary key default extensions.gen_random_uuid(),
  anniversary_id uuid not null,
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  days_before integer not null default 1 check (days_before between 0 and 30),
  created_at timestamptz not null default now(),
  unique (anniversary_id, user_id),
  foreign key (anniversary_id, couple_id) references public.anniversary_dates(id, couple_id) on delete cascade
);

create table public.diary_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500 and length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  unique (id, couple_id)
);

create table public.diary_comments (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  diary_id uuid not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 100 and length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  foreign key (diary_id, couple_id) references public.diary_entries(id, couple_id) on delete cascade
);

create table public.mood_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  mood text not null check (mood in ('happy', 'calm', 'sad', 'excited', 'tired', 'loved')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.couple_invitations enable row level security;
alter table public.calendar_events enable row level security;
alter table public.anniversary_dates enable row level security;
alter table public.anniversary_reminders enable row level security;
alter table public.diary_entries enable row level security;
alter table public.diary_comments enable row level security;
alter table public.mood_entries enable row level security;

create policy "Users read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "Members read their couple" on public.couples
  for select to authenticated using (public.is_couple_member(id));

create policy "Members read couple membership" on public.couple_members
  for select to authenticated using (public.is_couple_member(couple_id));

create policy "Creators read their invitations" on public.couple_invitations
  for select to authenticated using (created_by = auth.uid());

create policy "Members read calendar events" on public.calendar_events
  for select to authenticated using (public.is_couple_member(couple_id));
create policy "Members add their calendar events" on public.calendar_events
  for insert to authenticated with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Authors update their calendar events" on public.calendar_events
  for update to authenticated using (public.is_couple_member(couple_id) and created_by = auth.uid())
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Authors delete their calendar events" on public.calendar_events
  for delete to authenticated using (public.is_couple_member(couple_id) and created_by = auth.uid());

create policy "Members read anniversary dates" on public.anniversary_dates
  for select to authenticated using (public.is_couple_member(couple_id));
create policy "Members add anniversary dates" on public.anniversary_dates
  for insert to authenticated with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Authors update anniversary dates" on public.anniversary_dates
  for update to authenticated using (public.is_couple_member(couple_id) and created_by = auth.uid())
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Authors delete anniversary dates" on public.anniversary_dates
  for delete to authenticated using (public.is_couple_member(couple_id) and created_by = auth.uid());

create policy "Users read their own anniversary reminders" on public.anniversary_reminders
  for select to authenticated using (user_id = auth.uid() and public.is_couple_member(couple_id));
create policy "Users manage their own anniversary reminders" on public.anniversary_reminders
  for insert to authenticated with check (user_id = auth.uid() and public.is_couple_member(couple_id));
create policy "Users update their own anniversary reminders" on public.anniversary_reminders
  for update to authenticated using (user_id = auth.uid() and public.is_couple_member(couple_id))
  with check (user_id = auth.uid() and public.is_couple_member(couple_id));
create policy "Users delete their own anniversary reminders" on public.anniversary_reminders
  for delete to authenticated using (user_id = auth.uid() and public.is_couple_member(couple_id));

create policy "Members read diary entries" on public.diary_entries
  for select to authenticated using (public.is_couple_member(couple_id));
create policy "Members publish diary entries" on public.diary_entries
  for insert to authenticated with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Authors update diary entries" on public.diary_entries
  for update to authenticated using (public.is_couple_member(couple_id) and created_by = auth.uid())
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Authors delete diary entries" on public.diary_entries
  for delete to authenticated using (public.is_couple_member(couple_id) and created_by = auth.uid());

create policy "Members read diary comments" on public.diary_comments
  for select to authenticated using (public.is_couple_member(couple_id));
create policy "Members add diary comments" on public.diary_comments
  for insert to authenticated with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Authors update diary comments" on public.diary_comments
  for update to authenticated using (public.is_couple_member(couple_id) and created_by = auth.uid())
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Authors delete diary comments" on public.diary_comments
  for delete to authenticated using (public.is_couple_member(couple_id) and created_by = auth.uid());

create policy "Members read mood entries" on public.mood_entries
  for select to authenticated using (public.is_couple_member(couple_id));
create policy "Members add mood entries" on public.mood_entries
  for insert to authenticated with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Authors update mood entries" on public.mood_entries
  for update to authenticated using (public.is_couple_member(couple_id) and created_by = auth.uid())
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy "Authors delete mood entries" on public.mood_entries
  for delete to authenticated using (public.is_couple_member(couple_id) and created_by = auth.uid());

grant usage on schema public to authenticated;
grant select on public.profiles, public.couples, public.couple_members, public.couple_invitations,
  public.calendar_events, public.anniversary_dates, public.anniversary_reminders, public.diary_entries, public.diary_comments,
  public.mood_entries to authenticated;
grant insert, update, delete on public.calendar_events, public.anniversary_dates,
  public.anniversary_reminders, public.diary_entries, public.diary_comments, public.mood_entries to authenticated;
grant execute on function public.is_couple_member(uuid) to authenticated;
grant execute on function public.create_couple_invite() to authenticated;
grant execute on function public.accept_couple_invite(text) to authenticated;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
revoke all on function public.create_couple_invite() from public, anon;
revoke all on function public.accept_couple_invite(text) from public, anon;
