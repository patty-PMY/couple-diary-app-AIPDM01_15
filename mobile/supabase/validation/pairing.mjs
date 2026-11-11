import assert from 'node:assert/strict';

export async function verifyPairing(client, connect) {
  const users = Array.from({ length: 8 }, (_, i) => `20000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
  for (const user of users) {
    await client.query(`insert into auth.users (id, raw_user_meta_data) values ($1, '{"adult_confirmed":true,"consent_accepted":true}')`, [user]);
  }
  async function as(user, connection = client) {
    await connection.query('set role authenticated');
    await connection.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  }
  async function rejected(sql, values, pattern) {
    await assert.rejects(client.query(sql, values), pattern);
  }
  await as(users[0]);
  const oldToken = (await client.query('select public.create_couple_invite() as token')).rows[0].token;
  assert.match(oldToken, /^[0-9a-f]{48}$/);
  const pending = (await client.query('select * from public.get_pairing_status()')).rows[0];
  assert.equal(Number(pending.member_count), 1);
  assert.equal((await client.query('select public.is_couple_member($1) as allowed', [pending.couple_id])).rows[0].allowed, false);
  await rejected("insert into public.diary_entries (couple_id,created_by,body) values ($1,$2,'blocked')", [pending.couple_id, users[0]], /row-level security/);
  const token = (await client.query('select public.create_couple_invite() as token')).rows[0].token;
  assert.notEqual(oldToken, token);
  assert.equal((await client.query('select * from public.get_pairing_status()')).rows[0].couple_id, pending.couple_id);
  await rejected('select public.accept_couple_invite($1)', [token], /already belongs/);
  await client.query('reset role');
  // Even if a privileged process inserts data into a pending space, RLS hides it.
  await client.query("insert into public.diary_entries (couple_id,created_by,body) values ($1,$2,'pending secret')", [pending.couple_id, users[0]]);
  const diary = (await client.query('select id from public.diary_entries where couple_id = $1', [pending.couple_id])).rows[0].id;
  const anniversary = (await client.query("insert into public.anniversary_dates (couple_id,created_by,title,event_date) values ($1,$2,'date','2026-12-01') returning id", [pending.couple_id, users[0]])).rows[0].id;
  const shared = [
    ['calendar_events', 'couple_id,created_by,title,starts_at', [pending.couple_id, users[0], 'event', '2026-12-01T00:00:00Z']],
    ['anniversary_dates', 'couple_id,created_by,title,event_date', [pending.couple_id, users[0], 'date', '2026-12-01']],
    ['anniversary_reminders', 'couple_id,user_id,anniversary_id', [pending.couple_id, users[0], anniversary]],
    ['diary_entries', 'couple_id,created_by,body', [pending.couple_id, users[0], 'secret']],
    ['diary_comments', 'couple_id,created_by,diary_id,body', [pending.couple_id, users[0], diary, 'comment']],
    ['mood_entries', 'couple_id,created_by,mood', [pending.couple_id, users[0], 'happy']],
  ];
  for (const [table, columns, values] of shared) {
    // Dates and diary were seeded above; seed the other four tables as owner.
    if (!['anniversary_dates', 'diary_entries'].includes(table)) {
      await client.query(`insert into public.${table} (${columns}) values (${values.map((_, i) => `$${i + 1}`).join(',')})`, values);
    }
  }
  await as(users[0]);
  for (const [table, columns, values] of shared) {
    assert.equal((await client.query(`select * from public.${table}`)).rowCount, 0, `${table}: pending read denied`);
    await rejected(`insert into public.${table} (${columns}) values (${values.map((_, i) => `$${i + 1}`).join(',')})`, values, /row-level security/);
  }
  await as(users[1]);
  await rejected('select public.accept_couple_invite($1)', ['not-a-code'], /Invalid invitation/);
  await rejected('select public.accept_couple_invite($1)', ['f'.repeat(48)], /invalid, expired/);
  await rejected('select public.accept_couple_invite($1)', [oldToken], /invalid, expired/);
  // Two simultaneous accepts: exactly one wins and the pair never has three users.
  const c1 = await connect(); const c2 = await connect();
  try {
    await as(users[1], c1); await as(users[2], c2);
    const results = await Promise.allSettled([
      c1.query('select public.accept_couple_invite($1)', [token]),
      c2.query('select public.accept_couple_invite($1)', [token]),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  } finally { await c1.end(); await c2.end(); }
  await as(users[0]);
  assert.equal(Number((await client.query('select * from public.get_pairing_status()')).rows[0].member_count), 2);
  assert.equal((await client.query('select * from public.diary_entries')).rowCount, 1);
  await rejected('select public.create_couple_invite()', [], /already belongs/);
  await as(users[3]);
  await rejected('select public.accept_couple_invite($1)', [token], /invalid, expired/);
  await rejected('insert into public.couple_members (couple_id,user_id) values ($1,$2)', [pending.couple_id, users[3]], /permission denied/);
  await client.query('reset role');
  await rejected('insert into public.couple_members (couple_id,user_id) values ($1,$2)', [pending.couple_id, users[3]], /two members/);

  // One user concurrently accepts two different invitations: only one membership.
  await as(users[3]);
  const t1 = (await client.query('select public.create_couple_invite() as token')).rows[0].token;
  await as(users[4]);
  const t2 = (await client.query('select public.create_couple_invite() as token')).rows[0].token;
  const c3 = await connect(); const c4 = await connect();
  try {
    await as(users[5], c3); await as(users[5], c4);
    const results = await Promise.allSettled([
      c3.query('select public.accept_couple_invite($1)', [t1]),
      c4.query('select public.accept_couple_invite($1)', [t2]),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  } finally { await c3.end(); await c4.end(); }
  await as(users[5]);
  assert.equal((await client.query('select * from public.get_pairing_status()')).rowCount, 1);
  for (const [table, columns, values] of shared) {
    assert.equal((await client.query(`select * from public.${table}`)).rowCount, 0, `${table}: other couple read denied`);
    const attempted = values.map(v => v === users[0] ? users[5] : v);
    await rejected(`insert into public.${table} (${columns}) values (${attempted.map((_, i) => `$${i + 1}`).join(',')})`, attempted, /row-level security/);
    assert.equal((await client.query(`update public.${table} set couple_id = couple_id where couple_id = $1`, [pending.couple_id])).rowCount, 0);
    assert.equal((await client.query(`delete from public.${table} where couple_id = $1`, [pending.couple_id])).rowCount, 0);
  }
  await as(users[6]);
  const expired = (await client.query('select public.create_couple_invite() as token')).rows[0].token;
  await client.query('reset role');
  await client.query('update public.couple_invitations set expires_at = now() - interval \'1 second\' where created_by = $1', [users[6]]);
  await as(users[7]);
  await rejected('select public.accept_couple_invite($1)', [expired], /invalid, expired/);
  assert.equal((await client.query('select * from public.get_pairing_status()')).rowCount, 0);
  assert.equal((await client.query('select * from public.diary_entries')).rowCount, 0);
  for (const [table, columns, values] of shared) {
    assert.equal((await client.query(`select * from public.${table}`)).rowCount, 0, `${table}: unpaired read denied`);
    const attempted = values.map(v => v === users[0] ? users[7] : v);
    await rejected(`insert into public.${table} (${columns}) values (${attempted.map((_, i) => `$${i + 1}`).join(',')})`, attempted, /row-level security/);
    assert.equal((await client.query(`update public.${table} set couple_id = couple_id where couple_id = $1`, [pending.couple_id])).rowCount, 0);
    assert.equal((await client.query(`delete from public.${table} where couple_id = $1`, [pending.couple_id])).rowCount, 0);
  }
  await client.query('set role anon');
  await rejected('select public.create_couple_invite()', [], /permission denied/);
  await rejected('select public.get_pairing_status()', [], /permission denied/);
  await client.query('reset role');
}
