-- 配對成員可管理共享內容，原作者、所屬配對與留言所屬日記不可改寫。
create function public.validate_journal_content()
returns trigger language plpgsql set search_path = '' as $$
declare maximum integer;
begin
  if TG_OP = 'UPDATE' then
    if new.id is distinct from old.id or new.couple_id is distinct from old.couple_id
      or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
      raise exception 'Journal identity cannot be changed' using errcode = '42501';
    end if;
    if TG_TABLE_NAME = 'diary_comments' then
      if new.diary_id is distinct from old.diary_id then
        raise exception 'Comment parent cannot be changed' using errcode = '42501';
      end if;
    end if;
  end if;
  if TG_TABLE_NAME <> 'mood_entries' then
    maximum := case when TG_TABLE_NAME = 'diary_entries' then 500 else 100 end;
    -- ECMAScript String.trim() 的空白集合，與用戶端驗證一致。
    if new.body is null or char_length(new.body) not between 1 and maximum
      or length(btrim(new.body, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) = 0 then
      raise exception 'Invalid journal text' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger validate_diary before insert or update on public.diary_entries for each row execute function public.validate_journal_content();
create trigger validate_comment before insert or update on public.diary_comments for each row execute function public.validate_journal_content();
create trigger validate_mood before insert or update on public.mood_entries for each row execute function public.validate_journal_content();
revoke all on function public.validate_journal_content() from public, anon, authenticated;

drop policy "Members update diary entries" on public.diary_entries;
create policy "Members update diary entries" on public.diary_entries
  for update to authenticated using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
drop policy "Members update diary comments" on public.diary_comments;
create policy "Members update diary comments" on public.diary_comments
  for update to authenticated using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
drop policy "Members update mood entries" on public.mood_entries;
create policy "Members update mood entries" on public.mood_entries
  for update to authenticated using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
