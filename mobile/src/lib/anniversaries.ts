import { characterCount, isValidIsoDate } from './validation';

export function validateAnniversary(title: string, eventDate: string) {
  if (!title.trim() || characterCount(title.trim()) > 120) return '名稱需為 1 至 120 字。';
  if (!isValidIsoDate(eventDate) || eventDate !== eventDate.trim()) return '請輸入有效日期（YYYY-MM-DD）。';
  return null;
}

export function nextOccurrence(value: string, repeatsYearly: boolean, now = new Date()) {
  const [year, month, day] = value.split('-').map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!repeatsYearly) return new Date(year, month - 1, day);
  // 與既有倒數一致：2/29 在非閏年順延至 3/1。
  const occurrence = new Date(now.getFullYear(), month - 1, day);
  return occurrence < today ? new Date(now.getFullYear() + 1, month - 1, day) : occurrence;
}

export function countdownDays(value: string, repeatsYearly: boolean, now = new Date()) {
  const occurrence = nextOccurrence(value, repeatsYearly, now);
  // 使用日曆日期差，避免夏令時間造成一天不是 24 小時。
  return Math.max(0, Math.round((Date.UTC(occurrence.getFullYear(), occurrence.getMonth(), occurrence.getDate())
    - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000));
}

export function nextReminder(value: string, repeatsYearly: boolean, daysBefore: number, now = new Date()) {
  const occurrence = nextOccurrence(value, repeatsYearly, now);
  let reminder = new Date(occurrence.getFullYear(), occurrence.getMonth(), occurrence.getDate() - daysBefore, 9);
  if (reminder <= now && repeatsYearly) {
    const [, month, day] = value.split('-').map(Number);
    const next = new Date(occurrence.getFullYear() + 1, month - 1, day);
    reminder = new Date(next.getFullYear(), next.getMonth(), next.getDate() - daysBefore, 9);
    return { date: reminder, occurrence: next };
  }
  return reminder > now ? { date: reminder, occurrence } : null;
}
