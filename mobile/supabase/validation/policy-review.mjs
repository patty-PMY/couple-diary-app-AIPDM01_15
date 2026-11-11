import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Exercise real PostgreSQL roles, without relying on client-side filters.
export async function verifyPolicyReview(client) {
  const users = Array.from({ length: 6 }, () => randomUUID());
  for (const id of users) await client.query(`insert into auth.users values ($1, '{"adult_confirmed":true,"consent_accepted":true}')`, [id]);
  const groups = [];
  for (const members of [users.slice(0, 2), users.slice(2, 4), [users[5]]]) {
    const couple = (await client.query('insert into public.couples default values returning id')).rows[0].id;
    for (const member of members) await client.query('insert into public.couple_members(couple_id,user_id) values ($1,$2)', [couple, member]);
    const owner = members[0];
    const rows = {};
    const insert = async (table, columns, values) => {
      rows[table] = (await client.query(`insert into public.${table} (${columns.join(',')}) values (${values.map((_, i) => `$${i + 1}`).join(',')}) returning *`, values)).rows[0];
    };
    await insert('calendar_events', ['couple_id','created_by','title','starts_at'], [couple,owner,'review event','2026-11-12T10:00:00Z']);
    await insert('anniversary_dates', ['couple_id','created_by','title','event_date'], [couple,owner,'review date','2024-02-29']);
    await insert('diary_entries', ['couple_id','created_by','body'], [couple,owner,'private diary']);
    await insert('diary_comments', ['couple_id','created_by','diary_id','body'], [couple,owner,rows.diary_entries.id,'private comment']);
    await insert('mood_entries', ['couple_id','created_by','mood'], [couple,owner,'happy']);
    await insert('anniversary_reminders', ['couple_id','user_id','anniversary_id'], [couple,owner,rows.anniversary_dates.id]);
    groups.push({ couple, members, rows });
  }
  let cases = 0;
  async function trial(role, user, query, values, allowed, operation) {
    await client.query('savepoint policy_case');
    try {
      await client.query(`set local role ${role}`);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? '']);
      const result = await query(values);
      assert.equal(result.rowCount, allowed ? 1 : 0, `${role}/${user}: ${operation}`);
    } catch (error) {
      if (allowed || error.code !== '42501') throw error;
    } finally { await client.query('rollback to savepoint policy_case'); }
    cases++;
  }
  for (const group of groups) for (const [table, row] of Object.entries(group.rows)) {
    for (const user of [...users, null]) {
      const role = user ? 'authenticated' : 'anon';
      const member = group.members.length === 2 && group.members.includes(user);
      const own = table !== 'anniversary_reminders' || row.user_id === user;
      const allowed = member && own;
      await trial(role, user, values => client.query(`select * from public.${table} where id=$1`, values), [row.id], allowed, `select ${table}`);
      const field = table === 'anniversary_reminders' ? 'days_before' : table === 'mood_entries' ? 'mood' : table.startsWith('diary_') ? 'body' : 'title';
      const value = field === 'days_before' ? 2 : field === 'mood' ? 'calm' : 'changed by member';
      await trial(role, user, values => client.query(`update public.${table} set ${field}=$2 where id=$1 returning *`, values), [row.id,value], allowed, `update ${table}`);
      await trial(role, user, values => client.query(`delete from public.${table} where id=$1 returning *`, values), [row.id], allowed, `delete ${table}`);
      const clone = { ...row, id: randomUUID(), [table === 'anniversary_reminders' ? 'user_id' : 'created_by']: user ?? users[4] };
      const columns = Object.keys(clone);
      await trial(role, user, async values => {
        // Restore after every trial, including the owner's unique reminder row.
        if (table === 'anniversary_reminders' && row.user_id === user) await client.query(`delete from public.${table} where id=$1`, [row.id]);
        return client.query(`insert into public.${table} (${columns.join(',')}) values (${columns.map((_,i) => `$${i+1}`).join(',')}) returning *`, values);
      }, Object.values(clone), member, `insert ${table}`);
    }
  }

  // Even a legitimate member cannot spoof a creator or bypass Unicode limits.
  const group = groups[0];
  async function rejected(sql, values, codes) {
    await client.query('savepoint invalid_case');
    let code;
    try {
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [users[0]]);
      await client.query(sql, values);
    } catch (error) { code = error.code; }
    finally { await client.query('rollback to savepoint invalid_case'); }
    assert(codes.includes(code), `Expected ${codes}, received ${code}: ${sql}`);
    cases++;
  }
  const blanks = '\t\n\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';
  for (const table of ['calendar_events','anniversary_dates']) {
    for (const title of [blanks, '😊'.repeat(121)]) await rejected(`update public.${table} set title=$2 where id=$1`, [group.rows[table].id,title], ['23514']);
    await trial('authenticated', users[0], async values => {
      const result = await client.query(`update public.${table} set title=$2 where id=$1 returning title`, values);
      assert.equal(result.rows[0].title, '😊'.repeat(120)); return result;
    }, [group.rows[table].id, `${blanks}${'😊'.repeat(120)}${blanks}`], true, `Unicode trim ${table}`);
  }
  for (const [table,row] of Object.entries(group.rows).filter(([table]) => table !== 'anniversary_reminders')) {
    await rejected(`update public.${table} set created_by=$2 where id=$1`, [row.id,users[1]], ['42501']);
    await rejected(`update public.${table} set couple_id=$2 where id=$1`, [row.id,groups[1].couple], ['42501']);
  }
  await rejected('insert into public.diary_comments(couple_id,created_by,diary_id,body) values($1,$2,$3,$4)', [group.couple,users[0],groups[1].rows.diary_entries.id,'foreign parent'], ['23503']);
  await rejected('insert into public.calendar_events(couple_id,created_by,title,starts_at) values($1,$2,$3,now())', [group.couple,users[1],'spoof'], ['42501']);

  const secured = await client.query("select tablename,rowsecurity from pg_tables where schemaname='public'");
  assert(secured.rows.every(row => row.rowsecurity), 'All public data tables require RLS');
  for (const table of ['couple_members','couple_invitations','profiles','annual_reminder_deliveries']) {
    const privileges = (await client.query("select has_table_privilege('authenticated',$1,'INSERT') as ins,has_table_privilege('authenticated',$1,'UPDATE') as upd,has_table_privilege('authenticated',$1,'DELETE') as del", [`public.${table}`])).rows[0];
    assert.deepEqual(privileges, { ins:false, upd:false, del:false }, `Direct writes: ${table}`);
  }
  const unsafe = await client.query(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prosecdef and has_function_privilege('anon',p.oid,'EXECUTE')`);
  assert.deepEqual(unsafe.rows, [], 'Anonymous callers cannot invoke security-definer functions');
  console.log(`PASS ${cases} policy/input cases: both couples, unpaired, pending, anonymous, private reminders, immutable identity, Unicode limits and ACLs`);
}
