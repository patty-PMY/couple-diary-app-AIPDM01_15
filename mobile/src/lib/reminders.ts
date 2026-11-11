import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Anniversary } from './models';
import { nextReminder } from './anniversaries';
import { localDate } from './calendar';

const SCOPE = 'our-days-anniversary';
const CHANNEL = 'anniversaries';
let revision = 0;
let queue: Promise<unknown> = Promise.resolve();

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function requestReminderPermission() {
  if (Platform.OS === 'web') return false;
  if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: '重要日期提醒', importance: Notifications.AndroidImportance.DEFAULT,
  });
  const existing = await Notifications.getPermissionsAsync();
  const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
  return permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

// 串行同步並使舊工作失效，避免切換帳號時重新排入上一位使用者的通知。
export function syncReminders(owner: string | null, items: Anniversary[] | null): Promise<string | null> {
  const version = ++revision;
  const current = () => revision === version;
  const run = async (): Promise<string | null> => {
    if (Platform.OS === 'web') return owner && items?.some((item) => item.reminder_enabled) ? '網頁無法排程本機提醒；請使用 iOS 或 Android App。' : null;
    if (!current()) return null;
    const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((request) => request.content.data?.scope === SCOPE);
    if (!current()) return null;
    // 日期尚在載入或網路暫時失敗時，保留同帳號已排好的通知。
    if (items === null) {
      for (const request of scheduled) {
        if (!current()) return null;
        if (!owner || request.content.data?.owner !== owner) await Notifications.cancelScheduledNotificationAsync(request.identifier);
      }
      return null;
    }
    const permission = owner ? await Notifications.getPermissionsAsync() : null;
    if (!current()) return null;
    const allowed = permission?.granted || permission?.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    const enabled = owner ? items.filter((item) => item.reminder_enabled) : [];
    const desired = new Map<string, { item: Anniversary; date: Date; occurrence: Date; signature: string }>();
    if (allowed) for (const item of enabled.filter((entry) => !entry.repeats_yearly)) {
      const next = nextReminder(item.event_date, item.repeats_yearly, item.reminder_days_before);
      if (!next) continue;
      const identifier = `${SCOPE}:${owner}:${item.id}`;
      const signature = JSON.stringify([item.title, next.date.getTime(), localDate(next.occurrence), Intl.DateTimeFormat().resolvedOptions().timeZone]);
      desired.set(identifier, { item, ...next, signature });
    }
    const kept = new Set<string>();
    for (const request of scheduled) {
      if (!current()) return null;
      if (desired.get(request.identifier)?.signature === request.content.data?.signature) kept.add(request.identifier);
      else await Notifications.cancelScheduledNotificationAsync(request.identifier);
    }
    if (owner && enabled.length && !allowed) return '通知權限未開啟，倒數仍可使用。請在系統設定允許通知後重新整理。';
    if (Platform.OS === 'android' && desired.size) await Notifications.setNotificationChannelAsync(CHANNEL, { name: '重要日期提醒', importance: Notifications.AndroidImportance.DEFAULT });
    for (const [identifier, reminder] of desired) {
      if (!current()) return null;
      if (kept.has(identifier)) continue;
      const notificationId = await Notifications.scheduleNotificationAsync({
        identifier,
        content: { title: '重要日期提醒', body: '你有重要日期提醒，開啟 Our Days 查看。', data: { scope: SCOPE, owner, anniversaryId: reminder.item.id, signature: reminder.signature } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminder.date, channelId: CHANNEL },
      });
      if (!current()) await Notifications.cancelScheduledNotificationAsync(notificationId);
    }
    return null;
  };
  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}
