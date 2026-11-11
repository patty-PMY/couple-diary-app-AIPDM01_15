import React, { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppProvider } from './AppContext';
import { useApp } from './useApp';
import { supabase } from '../lib/supabase';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: {
  auth: { getSession: jest.fn(), onAuthStateChange: jest.fn(), signUp: jest.fn(), signInWithPassword: jest.fn() },
  rpc: jest.fn(), from: jest.fn(),
} }));
jest.mock('../lib/reminders', () => ({ syncReminders: jest.fn().mockResolvedValue(null), requestReminderPermission: jest.fn() }));
jest.mock('../lib/annual-push', () => ({ registerAnnualPushDevice: jest.fn(), unregisterAnnualPushDevice: jest.fn() }));

const session = { user: { id: 'user-1' } };
const event = { id: 'event-1', couple_id: 'couple-1', created_by: 'user-1', title: '原有行程', starts_at: '2026-11-12T10:00:00Z', ends_at: null, timezone: 'Asia/Taipei', created_at: '2026-11-11T00:00:00Z' };
let readError: unknown = null;
function Wrapper({ children }: PropsWithChildren) { return <AppProvider>{children}</AppProvider>; }

beforeEach(async () => {
  jest.clearAllMocks(); readError = null; await AsyncStorage.clear();
  (supabase!.auth.getSession as jest.Mock).mockResolvedValue({ data: { session }, error: null });
  (supabase!.auth.onAuthStateChange as jest.Mock).mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
  (supabase!.rpc as jest.Mock).mockImplementation(() => ({ maybeSingle: async () => ({ data: { couple_id: 'couple-1', member_count: 2 }, error: null }) }));
  (supabase!.from as jest.Mock).mockImplementation((table: string) => {
    const response = () => ({ data: table === 'calendar_events' ? [event] : [], error: readError });
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'insert', 'update', 'delete']) chain[method] = jest.fn(() => chain);
    chain.single = jest.fn(async () => ({ data: { ...event, id: 'saved-event', title: '新增行程' }, error: null }));
    chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(response()).then(resolve, reject);
    return chain;
  });
});

it('初次讀取失敗不是空清單，重試成功才顯示已配對內容', async () => {
  readError = new Error('Network request failed');
  const { result } = await renderHook(useApp, { wrapper: Wrapper });
  await waitFor(() => expect(result.current.pairingStatus).toBe('error'));
  expect(result.current.error).toContain('確認網路');
  expect(result.current.coupleId).toBeNull();
  expect(result.current.refreshing).toBe(false);
  readError = null;
  await act(() => result.current.refresh());
  expect(result.current.pairingStatus).toBe('paired');
  expect(result.current.error).toBeNull();
});
it('重新整理失敗保留同帳號已載入的資料與配對狀態', async () => {
  const { result } = await renderHook(useApp, { wrapper: Wrapper });
  await waitFor(() => expect(result.current.pairingStatus).toBe('paired'));
  readError = new Error('Network request failed');
  await act(async () => { await result.current.refresh().catch(() => undefined); });
  expect(result.current.events).toEqual([event]);
  expect(result.current.coupleId).toBe('couple-1');
  expect(result.current.pairingStatus).toBe('paired');
  expect(result.current.error).toContain('確認網路');
  expect(result.current.refreshing).toBe(false);
});
it('伺服器回報配對已變更後，載入失敗不能顯示舊配對快取', async () => {
  const { result } = await renderHook(useApp, { wrapper: Wrapper });
  await waitFor(() => expect(result.current.pairingStatus).toBe('paired'));
  (supabase!.rpc as jest.Mock).mockImplementationOnce(() => ({ maybeSingle: async () => ({ data: { couple_id: 'couple-2', member_count: 2 }, error: null }) }));
  readError = new Error('Network request failed');
  await act(async () => { await result.current.refresh().catch(() => undefined); });
  expect(result.current.coupleId).toBeNull();
  expect(result.current.events).toEqual([]);
  expect(result.current.pairingStatus).toBe('error');
});
it('儲存行程成功後直接使用伺服器回傳資料，不因另一次讀取失敗而重複發布', async () => {
  const { result } = await renderHook(useApp, { wrapper: Wrapper });
  await waitFor(() => expect(result.current.pairingStatus).toBe('paired'));
  const before = (supabase!.rpc as jest.Mock).mock.calls.length;
  readError = new Error('Network request failed');
  await act(() => result.current.createEvent('新增行程', '2026-11-13T10:00:00Z', 'Asia/Taipei'));
  expect(result.current.events.some((item) => item.id === 'saved-event')).toBe(true);
  expect((supabase!.rpc as jest.Mock).mock.calls).toHaveLength(before);
});
it('本機預覽載入失敗不先切換身分或導向共享空間', async () => {
  (supabase!.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null }, error: null });
  const { result } = await renderHook(useApp, { wrapper: Wrapper });
  await waitFor(() => expect(result.current.ready).toBe(true));
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('storage unavailable'));
  await act(async () => { await expect(result.current.enterPreview()).rejects.toThrow('storage unavailable'); });
  expect(result.current.isPreview).toBe(false);
  expect(result.current.coupleId).toBeNull();
});
it('登入狀態讀取失敗提供重試，成功後恢復內容載入', async () => {
  (supabase!.auth.getSession as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));
  const { result } = await renderHook(useApp, { wrapper: Wrapper });
  await waitFor(() => expect(result.current.ready).toBe(true));
  expect(result.current.error).toContain('確認網路');
  await act(() => result.current.retrySession());
  await waitFor(() => expect(result.current.pairingStatus).toBe('paired'));
  expect(result.current.session?.user.id).toBe('user-1');
  expect(result.current.error).toBeNull();
});
it('預覽重新整理失敗保留內容，重試成功會清除錯誤提示', async () => {
  (supabase!.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null }, error: null });
  const { result } = await renderHook(useApp, { wrapper: Wrapper });
  await waitFor(() => expect(result.current.ready).toBe(true));
  await act(() => result.current.enterPreview());
  const diaries = result.current.diaries;
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('storage unavailable'));
  await act(async () => { await result.current.refresh().catch(() => undefined); });
  expect(result.current.error).toContain('裝置儲存');
  expect(result.current.diaries).toEqual(diaries);
  await act(() => result.current.refresh());
  expect(result.current.error).toBeNull();
});
it('儲存使舊重新整理失效後，載入指示仍會結束且不覆寫新資料', async () => {
  const { result } = await renderHook(useApp, { wrapper: Wrapper });
  await waitFor(() => expect(result.current.pairingStatus).toBe('paired'));
  let release!: (value: unknown) => void;
  const membership = new Promise((resolve) => { release = resolve; });
  (supabase!.rpc as jest.Mock).mockImplementationOnce(() => ({ maybeSingle: () => membership }));
  let refreshing!: Promise<void>;
  await act(() => { refreshing = result.current.refresh(); });
  expect(result.current.refreshing).toBe(true);
  await act(() => result.current.createEvent('新增行程', '2026-11-13T10:00:00Z', 'Asia/Taipei'));
  await act(async () => { release({ data: { couple_id: 'couple-1', member_count: 2 }, error: null }); await refreshing; });
  expect(result.current.refreshing).toBe(false);
  expect(result.current.events.some((item) => item.id === 'saved-event')).toBe(true);
});
