-- Executed as authenticated (not the migration owner) against real PostgreSQL RLS.
insert into auth.users (id, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000003', '{"adult_confirmed":true,"consent_accepted":true,"consent_version":"v1"}'),
  ('00000000-0000-4000-8000-000000000004', '{"adult_confirmed":true,"consent_accepted":true,"consent_version":"v1"}'),
  ('00000000-0000-4000-8000-000000000005', '{"adult_confirmed":true,"consent_accepted":true,"consent_version":"v1"}');
reset role;
insert into public.couples (id) values ('10000000-0000-4000-8000-000000000001');
insert into public.couple_members (couple_id, user_id)
values ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003'),
       ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004');
insert into public.diary_entries (couple_id, created_by, body)
values ('10000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000003', 'shared entry');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
do $$ begin
  if (select count(*) from public.diary_entries where body = 'shared entry') <> 1 then
    raise exception 'Partner could not read shared entry';
  end if;
  insert into public.mood_entries (couple_id, created_by, mood)
  values ('10000000-0000-4000-8000-000000000001', auth.uid(), 'happy');
end $$;

-- A separate couple is a real member but must not see or mutate the first couple.
reset role;
insert into public.couples (id) values ('10000000-0000-4000-8000-000000000002');
insert into public.couple_members (couple_id, user_id)
values ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000005');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.diary_entries where body = 'shared entry') <> 0 then
    raise exception 'Other couple can read shared entry';
  end if;
  update public.diary_entries set body = 'intruded' where body = 'shared entry';
  if (select body from public.diary_entries where body = 'shared entry') <> 'shared entry' then
    raise exception 'Other couple mutated shared entry';
  end if;
end $$;

-- A registered but unpaired user has no access and cannot insert into a known couple.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
set local role authenticated;
do $$ begin
  if (select count(*) from public.diary_entries where body = 'shared entry') <> 0 then
    raise exception 'Unpaired user can read couple data';
  end if;
  begin
    insert into public.mood_entries (couple_id, created_by, mood)
  values ('10000000-0000-4000-8000-000000000001', auth.uid(), 'sad');
    raise exception 'Unpaired user inserted couple data';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A paired member cannot impersonate their partner when creating records.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
set local role authenticated;
do $$ begin
  begin
    insert into public.diary_entries (couple_id, created_by, body)
    values ('10000000-0000-4000-8000-000000000001',
            '00000000-0000-4000-8000-000000000003', 'spoofed author');
    raise exception 'Member impersonated partner';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
