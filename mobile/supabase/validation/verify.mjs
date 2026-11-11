import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { initdb as packagedInitdb } from '@embedded-postgres/windows-x64';
import pg from 'pg';
import { tmpdir } from 'node:os';
import { verifyPairing } from './pairing.mjs';
import { verifyPolicyReview } from './policy-review.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const migrationName = '20261110000000_init_our_days.sql';
const rlsMigrationName = '20261111000000_couple_data_rls.sql';
const migration = await readFile(join(root, '..', 'migrations', migrationName), 'utf8');
const pairingMigrationName = '20261111010000_pairing_lifecycle.sql';
const pairingMigration = await readFile(join(root, '..', 'migrations', pairingMigrationName), 'utf8');
const rlsMigration = await readFile(join(root, '..', 'migrations', rlsMigrationName), 'utf8');
const calendarMigrationName = '20261111020000_calendar_management.sql';
const calendarMigration = await readFile(join(root, '..', 'migrations', calendarMigrationName), 'utf8');
const anniversaryMigrationName = '20261111030000_anniversary_management.sql';
const anniversaryMigration = await readFile(join(root, '..', 'migrations', anniversaryMigrationName), 'utf8');
const annualMigrationName = '20261111040000_annual_push_reminders.sql';
const annualMigration = await readFile(join(root, '..', 'migrations', annualMigrationName), 'utf8');
const journalMigrationName = '20261111050000_journal_management.sql';
const journalMigration = await readFile(join(root, '..', 'migrations', journalMigrationName), 'utf8');
const reviewMigrationName = '20261111060000_input_policy_review.sql';
const reviewMigration = await readFile(join(root, '..', 'migrations', reviewMigrationName), 'utf8');
const runDir = await mkdtemp(join(tmpdir(), 'our-days-pg-'));
const nativeDir = join(runDir, 'native');
await cp(dirname(dirname(packagedInitdb)), nativeDir, { recursive: true });
const initdb = join(nativeDir, 'bin', 'initdb.exe');
const pg_ctl = join(nativeDir, 'bin', 'pg_ctl.exe');
const dataDir = join(runDir, 'data');
const passwordFile = join(runDir, 'password');
const password = randomBytes(24).toString('hex');
await writeFile(passwordFile, password);

function execute(binary, args) {
  const result = spawnSync(binary, args, {
    cwd: runDir, encoding: 'utf8', windowsHide: true, timeout: 60000,
    stdio: binary === pg_ctl ? 'ignore' : 'pipe',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${result.error?.message ?? 'PostgreSQL command failed'}\n${result.stdout}\n${result.stderr}`);
  }
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

const checks = [];
function passed(message) { checks.push(message); console.log(`PASS ${message}`); }
let started = false;
let client;
try {
  execute(initdb, ['-D', dataDir, '-U', 'postgres', '--auth=scram-sha-256', `--pwfile=${passwordFile}`, '--encoding=UTF8', '--locale=C']);
  const port = await availablePort();
  execute(pg_ctl, ['-D', dataDir, '-l', join(runDir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
  started = true;
  client = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres', connectionTimeoutMillis: 10000 });
  await client.connect();
  const version = (await client.query('select version()')).rows[0].version;
  const before = await client.query("select count(*)::int as total from pg_tables where schemaname = 'public'");
  assert.equal(before.rows[0].total, 0);
  passed('starts with an empty public schema');

  await client.query(await readFile(join(root, 'bootstrap.sql'), 'utf8'));
  await client.query('begin');
  await client.query(migration);
  await client.query(rlsMigration);
  await client.query(pairingMigration);
  await client.query(calendarMigration);
  await client.query(anniversaryMigration);
  await client.query(annualMigration);
  await client.query(journalMigration);
  await client.query(reviewMigration);
  await client.query('commit');
  passed('initial and couple-scoped RLS migrations apply');

  const expected = ['profiles', 'couples', 'couple_members', 'couple_invitations', 'calendar_events', 'anniversary_dates', 'anniversary_reminders', 'diary_entries', 'diary_comments', 'mood_entries', 'reminder_devices', 'annual_reminder_deliveries'].sort();
  const tables = await client.query("select tablename from pg_tables where schemaname = 'public' order by tablename");
  assert.deepEqual(tables.rows.map(row => row.tablename), expected);
  passed('all expected tables exist');
  const invalidConstraints = await client.query("select conname from pg_constraint where connamespace = 'public'::regnamespace and not convalidated");
  assert.equal(invalidConstraints.rowCount, 0);
  passed('all database constraints are validated');
  const functions = await client.query("select proname from pg_proc where pronamespace = 'public'::regnamespace order by proname");
  for (const name of ['accept_couple_invite', 'create_couple_invite', 'create_profile_for_new_user', 'is_couple_member']) {
    assert(functions.rows.some(row => row.proname === name), `missing function ${name}`);
  }
  passed('required database functions exist');

  await client.query('begin');
  await client.query(await readFile(join(root, 'smoke.sql'), 'utf8'));
  const counts = {};
  for (const table of expected) {
    counts[table] = (await client.query(`select count(*)::int as total from public.${table}`)).rows[0].total;
    assert.equal(counts[table], ['reminder_devices', 'annual_reminder_deliveries'].includes(table) ? 0 : ['profiles', 'couple_members'].includes(table) ? 2 : 1, `${table} row count`);
  }
  const profiles = await client.query(
    `select adult_confirmed, consent_version, consent_at
     from public.profiles
     where id = any($1::uuid[])
     order by id`,
    [['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002']],
  );
  assert.equal(profiles.rowCount, 2);
  for (const profile of profiles.rows) {
    assert.equal(profile.adult_confirmed, true);
    assert.equal(profile.consent_version, 'v1');
    assert.equal(profile.consent_at.toISOString(), '2026-11-11T00:00:00.000Z');
  }
  passed('valid signups create profiles with adult confirmation and versioned consent records; incomplete signups are rejected');
  await client.query('rollback');
  for (const table of expected) {
    assert.equal((await client.query(`select count(*)::int as total from public.${table}`)).rows[0].total, 0);
  }
  passed('smoke fixture transaction rolls back');

  await client.query('begin');
  await client.query(await readFile(join(root, 'smoke.sql'), 'utf8'));
  await client.query(await readFile(join(root, 'rls.sql'), 'utf8'));
  passed('paired, other-couple, unpaired, and identity-spoof RLS checks pass');
  await client.query('rollback');
  await client.query('begin');
  await client.query(await readFile(join(root, 'smoke.sql'), 'utf8'));
  await client.query(await readFile(join(root, 'calendar.sql'), 'utf8'));
  passed('partner calendar update/delete, immutable creator, timezone validation, and cross-couple isolation pass');
  await client.query('rollback');
  await client.query('begin');
  await client.query(await readFile(join(root, 'smoke.sql'), 'utf8'));
  await client.query(await readFile(join(root, 'anniversaries.sql'), 'utf8'));
  passed('anniversary CRUD, atomic reminder creation, personal reminder isolation, cascade deletion, invalid input, and unpaired/cross-couple denial pass');
  await client.query('rollback');
  await client.query('begin');
  await client.query(await readFile(join(root, 'smoke.sql'), 'utf8'));
  await client.query(await readFile(join(root, 'annual-reminders.sql'), 'utf8'));
  passed('server annual recurrence across unopened years, timezone/DST/leap-year calculations, deduplication, leases, cancellation, and device/RPC authorization pass');
  await client.query('rollback');
  await client.query('begin');
  await client.query(await readFile(join(root, 'smoke.sql'), 'utf8'));
  await client.query(await readFile(join(root, 'journal.sql'), 'utf8'));
  passed('journal CRUD, Unicode text boundaries/whitespace, immutable authors/parents, valid moods, comment cascade, and cross-couple/unpaired isolation pass');
  await client.query('rollback');
  await client.query('begin');
  await verifyPolicyReview(client);
  await client.query('rollback');
  passed('complete policy CRUD matrix, Unicode shared titles, immutable identities, parent relations and client ACL review pass');
  await verifyPairing(client, async () => {
    const connection = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password, database: 'postgres', connectionTimeoutMillis: 10000 });
    await connection.connect(); return connection;
  });
  passed('invitation rotation, expiry, pending access, two-member capacity, concurrent accepts, and RPC ACLs pass');
  await writeFile(join(root, 'result.json'), JSON.stringify({
    status: 'passed', completedAt: new Date().toISOString(), version,
    migration: [migrationName, rlsMigrationName, pairingMigrationName, calendarMigrationName, anniversaryMigrationName, annualMigrationName, journalMigrationName, reviewMigrationName],
    sha256: createHash('sha256').update(migration + rlsMigration + pairingMigration + calendarMigration + anniversaryMigration + annualMigration + journalMigration + reviewMigration).digest('hex'),
    checks, smokeCounts: counts,
    scope: 'Isolated PostgreSQL with Supabase Auth stubs; RLS evaluated as authenticated role.',
  }, null, 2) + '\n');
  console.log(`Completed ${checks.length} database checks; see supabase/validation/result.json`);
} finally {
  await client?.end();
  if (started) execute(pg_ctl, ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
  await writeFile(passwordFile, '');
}
