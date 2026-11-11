import { eventDateTime, eventInputTime, parseEventTime, validateEvent } from './calendar';

describe('行程日期與時區', () => {
  it('依時區顯示跨日時間', () => {
    expect(eventDateTime('2026-11-11T23:30:00Z', 'Asia/Taipei')).toBe('2026-11-12 07:30');
    expect(eventDateTime('2026-11-11T23:30:00Z', 'America/New_York')).toBe('2026-11-11 18:30');
  });
  it('保留時區與偏移，編輯不會改變時間點', () => {
    const input = eventInputTime('2026-11-11T10:30:00Z', 'Asia/Taipei');
    expect(input).toBe('2026-11-11 18:30 +08:00');
    expect(parseEventTime(input, 'Asia/Taipei')?.toISOString()).toBe('2026-11-11T10:30:00.000Z');
  });
  it('有秒數或毫秒的行程仍使用正確的時區偏移', () => {
    const input = eventInputTime('2026-11-11T10:30:59.999Z', 'Asia/Taipei');
    expect(input).toBe('2026-11-11 18:30 +08:00');
    expect(parseEventTime(input, 'Asia/Taipei')?.toISOString()).toBe('2026-11-11T10:30:00.000Z');
    expect(eventInputTime('2026-11-11T10:30:59.999Z', 'America/New_York')).toBe('2026-11-11 05:30 -05:00');
  });
  it('拒絕無效日期、時區、不一致的偏移及夏令時間空缺', () => {
    expect(parseEventTime('2026-02-30 18:30 +08:00', 'Asia/Taipei')).toBeNull();
    expect(parseEventTime('2026-11-11 18:30 +09:00', 'Asia/Taipei')).toBeNull();
    expect(parseEventTime('2026-11-11 18:30 +08:00', 'Invalid/Zone')).toBeNull();
    expect(parseEventTime('2026-03-08 02:30 -05:00', 'America/New_York')).toBeNull();
  });
  it('區分夏令時間結束時重複的小時', () => {
    expect(parseEventTime('2026-11-01 01:30 -04:00', 'America/New_York')?.toISOString()).toBe('2026-11-01T05:30:00.000Z');
    expect(parseEventTime('2026-11-01 01:30 -05:00', 'America/New_York')?.toISOString()).toBe('2026-11-01T06:30:00.000Z');
  });
  it('驗證標題字數、有效時間及時區', () => {
    expect(validateEvent(' ', '2026-11-11T10:30:00Z', 'Asia/Taipei')).toBeTruthy();
    expect(validateEvent('約會', 'invalid', 'Asia/Taipei')).toBeTruthy();
    expect(validateEvent('約會', '2026-11-11T10:30:00Z', 'Invalid/Zone')).toBeTruthy();
    expect(validateEvent('💛'.repeat(120), '2026-11-11T10:30:00Z', 'Asia/Taipei')).toBeNull();
  });
});
