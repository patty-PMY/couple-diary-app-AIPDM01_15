import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Anniversary } from './models';
import { requestReminderPermission, syncReminders } from './reminders';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(), requestPermissionsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(), cancelScheduledNotificationAsync: jest.fn(), scheduleNotificationAsync: jest.fn(), setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { DEFAULT: 3 }, IosAuthorizationStatus: { PROVISIONAL: 3 }, SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const item: Anniversary = { id: 'date-1', couple_id: 'couple-1', created_by: 'user-1', title: '紀念日', event_date: '2026-11-20', repeats_yearly: false, reminder_enabled: true, reminder_days_before: 1, created_at: '2026-11-11T00:00:00Z' };
let scheduled: Notifications.NotificationRequest[];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(new Date(2026, 10, 11, 12));
  scheduled = [];
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: true } as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockImplementation(async () => [...scheduled]);
  jest.mocked(Notifications.cancelScheduledNotificationAsync).mockImplementation(async (identifier) => { scheduled = scheduled.filter((request) => request.identifier !== identifier); });
  jest.mocked(Notifications.scheduleNotificationAsync).mockImplementation(async (request) => {
    scheduled.push(request as Notifications.NotificationRequest);
    return request.identifier!;
  });
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('個人本機提醒同步', () => {
  it('年度日期交由後端派送，不另排本機通知造成重複提醒', async () => {
    await syncReminders('user-1', [{ ...item, repeats_yearly: true }]);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
  it('相同資料不重複排程，編輯後取消舊通知並重新排程', async () => {
    await syncReminders('user-1', [item]);
    await syncReminders('user-1', [item]);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    await syncReminders('user-1', [{ ...item, title: '新名稱', event_date: '2026-11-22' }]);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].content.body).toBe('你有重要日期提醒，開啟 Our Days 查看。');
    expect(scheduled[0].content.body).not.toContain('新名稱');
  });
  it('停用或刪除日期會取消通知，且不影響其他模組', async () => {
    scheduled.push({ identifier: 'other-feature', trigger: null, content: {
      title: null, subtitle: null, body: null, categoryIdentifier: null,
      sound: null, threadIdentifier: null, data: { scope: 'other' },
    } });
    await syncReminders('user-1', [item]);
    await syncReminders('user-1', [{ ...item, reminder_enabled: false }]);
    expect(scheduled.map((request) => request.identifier)).toEqual(['other-feature']);
    await syncReminders('user-1', [item]);
    await syncReminders('user-1', []);
    expect(scheduled.map((request) => request.identifier)).toEqual(['other-feature']);
  });
  it('切換帳號不保留前一帳號提醒，登出會取消此模組通知', async () => {
    await syncReminders('user-1', [item]);
    await syncReminders('user-2', [{ ...item, reminder_days_before: 0 }]);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].content.data?.owner).toBe('user-2');
    await syncReminders(null, []);
    expect(scheduled).toHaveLength(0);
  });
  it('日期尚未載入時保留同帳號通知，但清除其他帳號的通知', async () => {
    await syncReminders('user-1', [item]);
    await syncReminders('user-1', null);
    expect(scheduled).toHaveLength(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    await syncReminders('user-2', null);
    expect(scheduled).toHaveLength(0);
  });
  it('權限被拒時不排程、不主動彈出權限要求，並回傳可行的提示', async () => {
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false } as Notifications.NotificationPermissionsStatus);
    expect(await syncReminders('user-1', [item])).toContain('通知權限未開啟');
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });
  it('排程失敗可重試，不會使後續取消工作失效', async () => {
    jest.mocked(Notifications.scheduleNotificationAsync).mockRejectedValueOnce(new Error('native error'));
    await expect(syncReminders('user-1', [item])).rejects.toThrow('native error');
    await syncReminders('user-1', [item]);
    expect(scheduled).toHaveLength(1);
    await syncReminders(null, []);
    expect(scheduled).toHaveLength(0);
  });
  it('Android 建立通知頻道後才請求權限', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false } as Notifications.NotificationPermissionsStatus);
    jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ granted: true } as Notifications.NotificationPermissionsStatus);
    expect(await requestReminderPermission()).toBe(true);
    expect(Notifications.setNotificationChannelAsync).toHaveBeenCalled();
    expect(jest.mocked(Notifications.setNotificationChannelAsync).mock.invocationCallOrder.at(-1)).toBeLessThan(jest.mocked(Notifications.requestPermissionsAsync).mock.invocationCallOrder.at(-1)!);
  });
  it('同步途中登出不會留下舊帳號剛排入的通知', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    jest.mocked(Notifications.scheduleNotificationAsync).mockImplementationOnce(async (request) => {
      entered(); await pending;
      scheduled.push(request as Notifications.NotificationRequest);
      return request.identifier!;
    });
    const first = syncReminders('user-1', [item]);
    await started;
    const logout = syncReminders(null, []);
    release();
    await Promise.all([first, logout]);
    expect(scheduled).toHaveLength(0);
  });
});
