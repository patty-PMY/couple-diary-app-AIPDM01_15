import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { supabase } from './supabase';

const TOKEN_KEY = 'our-days-annual-push-token';
const CONSENT_KEY = 'our-days-annual-push-consent-owner';
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(operation: () => Promise<T>): Promise<T> {
  const result = queue.then(operation, operation);
  queue = result.catch(() => undefined);
  return result;
}

export function registerAnnualPushDevice(owner: string, optedIn = false): Promise<void> {
  return serial(async () => {
    if (Platform.OS === 'web' || !supabase) throw new Error('年度提醒需要使用已連線的 iOS 或 Android App。');
    const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || Constants.easConfig?.projectId || Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) throw new Error('年度提醒尚未設定 Expo projectId，請聯絡測試負責人。');
    if (!optedIn && await SecureStore.getItemAsync(CONSENT_KEY) !== owner) throw new Error('請在重要日期頁重新開啟年度提醒，確認通用推播的資料使用說明。');
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.ios?.status !== Notifications.IosAuthorizationStatus.PROVISIONAL) throw new Error('年度提醒需要通知權限，請至系統設定開啟後重試。');
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id !== owner) throw new Error('帳號已切換，請重新設定提醒。');
    const previous = await SecureStore.getItemAsync(TOKEN_KEY);
    const { error } = await supabase.rpc('register_reminder_device', { device_token: token, device_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei' });
    if (error) throw new Error('年度提醒裝置註冊失敗，請確認網路與後端設定後重試。');
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(CONSENT_KEY, owner);
    if (previous && previous !== token) {
      const { error: removeError } = await supabase.rpc('unregister_reminder_device', { device_token: previous });
      if (removeError) throw new Error('清理舊推播 token 失敗，請重新整理後重試。');
    }
  });
}

export function unregisterAnnualPushDevice(): Promise<void> {
  return serial(async () => {
    if (Platform.OS === 'web') return;
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (!token) return;
    if (!supabase) throw new Error('無法移除年度提醒裝置，請恢復連線後重試登出。');
    const { error } = await supabase.rpc('unregister_reminder_device', { device_token: token });
    if (error) throw new Error('移除年度提醒裝置失敗，請確認網路後重試登出。');
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(CONSENT_KEY);
  });
}
