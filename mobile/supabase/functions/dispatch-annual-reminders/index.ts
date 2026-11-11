// Edge Function 使用 Deno；核心另以 Node 模擬 HTTP 驗證。
// @ts-ignore Deno 可直接載入此 JavaScript ES module。
import { dispatchAnnualReminders } from './worker.mjs';
declare const Deno: {
  env: { get: (name: string) => string | undefined };
  serve: (handler: (request: Request) => Promise<Response>) => void;
};
Deno.serve((request) => dispatchAnnualReminders(request, {
  url: Deno.env.get('SUPABASE_URL'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  secret: Deno.env.get('REMINDER_DISPATCH_SECRET'),
  expoAccessToken: Deno.env.get('EXPO_ACCESS_TOKEN'),
}));
