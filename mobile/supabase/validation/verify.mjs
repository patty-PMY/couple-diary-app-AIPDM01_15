import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { initdb as packagedInitdb } from '@embedded-postgres/windows-x64';
import pg from 'pg';

// 只操作本次建立的本機資料庫，不接受遠端資料庫連線字串。
const root = dirname(fileURLToPath(import.meta.url));
const migrationName = '20261110000000_init_our_days.sql';
const migration = await readFile(join(root, '..', 'migrations', migrationName), 'utf8');
// Windows PostgreSQL 的非 Unicode 子程序需要英文執行路徑。
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
    // pg_ctl 的 Windows 子程序會繼承 pipe handle，導致同步呼叫不返回。
    stdio: binary === pg_ctl ? 'ignore' : 'pipe',
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${result.error?.message ?? 'PostgreSQL 指令失敗'}\n${result.stdout}\n${result.stderr}`);
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
function passed(message) { checks.push(message); console.log(`通過：${message}`); }
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
  passed('確認 public schema 為空白，沒有沿用既有應用程式資料表');

  await client.query(await readFile(join(root, 'bootstrap.sql'), 'utf8'));
  await client.query('begin');
  await client.query(migration);
  await client.query('commit');
  passed('原始遷移檔在單一交易完整套用成功');

  const expected = ['profiles', 'couples', 'couple_members', 'couple_invitations', 'calendar_events', 'anniversary_dates', 'anniversary_reminders', 'diary_entries', 'diary_comments', 'mood_entries'].sort();
  const tables = await client.query("select tablename from pg_tables where schemaname = 'public' order by tablename");
  assert.deepEqual(tables.rows.map(row => row.tablename), expected);
  passed('10 張應用程式資料表均建立成功');
  const invalidConstraints = await client.query("select conname from pg_constraint where connamespace = 'public'::regnamespace and not convalidated");
  assert.equal(invalidConstraints.rowCount, 0);
  passed('外鍵及檢查約束均已建立且通過 PostgreSQL 驗證');
  const functions = await client.query("select proname from pg_proc where pronamespace = 'public'::regnamespace order by proname");
  for (const name of ['accept_couple_invite', 'create_couple_invite', 'create_profile_for_new_user', 'is_couple_member']) {
    assert(functions.rows.some(row => row.proname === name), `缺少函式 ${name}`);
  }
  passed('4 個應用程式函式均建立成功');

  // 管理員層級的結構與預設值冒煙測試；不執行 1.3 的使用者授權測試。
  await client.query('begin');
  await client.query(await readFile(join(root, 'smoke.sql'), 'utf8'));
  const counts = {};
  for (const table of expected) {
    counts[table] = (await client.query(`select count(*)::int as total from public.${table}`)).rows[0].total;
    assert.equal(counts[table], ['profiles', 'couple_members'].includes(table) ? 2 : 1, `${table} 筆數錯誤`);
  }
  passed('使用者 trigger、UUID 預設值、pgcrypto、關聯資料及所有資料表寫入成功');
  const body = (await client.query('select body from public.diary_entries')).rows[0].body;
  assert.equal(body, '一起記錄今天😊');
  passed('繁體中文及 emoji 以 UTF-8 正確往返');
  await client.query('rollback');
  for (const table of expected) {
    assert.equal((await client.query(`select count(*)::int as total from public.${table}`)).rows[0].total, 0);
  }
  passed('測試資料已 rollback，遷移後資料庫仍為空白');
  await writeFile(join(root, 'result.json'), JSON.stringify({
    status: 'passed', completedAt: new Date().toISOString(), version,
    migration: migrationName, sha256: createHash('sha256').update(migration).digest('hex'),
    checks, smokeCounts: counts,
    scope: '本機真實 PostgreSQL；以最小 Supabase Auth 依賴契約 bootstrap；不包含託管 Auth API、RLS 行為或裝置測試。',
  }, null, 2) + '\n');
  console.log(`完成 ${checks.length} 項檢查；結果：supabase/validation/result.json`);
} finally {
  await client?.end();
  if (started) execute(pg_ctl, ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
  // 清除本機驗證用密碼；保留 ignored 日誌與資料目錄，便於追查失敗。
  await writeFile(passwordFile, '');
}
