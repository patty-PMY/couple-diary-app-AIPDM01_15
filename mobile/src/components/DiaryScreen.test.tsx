import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DiaryScreen from '../app/(tabs)/diary';
import { AppProvider } from '../context/AppContext';
import { useApp } from '../context/useApp';
import { Button } from './UI';

// 完整流程包含多次非同步原生元件渲染，預留冷啟動時間。
jest.setTimeout(15000);

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);
jest.mock('../lib/supabase', () => ({ supabase: null, isSupabaseConfigured: false }));
jest.mock('../lib/reminders', () => ({ syncReminders: jest.fn().mockResolvedValue(null), requestReminderPermission: jest.fn().mockResolvedValue(false) }));
jest.mock('../lib/annual-push', () => ({ registerAnnualPushDevice: jest.fn().mockResolvedValue(undefined), unregisterAnnualPushDevice: jest.fn().mockResolvedValue(undefined) }));

function Harness() {
  const { enterPreview } = useApp();
  return <><Button onPress={enterPreview}>進入測試預覽</Button><DiaryScreen /></>;
}
async function open() {
  await render(<AppProvider><Harness /></AppProvider>);
  await fireEvent.press(screen.getByRole('button', { name: '進入測試預覽' }));
}
function diaryCard(body: string) {
  return screen.getAllByTestId(/^diary-/).find((node) => within(node).queryByText(body))!;
}

describe.each(['ios', 'android'] as const)('%s 日記介面互動', (platform) => {
  beforeEach(async () => { jest.replaceProperty(Platform, 'OS', platform); await AsyncStorage.clear(); });
  afterEach(() => jest.restoreAllMocks());

  it('完成日記、留言及心情的發布、編輯、確認刪除與重新載入', async () => {
    await open();
    const body = '今天一起散步，想把這份心情記下來。';
    await fireEvent.changeText(screen.getByLabelText('日記內容'), body);
    await fireEvent.press(screen.getByRole('button', { name: '發布日記' }));
    expect(screen.getByText(body)).toBeTruthy();
    expect(screen.getByLabelText('日記內容').props.value).toBe('');
    await fireEvent.press(within(diaryCard(body)).getByRole('button', { name: /^編輯/ }));
    const edited = '今天一起散步，也一起吃了晚餐。';
    await fireEvent.changeText(screen.getByLabelText('編輯日記內容'), edited);
    await fireEvent.press(screen.getByRole('button', { name: '儲存日記' }));
    expect(screen.getByText(edited)).toBeTruthy();
    await fireEvent.changeText(within(diaryCard(edited)).getByLabelText('留言內容'), '下次再一起去！');
    await fireEvent.press(within(diaryCard(edited)).getByRole('button', { name: '送出留言' }));
    const comment = screen.getAllByTestId(/^comment-/).find((node) => within(node).queryByText('下次再一起去！'))!;
    await fireEvent.press(within(comment).getByRole('button', { name: /^編輯/ }));
    await fireEvent.changeText(screen.getByLabelText('編輯留言內容'), '下週再一起去！');
    await fireEvent.press(screen.getByRole('button', { name: '儲存留言' }));
    expect(screen.getByText('下週再一起去！')).toBeTruthy();
    const editedComment = screen.getAllByTestId(/^comment-/).find((node) => within(node).queryByText('下週再一起去！'))!;
    await fireEvent.press(within(editedComment).getByRole('button', { name: /^刪除/ }));
    await fireEvent.press(screen.getByRole('button', { name: '確認刪除' }));
    expect(screen.queryByText('下週再一起去！')).toBeNull();
    await fireEvent.changeText(within(diaryCard(edited)).getByLabelText('留言內容'), '下週再一起去！');
    await fireEvent.press(within(diaryCard(edited)).getByRole('button', { name: '送出留言' }));
    const originalMoods = screen.getAllByTestId(/^mood-/).length;
    await fireEvent.press(screen.getByRole('radio', { name: '心情：平靜' }));
    expect(screen.getAllByTestId(/^mood-/)).toHaveLength(originalMoods);
    await fireEvent.press(screen.getByRole('button', { name: '確認記錄心情' }));
    const mood = screen.getAllByTestId(/^mood-/).find((node) => within(node).queryByText('😌 平靜'))!;
    await fireEvent.press(within(mood).getByRole('button', { name: /^編輯/ }));
    await fireEvent.press(within(mood).getByRole('radio', { name: '心情：疲憊' }));
    await fireEvent.press(screen.getByRole('button', { name: '儲存心情' }));
    const updatedMood = screen.getAllByTestId(/^mood-/).find((node) => within(node).queryByText('😴 疲憊'))!;
    await fireEvent.press(within(updatedMood).getByRole('button', { name: /^刪除/ }));
    await fireEvent.press(screen.getByRole('button', { name: '確認刪除' }));
    expect(screen.queryByText('😴 疲憊')).toBeNull();
    await fireEvent.press(within(diaryCard(edited)).getAllByRole('button', { name: /^刪除/ })[0]);
    await fireEvent.press(screen.getByRole('button', { name: '取消刪除' }));
    expect(screen.getByText(edited)).toBeTruthy();
    await fireEvent.press(within(diaryCard(edited)).getAllByRole('button', { name: /^刪除/ })[0]);
    await fireEvent.press(screen.getByRole('button', { name: '確認刪除' }));
    await fireEvent.press(screen.getByRole('button', { name: '重新整理日記' }));
    expect(screen.queryByText(edited)).toBeNull();
    expect(screen.queryByText('下週再一起去！')).toBeNull();
    const saved = JSON.parse((await AsyncStorage.getItem('our-days-preview-data-v1'))!);
    expect(saved.diaries).toHaveLength(1);
    expect(saved.comments).toHaveLength(1);
    expect(saved.moods).toHaveLength(1);
  });

  it('保留超限輸入，並接受 500 個 emoji 日記及 100 個 emoji 留言', async () => {
    await open();
    const over = '😊'.repeat(501);
    await fireEvent.changeText(screen.getByLabelText('日記內容'), over);
    await fireEvent.press(screen.getByRole('button', { name: '發布日記' }));
    expect(screen.getByText('內容最多 500 字。')).toBeTruthy();
    expect(screen.getByLabelText('日記內容').props.value).toBe(over);
    const body = '😊'.repeat(500);
    await fireEvent.changeText(screen.getByLabelText('日記內容'), body);
    await fireEvent.press(screen.getByRole('button', { name: '發布日記' }));
    expect(screen.getByText(body)).toBeTruthy();
    await fireEvent.changeText(within(diaryCard(body)).getByLabelText('留言內容'), '💛'.repeat(101));
    await fireEvent.press(within(diaryCard(body)).getByRole('button', { name: '送出留言' }));
    expect(screen.getByText('內容最多 100 字。')).toBeTruthy();
    expect(within(diaryCard(body)).getByLabelText('留言內容').props.value).toBe('💛'.repeat(101));
    await fireEvent.changeText(within(diaryCard(body)).getByLabelText('留言內容'), '💛'.repeat(100));
    await fireEvent.press(within(diaryCard(body)).getByRole('button', { name: '送出留言' }));
    expect(screen.getByText('💛'.repeat(100))).toBeTruthy();
  });

  it('儲存失敗不顯示為已發布，保留輸入並允許重試', async () => {
    await open();
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('儲存失敗，請重試。'));
    await fireEvent.changeText(screen.getByLabelText('日記內容'), '失敗後仍要保留的內容');
    await fireEvent.press(screen.getByRole('button', { name: '發布日記' }));
    expect(screen.getByText('儲存失敗，請重試。')).toBeTruthy();
    expect(screen.queryByText('失敗後仍要保留的內容')).toBeNull();
    expect(screen.getByLabelText('日記內容').props.value).toBe('失敗後仍要保留的內容');
    await fireEvent.press(screen.getByRole('button', { name: '發布日記' }));
    expect(screen.getByText('失敗後仍要保留的內容')).toBeTruthy();
  });

  it('尚未配對時不提供共享內容或發布入口', async () => {
    await render(<AppProvider><Harness /></AppProvider>);
    expect(screen.getByText('先完成伴侶配對')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '發布日記' })).toBeNull();
    expect(screen.queryByRole('button', { name: '確認記錄心情' })).toBeNull();
  });
  it('留言儲存失敗保留輸入，重試成功後才清空', async () => {
    await open();
    const input = screen.getByLabelText('留言內容');
    await fireEvent.changeText(input, '待重試的留言');
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('留言儲存失敗'));
    await fireEvent.press(screen.getByRole('button', { name: '送出留言' }));
    expect(screen.getByLabelText('留言內容').props.value).toBe('待重試的留言');
    expect(screen.queryByText('待重試的留言')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: '送出留言' }));
    expect(screen.getByText('待重試的留言')).toBeTruthy();
    expect(screen.getByLabelText('留言內容').props.value).toBe('');
  });
  it('不發布僅有 Unicode 空白的日記或留言', async () => {
    await open();
    const before = await AsyncStorage.getItem('our-days-preview-data-v1');
    await fireEvent.changeText(screen.getByLabelText('日記內容'), '\u00a0\u3000\t\n');
    await fireEvent.press(screen.getByRole('button', { name: '發布日記' }));
    expect(screen.getAllByText('請輸入內容。')).toHaveLength(1);
    await fireEvent.changeText(screen.getByLabelText('留言內容'), '\u00a0\u3000\t\n');
    await fireEvent.press(screen.getByRole('button', { name: '送出留言' }));
    expect(screen.getAllByText('請輸入內容。')).toHaveLength(2);
    expect(await AsyncStorage.getItem('our-days-preview-data-v1')).toBe(before);
  });
});
