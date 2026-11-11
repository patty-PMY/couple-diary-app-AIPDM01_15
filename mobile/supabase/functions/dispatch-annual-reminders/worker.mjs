const EXPO = 'https://exp.host/--/api/v2/push';

// 經使用者明確選擇：只傳裝置 token 與通用文案，不傳紀念日名稱或日期。
export async function dispatchAnnualReminders(request, settings, fetcher = fetch) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!settings.url || !settings.serviceKey || !settings.secret || settings.secret.length < 32) return new Response('Dispatcher is not configured', { status: 503 });
  if (request.headers.get('authorization') !== `Bearer ${settings.secret}`) return new Response('Unauthorized', { status: 401 });
  const headers = { apikey: settings.serviceKey, Authorization: `Bearer ${settings.serviceKey}`, 'Content-Type': 'application/json' };
  const expoHeaders = { 'Content-Type': 'application/json', ...(settings.expoAccessToken ? { Authorization: `Bearer ${settings.expoAccessToken}` } : {}) };
  async function database(path, body, method = 'POST') {
    const response = await fetcher(`${settings.url}/rest/v1/${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Database request failed');
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  async function expo(path, body) {
    const response = await fetcher(`${EXPO}/${path}`, { method: 'POST', headers: expoHeaders, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Expo request failed');
    return response.json();
  }
  async function disableDevice(token) {
    await database(`reminder_devices?push_token=eq.${encodeURIComponent(token)}`, undefined, 'DELETE');
  }
  try {
    const receiptBefore = new Date(Date.now() - 15 * 60000).toISOString();
    const receipts = await database(`annual_reminder_deliveries?status=eq.sent&receipt_checked=eq.false&sent_at=lt.${receiptBefore}&ticket_id=not.is.null&select=id,ticket_id,reminder_devices(push_token)&limit=100`, undefined, 'GET');
    if (receipts?.length) {
      const result = await expo('getReceipts', { ids: receipts.map((item) => item.ticket_id) });
      for (const item of receipts) {
        const receipt = result.data?.[item.ticket_id];
        if (!receipt) continue;
        if (receipt.details?.error === 'DeviceNotRegistered') await disableDevice(item.reminder_devices.push_token);
        else await database(`annual_reminder_deliveries?id=eq.${item.id}`, { receipt_checked: true, last_error: receipt.status === 'error' ? receipt.details?.error ?? 'receipt_error' : null }, 'PATCH');
      }
    }
    const claimed = await database('rpc/claim_annual_reminders', {});
    if (!claimed?.length) return Response.json({ accepted: 0 });
    const active = await database(`annual_reminder_deliveries?id=in.(${claimed.map((item) => item.delivery_id).join(',')})&status=eq.sending&select=id,lease_id`, undefined, 'GET');
    const rows = claimed.filter((row) => active.some((item) => item.id === row.delivery_id && item.lease_id === row.lease));
    if (!rows.length) return Response.json({ accepted: 0 });
    let tickets;
    try {
      const result = await expo('send', rows.map((row) => ({
        to: row.push_token, title: '重要日期提醒', body: '你有重要日期提醒，開啟 Our Days 查看。',
        channelId: 'anniversaries', ttl: 3600,
        data: { scope: 'our-days-annual-push' },
      })));
      tickets = result.data;
      if (!Array.isArray(tickets) || tickets.length !== rows.length) throw new Error('Invalid Expo tickets');
    } catch {
      for (const row of rows) await database('rpc/finish_annual_reminder', { delivery: row.delivery_id, delivery_lease: row.lease, expo_ticket: null, failure: 'transport_error', permanent: false });
      return new Response('Push service unavailable; retry scheduled', { status: 502 });
    }
    let accepted = 0;
    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const ticket = tickets[index];
      const code = ticket.details?.error ?? 'ticket_error';
      if (ticket.status === 'error' && code === 'DeviceNotRegistered') { await disableDevice(row.push_token); continue; }
      const success = ticket.status === 'ok' && typeof ticket.id === 'string';
      await database('rpc/finish_annual_reminder', { delivery: row.delivery_id, delivery_lease: row.lease, expo_ticket: success ? ticket.id : null, failure: success ? null : code, permanent: ['MessageTooBig', 'InvalidCredentials', 'MismatchSenderId'].includes(code) });
      if (success) accepted++;
    }
    return Response.json({ accepted });
  } catch {
    return new Response('Dispatcher failed; retry on next schedule', { status: 500 });
  }
}
