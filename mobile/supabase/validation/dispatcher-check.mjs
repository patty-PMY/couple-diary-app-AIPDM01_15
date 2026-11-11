import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchAnnualReminders } from '../functions/dispatch-annual-reminders/worker.mjs';

const settings = { url: 'https://test.invalid', serviceKey: 'fake-service-key', secret: 'x'.repeat(40), expoAccessToken: 'fake-expo-access' };
const request = () => new Request('https://worker.invalid', { method: 'POST', headers: { authorization: `Bearer ${settings.secret}` } });
const row = { delivery_id: '00000000-0000-4000-8000-000000000001', lease: '00000000-0000-4000-8000-000000000002', push_token: 'ExpoPushToken[test]', title: '不得外傳的名稱', occurrence: '2030-12-31' };

function transport({ ticket, failPush = false, cancelled = false, receipts = [] } = {}) {
  const calls = [];
  const fetcher = async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ url, ...options, body });
    if (url.includes('/getReceipts')) return Response.json({ data: { expiredTicket: { status: 'error', details: { error: 'DeviceNotRegistered' } } } });
    if (url.includes('/push/send')) {
      if (failPush) return new Response('unavailable', { status: 503 });
      return Response.json({ data: [ticket ?? { status: 'ok', id: 'expo-ticket' }] });
    }
    if (url.includes('rpc/claim_annual_reminders')) return Response.json([row]);
    if (url.includes('status=eq.sent')) return Response.json(receipts);
    if (url.includes('status=eq.sending')) return Response.json(cancelled ? [] : [{ id: row.delivery_id, lease_id: row.lease }]);
    return new Response(null, { status: 204 });
  };
  return { calls, fetcher };
}

test('拒絕無排程密鑰的請求，且不呼叫任何服務', async () => {
  let called = false;
  const response = await dispatchAnnualReminders(new Request('https://worker.invalid', { method: 'POST' }), settings, async () => { called = true; });
  assert.equal(response.status, 401);
  assert.equal(called, false);
});
test('僅將裝置 token 與通用文案傳給 Expo；服務金鑰不外流', async () => {
  const { calls, fetcher } = transport();
  const response = await dispatchAnnualReminders(request(), settings, fetcher);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: 1 });
  const push = calls.find((call) => call.url.endsWith('/push/send'));
  assert.deepEqual(push.body, [{ to: row.push_token, title: '重要日期提醒', body: '你有重要日期提醒，開啟 Our Days 查看。', channelId: 'anniversaries', ttl: 3600, data: { scope: 'our-days-annual-push' } }]);
  assert.equal(push.headers.Authorization, 'Bearer fake-expo-access');
  assert(!JSON.stringify(push).includes(settings.serviceKey));
  assert(!JSON.stringify(push).includes(settings.secret));
  assert(!JSON.stringify(push).includes(row.title));
  assert(!JSON.stringify(push).includes(row.occurrence));
  assert(calls.some((call) => call.url.endsWith('/rpc/finish_annual_reminder') && call.body.expo_ticket === 'expo-ticket'));
});
test('傳輸失敗會釋放 lease 並安排重試', async () => {
  const { calls, fetcher } = transport({ failPush: true });
  assert.equal((await dispatchAnnualReminders(request(), settings, fetcher)).status, 502);
  const finish = calls.find((call) => call.url.endsWith('/rpc/finish_annual_reminder'));
  assert.equal(finish.body.failure, 'transport_error');
  assert.equal(finish.body.permanent, false);
  assert.equal(finish.body.delivery_lease, row.lease);
});
test('派送前取消的工作不呼叫 Expo', async () => {
  const { calls, fetcher } = transport({ cancelled: true });
  assert.equal((await dispatchAnnualReminders(request(), settings, fetcher)).status, 200);
  assert(!calls.some((call) => call.url.endsWith('/push/send')));
});
test('Expo 回報無效裝置 token 時移除裝置，避免持續重試', async () => {
  const { calls, fetcher } = transport({ ticket: { status: 'error', details: { error: 'DeviceNotRegistered' } } });
  await dispatchAnnualReminders(request(), settings, fetcher);
  assert(calls.some((call) => call.method === 'DELETE' && call.url.includes('/reminder_devices?')));
});
test('查核推播 receipt 後移除已失效裝置', async () => {
  const { calls, fetcher } = transport({ receipts: [{ id: row.delivery_id, ticket_id: 'expiredTicket', reminder_devices: { push_token: 'ExpoPushToken[expired]' } }] });
  await dispatchAnnualReminders(request(), settings, fetcher);
  assert(calls.some((call) => call.url.endsWith('/getReceipts')));
  assert(calls.some((call) => call.method === 'DELETE' && call.url.includes('expired')));
});
