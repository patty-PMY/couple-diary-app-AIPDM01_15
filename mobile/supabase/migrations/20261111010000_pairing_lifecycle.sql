-- A one-member space is an invitation in progress, not a completed pair.
create or replace function public.is_couple_member(target_couple_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.couple_members
    where couple_id = target_couple_id and user_id = auth.uid())
    and (select count(*) from public.couple_members where couple_id = target_couple_id) = 2;
$$;

create function public.get_pairing_status()
returns table (couple_id uuid, member_count bigint)
language sql stable security definer set search_path = '' as $$
  select cm.couple_id, (select count(*) from public.couple_members other where other.couple_id = cm.couple_id)
  from public.couple_members cm where cm.user_id = auth.uid();
$$;

-- Membership and invitation mutations must go through the transactional RPCs.
drop policy if exists "Members add their couple membership" on public.couple_members;
revoke insert, update, delete on public.couples, public.couple_members, public.couple_invitations from authenticated, anon;
revoke all on function public.is_couple_member_for_user(uuid, uuid) from public, anon, authenticated;
revoke all on function public.is_couple_member(uuid) from public, anon;
revoke all on function public.get_pairing_status() from public, anon;
grant execute on function public.get_pairing_status() to authenticated;

-- Also enforce the two-member limit for privileged writes, serializing per couple.
create function public.enforce_couple_capacity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.couples where id = new.couple_id for update;
  if (select count(*) from public.couple_members
      where couple_id = new.couple_id and user_id <> new.user_id) >= 2 then
    raise exception 'Couple already has two members';
  end if;
  return new;
end;
$$;
create trigger enforce_couple_capacity before insert or update on public.couple_members
for each row execute function public.enforce_couple_capacity();
revoke all on function public.enforce_couple_capacity() from public, anon, authenticated;

create or replace function public.create_couple_invite()
returns text language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
  token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  -- Serialize create/accept requests for the same user, even across devices.
  perform 1 from auth.users where id = auth.uid() for update;
  select couple_id into target from public.couple_members where user_id = auth.uid();
  if target is null then
    insert into public.couples default values returning id into target;
    insert into public.couple_members (couple_id, user_id) values (target, auth.uid());
  end if;
  perform 1 from public.couples where id = target for update;
  if (select count(*) from public.couple_members where couple_id = target) >= 2 then
    raise exception 'User already belongs to a couple';
  end if;
  -- Regenerate after expiry, reload, or loss of the plaintext code.
  update public.couple_invitations set expires_at = now()
    where couple_id = target and accepted_at is null;
  insert into public.couple_invitations (couple_id, created_by, token_hash, expires_at)
  values (target, auth.uid(), encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'), 'hex'), now() + interval '48 hours');
  return token;
end;
$$;

create or replace function public.accept_couple_invite(invite_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  invitation public.couple_invitations%rowtype;
  target uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if invite_token is null or invite_token !~ '^[0-9a-f]{48}$' then raise exception 'Invalid invitation'; end if;
  perform 1 from auth.users where id = auth.uid() for update;
  if exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'User already belongs to a couple';
  end if;
  select couple_id into target from public.couple_invitations
    where token_hash = encode(extensions.digest(convert_to(invite_token, 'UTF8'), 'sha256'), 'hex');
  if target is null then raise exception 'Invitation is invalid, expired, or already used'; end if;
  -- Lock couple before invitation, matching create_couple_invite lock order.
  perform 1 from public.couples where id = target for update;
  select * into invitation from public.couple_invitations
    where token_hash = encode(extensions.digest(convert_to(invite_token, 'UTF8'), 'sha256'), 'hex') for update;
  if invitation.accepted_at is not null or invitation.expires_at <= now() then
    raise exception 'Invitation is invalid, expired, or already used';
  end if;
  if invitation.created_by = auth.uid() then raise exception 'The invitation creator cannot accept their own invitation'; end if;
  if (select count(*) from public.couple_members where couple_id = target) <> 1
    or not exists (select 1 from public.couple_members where couple_id = target and user_id = invitation.created_by) then
    raise exception 'Couple already has two members';
  end if;
  insert into public.couple_members (couple_id, user_id) values (target, auth.uid());
  update public.couple_invitations set accepted_by = auth.uid(), accepted_at = now() where id = invitation.id;
  return target;
end;
$$;
