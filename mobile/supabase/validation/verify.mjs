import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { initdb as packagedInitdb } from '@embedded-postgres/windows-x64';
import pg from 'pg';

const root = dirname(fileURLToPath(import.meta.url));
const migrationName = '20261110000000_init_our_days.sql';
const rlsMigrationName = '20261111000000_couple_data_rls.sql';
const migration = await readFile(join(root, '..', 'migrations', migrationName), 'utf8');
const rlsMigration = await readFile(join(root, '..', 'migrations', rlsMigrationName), 'utf8');
const runDir = await mkdtemp(join('C:\\\\Users\\\\patty\\\\AppData\\\\Local\\\\Temp', 'our-days-pg-'));
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
  await client.query('commit');
  passed('initial and couple-scoped RLS migrations apply');

  const expected = ['profiles', 'couples', 'couple_members', 'couple_invitations', 'calendar_events', 'anniversary_dates', 'anniversary_reminders', 'diary_entries', 'diary_comments', 'mood_entries'].sort();
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
    assert.equal(counts[table], ['profiles', 'couple_members'].includes(table) ? 2 : 1, `${table} row count`);
  }
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
  await writeFile(join(root, 'result.json'), JSON.stringify({
    status: 'passed', completedAt: new Date().toISOString(), version,
    migration: [migrationName, rlsMigrationName],
    sha256: createHash('sha256').update(migration + rlsMigration).digest('hex'),
    checks, smokeCounts: counts,
    scope: 'Isolated PostgreSQL with Supabase Auth stubs; RLS evaluated as authenticated role.',
  }, null, 2) + '\n');
  console.log(`Completed ${checks.length} database checks; see supabase/validation/result.json`);
} finally {
  await client?.end();
  if (started) execute(pg_ctl, ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
  await writeFile(passwordFile, '');
}
