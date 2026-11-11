import { userMessage } from './errors';

it('將認證與網路錯誤轉為原因及下一步，不顯示後端原文', () => {
  expect(userMessage({ code: 'invalid_credentials' })).toContain('重新登入');
  expect(userMessage({ code: 'email_not_confirmed' })).toContain('完成驗證');
  expect(userMessage(new Error('Network request failed'))).toContain('輸入內容會保留');
  expect(userMessage({ code: '42501', message: 'private table policy details' })).toContain('重新整理配對');
  expect(userMessage({ message: 'internal schema private_notes at line 9' })).not.toContain('private_notes');
});
it('內容已被刪除或可能重複時，先引導確認而非盲目重送', () => {
  expect(userMessage({ code: 'PGRST116' })).toContain('重新整理後確認');
  expect(userMessage({ code: '23505' })).toContain('避免重複送出');
  expect(userMessage(new Error('請先完成伴侶配對。'))).toBe('請先完成伴侶配對。');
});
