export function characterCount(value: string) {
  return Array.from(value).length;
}

export function validateText(value: string, maximum: number) {
  if (!value.trim()) return '請輸入內容。';
  if (characterCount(value) > maximum) return `內容最多 ${maximum} 字。`;
  return null;
}

export function validateSignup(consent: boolean, adult: boolean, dataRegion: string, retention: string) {
  if (!consent) return '請先同意資料使用說明。';
  if (!adult) return '此測試版僅限年滿 18 歲者使用。';
  if (!dataRegion.trim() || !retention.trim()) return '測試資料區域與保存期間尚未設定。';
  return null;
}

export function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : '請輸入有效 Email。';
}

export function parseLocalDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number);
  const date = new Date(y, m - 1, d, h, min);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d || date.getHours() !== h || date.getMinutes() !== min) return null;
  return date;
}

export function isValidIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function daysUntil(value: string, repeatsYearly: boolean, now = new Date()) {
  const [year, month, day] = value.split('-').map(Number);
  const next = new Date(year, month - 1, day);
  if (repeatsYearly) {
    next.setFullYear(now.getFullYear());
    if (next < new Date(now.getFullYear(), now.getMonth(), now.getDate())) next.setFullYear(now.getFullYear() + 1);
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const date = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  return Math.max(0, Math.ceil((date.getTime() - today.getTime()) / 86400000));
}
