set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$ declare whitespace text; begin
  -- 配對伴侶可編輯，但原作者不可改寫。
  update public.diary_entries set body = '伴侶編輯的日記';
  if not exists (select 1 from public.diary_entries where created_by = '00000000-0000-4000-8000-000000000001' and body = '伴侶編輯的日記') then raise exception 'Diary creator not preserved'; end if;
  begin
    update public.diary_entries set created_by = auth.uid();
    raise exception 'Diary creator spoof allowed';
  exception when insufficient_privilege then null; end;
  insert into public.diary_entries (couple_id, created_by, body)
    select id, auth.uid(), repeat('😊', 500) from public.couples;
  begin
    insert into public.diary_entries (couple_id, created_by, body)
      select id, auth.uid(), repeat('😊', 501) from public.couples;
    raise exception '501 code point diary allowed';
  exception when check_violation then null; end;
  insert into public.diary_comments (couple_id, diary_id, created_by, body)
    select couple_id, id, auth.uid(), repeat('💛', 100) from public.diary_entries where body = repeat('😊', 500);
  begin
    insert into public.diary_comments (couple_id, diary_id, created_by, body)
      select couple_id, id, auth.uid(), repeat('💛', 101) from public.diary_entries where body = repeat('😊', 500);
    raise exception '101 code point comment allowed';
  exception when check_violation then null; end;
  foreach whitespace in array array[E'\t\n\r', U&'\00A0', U&'\1680', U&'\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A', U&'\2028\2029\202F\205F\3000\FEFF'] loop
    begin
      insert into public.diary_entries (couple_id, created_by, body) select id, auth.uid(), whitespace from public.couples;
      raise exception 'Whitespace diary allowed';
    exception when check_violation then null; end;
    begin
      insert into public.diary_comments (couple_id, diary_id, created_by, body)
        select couple_id, id, auth.uid(), whitespace from public.diary_entries limit 1;
      raise exception 'Whitespace comment allowed';
    exception when check_violation then null; end;
  end loop;
  begin
    update public.diary_comments set diary_id = (select id from public.diary_entries where body = repeat('😊', 500)) where body <> repeat('💛', 100);
    raise exception 'Comment reparenting allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.mood_entries (couple_id, created_by, mood) select id, auth.uid(), 'unknown' from public.couples;
    raise exception 'Invalid mood allowed';
  exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$ begin
  update public.diary_comments set body = '伴侶編輯的留言';
  update public.mood_entries set mood = 'calm';
  if not exists (select 1 from public.diary_comments where created_by <> auth.uid() and body = '伴侶編輯的留言') then raise exception 'Partner comment update failed'; end if;
  if not exists (select 1 from public.mood_entries where created_by <> auth.uid() and mood = 'calm') then raise exception 'Partner mood update failed'; end if;
  begin
    update public.mood_entries set created_by = auth.uid();
    raise exception 'Mood creator spoof allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
insert into auth.users (id, raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000003', '{"adult_confirmed":true,"consent_accepted":true}'),
 ('00000000-0000-4000-8000-000000000004', '{"adult_confirmed":true,"consent_accepted":true}'),
 ('00000000-0000-4000-8000-000000000005', '{"adult_confirmed":true,"consent_accepted":true}');
insert into public.couples (id) values ('10000000-0000-4000-8000-000000000001');
insert into public.couple_members (couple_id, user_id) values
 ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003'),
 ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
do $$ declare affected integer; begin
  if exists (select 1 from public.diary_entries) or exists (select 1 from public.diary_comments) or exists (select 1 from public.mood_entries) then raise exception 'Other couple read journal data'; end if;
  update public.diary_entries set body = 'intrusion'; get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other couple updated diaries'; end if;
  update public.diary_comments set body = 'intrusion'; get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other couple updated comments'; end if;
  delete from public.mood_entries; get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Other couple deleted moods'; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
do $$ begin
  if exists (select 1 from public.diary_entries) or exists (select 1 from public.diary_comments) or exists (select 1 from public.mood_entries) then raise exception 'Unpaired user read journal'; end if;
  begin
    insert into public.diary_entries (couple_id, created_by, body) values ('10000000-0000-4000-8000-000000000001', auth.uid(), 'not allowed');
    raise exception 'Unpaired insert allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
do $$ begin
  delete from public.diary_entries;
  if exists (select 1 from public.diary_comments) then raise exception 'Diary comments did not cascade'; end if;
  delete from public.mood_entries;
  if exists (select 1 from public.mood_entries) then raise exception 'Mood delete failed'; end if;
end $$;
reset role;
