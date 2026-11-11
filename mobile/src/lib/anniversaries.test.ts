import { countdownDays, nextOccurrence, nextReminder, validateAnniversary } from './anniversaries';
import { localDate } from './calendar';

describe('重要日期與倒數', () => {
  it('驗證名稱、有效日曆日期及 Unicode 長度', () => {
    expect(validateAnniversary('  ', '2026-11-11')).toBeTruthy();
    expect(validateAnniversary('紀念日', '2026-02-29')).toBeTruthy();
    expect(validateAnniversary('💛'.repeat(120), '2024-02-29')).toBeNull();
    expect(validateAnniversary('💛'.repeat(121), '2024-02-29')).toBeTruthy();
  });
  it('當天倒數為零，過期的每年日期移至明年', () => {
    const now = new Date(2026, 10, 11, 17);
    expect(countdownDays('2020-11-11', true, now)).toBe(0);
    expect(localDate(nextOccurrence('2020-11-10', true, now))).toBe('2027-11-10');
    expect(countdownDays('2026-11-10', false, now)).toBe(0);
    expect(countdownDays('2027-01-01', true, new Date(2026, 11, 31))).toBe(1);
  });
  it('閏日於非閏年順延 3/1，下一個閏年仍回到 2/29', () => {
    expect(localDate(nextOccurrence('2024-02-29', true, new Date(2026, 1, 28)))).toBe('2026-03-01');
    expect(localDate(nextOccurrence('2024-02-29', true, new Date(2027, 11, 31)))).toBe('2028-02-29');
  });
  it('以日曆日計算夏令時間交界', () => {
    expect(countdownDays('2026-11-02', false, new Date(2026, 9, 31, 12))).toBe(2);
    expect(countdownDays('2026-03-09', false, new Date(2026, 2, 7, 12))).toBe(2);
  });
  it('提醒依當地上午 9 點計算，跨年仍通知正確發生日期', () => {
    const next = nextReminder('2020-01-01', true, 1, new Date(2026, 11, 20));
    expect(localDate(next!.date)).toBe('2026-12-31');
    expect(next!.date.getHours()).toBe(9);
    expect(localDate(next!.occurrence)).toBe('2027-01-01');
  });
  it('不補發已過期通知，重複日期可安排下一年', () => {
    expect(nextReminder('2026-11-12', false, 1, new Date(2026, 10, 11, 10))).toBeNull();
    expect(localDate(nextReminder('2020-11-12', true, 1, new Date(2026, 10, 11, 10))!.date)).toBe('2027-11-11');
    expect(localDate(nextReminder('2026-11-11', false, 0, new Date(2026, 10, 11, 8))!.date)).toBe('2026-11-11');
  });
});
