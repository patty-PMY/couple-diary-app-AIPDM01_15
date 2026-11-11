export type PairingStatus = 'loading' | 'unpaired' | 'pending' | 'paired' | 'error';

export function pairingError(reason: unknown): string {
  const message = typeof reason === 'object' && reason !== null && 'message' in reason
    ? String(reason.message) : '';
  if (/Authentication required|JWT|session/i.test(message)) return '登入已失效，請重新登入。';
  if (/already belongs/i.test(message)) return '你已建立邀請或完成配對，無法加入另一組。請重新整理配對狀態。';
  if (/two members/i.test(message)) return '這組配對已有兩名成員，無法再加入。';
  if (/own invitation/i.test(message)) return '無法接受自己建立的邀請，請將邀請碼分享給伴侶。';
  if (/invitation/i.test(message)) return '邀請碼無效、已過期或已使用，請伴侶重新產生邀請碼。';
  if (/fetch|network/i.test(message)) return '連線失敗，請確認網路後重試。';
  return '目前無法完成操作，請稍後重試。';
}

export function validateInvite(token: string): string | null {
  return /^[0-9a-f]{48}$/.test(token.trim()) ? null : '請貼上完整的 48 字元邀請碼。';
}
