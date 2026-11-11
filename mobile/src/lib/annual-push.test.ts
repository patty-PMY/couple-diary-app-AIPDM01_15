import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { registerAnnualPushDevice, unregisterAnnualPushDevice } from './annual-push';
import { supabase } from './supabase';

jest.mock('expo-constants', () => ({ __esModule: true, default: { easConfig: { projectId: 'test-project' } } }));
jest.mock('expo-notifications', () => ({ getPermissionsAsync: jest.fn(), getExpoPushTokenAsync: jest.fn(), IosAuthorizationStatus: { PROVISIONAL: 3 } }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }));
jest.mock('./supabase', () => ({ supabase: { auth: { getSession: jest.fn() }, rpc: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: true } as Notifications.NotificationPermissionsStatus);
  jest.mocked(Notifications.getExpoPushTokenAsync).mockResolvedValue({ type: 'expo', data: 'ExpoPushToken[test]' });
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  (supabase!.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  (supabase!.rpc as jest.Mock).mockResolvedValue({ error: null });
});

it('只向 Supabase 註冊裝置 token 與時區，不包含日期內容', async () => {
  await registerAnnualPushDevice('user-1', true);
  expect(supabase!.rpc).toHaveBeenCalledWith('register_reminder_device', { device_token: 'ExpoPushToken[test]', device_timezone: expect.any(String) });
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(expect.any(String), 'ExpoPushToken[test]');
});
it('帳號在取得 token 途中切換時不替舊帳號註冊', async () => {
  (supabase!.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: { user: { id: 'user-2' } } } });
  await expect(registerAnnualPushDevice('user-1', true)).rejects.toThrow('帳號已切換');
  expect(supabase!.rpc).not.toHaveBeenCalled();
});
it('通知權限未開啟時不取得推播 token', async () => {
  jest.mocked(Notifications.getPermissionsAsync).mockResolvedValue({ granted: false } as Notifications.NotificationPermissionsStatus);
  await expect(registerAnnualPushDevice('user-1', true)).rejects.toThrow('通知權限');
  expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
});
it('登出前移除伺服器裝置註冊，失敗時保留 token 以便重試', async () => {
  jest.mocked(SecureStore.getItemAsync).mockResolvedValue('ExpoPushToken[test]');
  (supabase!.rpc as jest.Mock).mockResolvedValueOnce({ error: new Error('offline') });
  await expect(unregisterAnnualPushDevice()).rejects.toThrow('重試登出');
  expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  await unregisterAnnualPushDevice();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
});
it('未明確開啟年度推播前，不自動取得或註冊 token', async () => {
  await expect(registerAnnualPushDevice('user-1')).rejects.toThrow('資料使用說明');
  expect(Notifications.getExpoPushTokenAsync).not.toHaveBeenCalled();
  expect(supabase!.rpc).not.toHaveBeenCalled();
});
