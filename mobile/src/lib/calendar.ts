import { isValidIsoDate } from './validation';

export function localDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function eventDateTime(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

// Reject invalid calendar dates and DST gaps; an explicit offset disambiguates
// the repeated hour when daylight saving time ends.
export function parseEventTime(value: string, timezone: string) {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2}) ([+-])(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match || !isValidIsoDate(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[5]) > 14 || Number(match[6]) > 59 || (Number(match[5]) === 14 && Number(match[6]) !== 0)) return null;
  const date = new Date(`${match[1]}T${match[2]}:${match[3]}:00${match[4]}${match[5]}:${match[6]}`);
  try {
    if (eventDateTime(date.toISOString(), timezone) !== `${match[1]} ${match[2]}:${match[3]}`) return null;
    return date;
  } catch { return null; }
}

export function eventInputTime(value: string, timezone: string) {
  const formatted = eventDateTime(value, timezone);
  const utc = Date.parse(`${formatted.replace(' ', 'T')}:00Z`);
  const instantMinute = Math.floor(new Date(value).getTime() / 60000) * 60000;
  const offset = Math.round((utc - instantMinute) / 60000);
  const absolute = Math.abs(offset);
  return `${formatted} ${offset < 0 ? '-' : '+'}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

export function validateEvent(title: string, startsAt: string, timezone: string) {
  if (!title.trim() || Array.from(title.trim()).length > 120) return '行程名稱需為 1 至 120 字。';
  try {
    if (!Number.isFinite(new Date(startsAt).getTime())) return '請輸入有效的日期時間。';
    eventDateTime(startsAt, timezone);
  } catch { return '請輸入有效的 IANA 時區，例如 Asia/Taipei。'; }
  return null;
}
