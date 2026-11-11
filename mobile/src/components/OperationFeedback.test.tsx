import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import CalendarScreen from '../app/(tabs)/calendar';
import DatesScreen from '../app/(tabs)/dates';
import type { AppContextValue } from '../context/AppContext';

let mockApp: AppContextValue;
jest.mock('../context/useApp', () => ({ useApp: () => mockApp }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

describe.each(['ios', 'android'] as const)('%s 重要操作狀態回饋', (platform) => {
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', platform);
    mockApp = { coupleId: 'couple-1', events: [], anniversaries: [], refreshing: false, error: null,
      refresh: jest.fn().mockResolvedValue(undefined), createEvent: jest.fn().mockResolvedValue(undefined), createAnniversary: jest.fn().mockResolvedValue(undefined),
    } as unknown as AppContextValue;
  });
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['行程', CalendarScreen, '這天還沒有行程', '新增這天的行程', '行程名稱'],
    ['重要日期', DatesScreen, '還沒有重要日子', '新增第一個重要日子', '重要日期名稱'],
  ] as const)('%s 的載入、失敗和空資料互不混淆，空狀態可直接新增', async (_name, Component, emptyTitle, action, field) => {
    mockApp.refreshing = true;
    const view = await render(<Component />);
    expect(screen.getByRole('progressbar', { name: '正在更新共享內容…' })).toBeTruthy();
    expect(screen.queryByText(emptyTitle)).toBeNull();
    mockApp.refreshing = false; mockApp.error = '暫時無法連線，請確認網路後重試。';
    await view.rerender(<Component />);
    expect(screen.getByText('目前保留上次載入的內容，可能不是最新版本。請確認網路後重新整理。')).toBeTruthy();
    expect(screen.queryByText(emptyTitle)).toBeNull();
    mockApp.error = null;
    await view.rerender(<Component />);
    expect(screen.getByText(emptyTitle)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: action }));
    expect(screen.getByLabelText(field)).toBeTruthy();
  });

  it('行程儲存失敗說明原因、保留表單並能重試', async () => {
    (mockApp.createEvent as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));
    await render(<CalendarScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '＋ 新增行程' }));
    await fireEvent.changeText(screen.getByLabelText('行程名稱'), '一起吃晚餐');
    await fireEvent.press(screen.getByRole('button', { name: '儲存行程' }));
    expect(screen.getByText('連線失敗，請確認網路後重試；輸入內容會保留。')).toBeTruthy();
    expect(screen.getByLabelText('行程名稱').props.value).toBe('一起吃晚餐');
    await fireEvent.press(screen.getByRole('button', { name: '儲存行程' }));
    expect(mockApp.createEvent).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('行程名稱')).toBeNull();
  });

  it('日期儲存失敗保留內容，服務恢復後可重試', async () => {
    (mockApp.createAnniversary as jest.Mock).mockRejectedValueOnce(new Error('Network request failed'));
    await render(<DatesScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '＋ 新增重要日子' }));
    await fireEvent.changeText(screen.getByLabelText('重要日期名稱'), '紀念日');
    await fireEvent.press(screen.getByRole('button', { name: '儲存日期' }));
    expect(screen.getByText('連線失敗，請確認網路後重試；輸入內容會保留。')).toBeTruthy();
    expect(screen.getByLabelText('重要日期名稱').props.value).toBe('紀念日');
    await fireEvent.press(screen.getByRole('button', { name: '儲存日期' }));
    expect(mockApp.createAnniversary).toHaveBeenCalledTimes(2);
    expect(screen.queryByLabelText('重要日期名稱')).toBeNull();
  });
});
