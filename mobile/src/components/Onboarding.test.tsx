import React from 'react';
import { Platform, Share } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import WelcomeScreen from '../app/index';
import PairScreen from '../app/pair';
import type { AppContextValue } from '../context/AppContext';

let mockApp: AppContextValue;
jest.mock('../context/useApp', () => ({ useApp: () => mockApp }));
jest.mock('expo-router', () => ({ router: { replace: jest.fn() }, Redirect: jest.fn(() => null) }));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

function resetApp() {
  mockApp = {
    ready: true, session: null, isPreview: false, configured: true, noticeConfigured: true,
    pairingStatus: 'unpaired', testDataRegion: '測試區域', testRetention: '測試結束後 30 天刪除', error: null,
    signUp: jest.fn().mockResolvedValue('verify_email'), signIn: jest.fn().mockResolvedValue(undefined),
    enterPreview: jest.fn().mockResolvedValue(undefined), createInvite: jest.fn().mockResolvedValue('ab'.repeat(24)),
    acceptInvite: jest.fn().mockResolvedValue(undefined), refresh: jest.fn().mockResolvedValue(undefined), signOut: jest.fn().mockResolvedValue(undefined),
  } as unknown as AppContextValue;
}
async function signupForm() {
  await fireEvent.press(screen.getByRole('tab', { name: '建立帳號' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: '我確認已年滿 18 歲' }));
  await fireEvent.press(screen.getByRole('checkbox', { name: '我已閱讀並同意以上資料使用說明' }));
  await fireEvent.press(screen.getByRole('button', { name: '同意並繼續' }));
}
async function credentials() {
  await fireEvent.changeText(screen.getByLabelText('Email'), 'person@example.com');
  await fireEvent.changeText(screen.getByLabelText('密碼'), 'strong-password');
}

describe.each(['ios', 'android'] as const)('%s 註冊與配對引導', (platform) => {
  beforeEach(() => { jest.clearAllMocks(); resetApp(); jest.replaceProperty(Platform, 'OS', platform); });
  afterEach(() => jest.restoreAllMocks());

  it('先閱讀資料說明並確認成年與同意，才收集註冊資料，亦可撤回返回', async () => {
    await render(<WelcomeScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: '建立帳號' }));
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.getByText(/保存安排：測試結束後 30 天刪除/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: '我確認已年滿 18 歲' }));
    await fireEvent.press(screen.getByRole('button', { name: '同意並繼續' }));
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(mockApp.signUp).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('checkbox', { name: '我已閱讀並同意以上資料使用說明' }));
    await fireEvent.press(screen.getByRole('button', { name: '同意並繼續' }));
    await credentials();
    await fireEvent.press(screen.getByRole('button', { name: '返回資料使用說明' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '我已閱讀並同意以上資料使用說明' }));
    await fireEvent.press(screen.getByRole('button', { name: '同意並繼續' }));
    expect(screen.queryByLabelText('Email')).toBeNull();
  });
  it('資料保存說明尚未設定時不開放註冊欄位', async () => {
    mockApp.noticeConfigured = false;
    await render(<WelcomeScreen />);
    await fireEvent.press(screen.getByRole('tab', { name: '建立帳號' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '我確認已年滿 18 歲' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: '我已閱讀並同意以上資料使用說明' }));
    await fireEvent.press(screen.getByRole('button', { name: '同意並繼續' }));
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(screen.getByText(/尚未填妥資料區域與保存安排/)).toBeTruthy();
  });
  it('註冊成功後明確引導 Email 驗證，再回登入', async () => {
    await render(<WelcomeScreen />); await signupForm(); await credentials();
    await fireEvent.press(screen.getByRole('button', { name: '建立帳號' }));
    expect(mockApp.signUp).toHaveBeenCalledWith('person@example.com', 'strong-password', { adultConfirmed: true, consentAccepted: true });
    expect(screen.getByText('3. 完成 Email 驗證')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '已完成驗證，前往登入' }));
    expect(screen.getByLabelText('Email').props.value).toBe('person@example.com');
    expect(screen.getByLabelText('密碼').props.value).toBe('');
  });
  it('未驗證 Email 的登入錯誤可理解，且保留輸入重試', async () => {
    (mockApp.signIn as jest.Mock).mockRejectedValueOnce({ code: 'email_not_confirmed', message: 'Email not confirmed' });
    await render(<WelcomeScreen />); await credentials();
    await fireEvent.press(screen.getByRole('button', { name: '登入' }));
    expect(screen.getByText(/Email 尚未驗證/)).toBeTruthy();
    expect(screen.getByLabelText('密碼').props.value).toBe('strong-password');
    await fireEvent.press(screen.getByRole('button', { name: '登入' }));
    expect(mockApp.signIn).toHaveBeenCalledTimes(2);
  });
  it('已登入但未配對直接進入配對引導', async () => {
    mockApp.session = { user: { id: 'user-1' } } as AppContextValue['session'];
    await render(<WelcomeScreen />);
    expect(router.replace).toHaveBeenCalledWith('/pair');
  });
  it('建立邀請後顯示代碼與下一步，取消分享不使代碼失效', async () => {
    mockApp.session = { user: { id: 'user-1' } } as AppContextValue['session'];
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction, activityType: undefined });
    await render(<PairScreen />);
    expect(screen.getByText('伴侶已邀請我')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '建立邀請碼' }));
    expect(screen.getByText('ab'.repeat(24))).toBeTruthy();
    expect(screen.getByText(/請分享給伴侶，等待對方接受/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: '分享邀請碼' }));
    expect(screen.getByText(/已取消分享，邀請碼仍可使用/)).toBeTruthy();
  });
  it('邀請格式錯誤先提示，服務拒絕時保留代碼', async () => {
    mockApp.session = { user: { id: 'user-1' } } as AppContextValue['session'];
    (mockApp.acceptInvite as jest.Mock).mockRejectedValueOnce(new Error('邀請碼無效、已過期或已使用，請伴侶重新產生邀請碼。'));
    await render(<PairScreen />);
    await fireEvent.changeText(screen.getByLabelText('邀請碼'), 'short');
    await fireEvent.press(screen.getByRole('button', { name: '接受邀請' }));
    expect(mockApp.acceptInvite).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('邀請碼'), 'ab'.repeat(24));
    await fireEvent.press(screen.getByRole('button', { name: '接受邀請' }));
    expect(screen.getByText(/請伴侶重新產生邀請碼/)).toBeTruthy();
    expect(screen.getByLabelText('邀請碼').props.value).toBe('ab'.repeat(24));
  });
  it('區分等待伴侶與配對成功，成功後才提供進入共享空間按鈕', async () => {
    mockApp.session = { user: { id: 'user-1' } } as AppContextValue['session'];
    mockApp.pairingStatus = 'pending';
    const view = await render(<PairScreen />);
    expect(screen.getByText('2／3 等待伴侶')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '接受邀請' })).toBeNull();
    expect(screen.queryByRole('button', { name: '開始一起記錄' })).toBeNull();
    mockApp.pairingStatus = 'paired';
    await view.rerender(<PairScreen />);
    await fireEvent.press(screen.getByRole('button', { name: '開始一起記錄' }));
    expect(router.replace).toHaveBeenCalledWith('/(tabs)');
  });
});
