export function userMessage(reason: unknown, fallback = '操作未完成，請稍後重試；輸入內容會保留。') {
  const value = reason && typeof reason === 'object' ? reason as { code?: string; message?: string; name?: string; status?: number } : {};
  const message = typeof value.message === 'string' ? value.message : '';
  const code = value.code ?? '';
  if (/fetch|network|offline|timeout|timed out|abort/i.test(`${message} ${value.name ?? ''}`)) return '連線失敗，請確認網路後重試；輸入內容會保留。';
  if (/storage|quota|disk|SQLITE_FULL/i.test(`${message} ${value.name ?? ''}`)) return '無法存取裝置儲存，請確認儲存空間，或重新開啟 App 後重試。';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) return 'Email 或密碼不正確，請檢查後重新登入。';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) return 'Email 尚未驗證，請先到信箱完成驗證，再回來登入。';
  if (['over_request_rate_limit', 'over_email_send_rate_limit'].includes(code) || value.status === 429) return '操作過於頻繁，請稍候幾分鐘再試，並檢查是否已收到驗證信。';
  if (code === 'user_already_exists') return '此 Email 已有帳號，請改用登入。';
  if (code === 'weak_password') return '密碼強度不足，請使用至少 8 個字元並混合字母與數字。';
  if (code === 'signup_disabled') return '目前暫停註冊，請聯絡測試負責人或先使用本機預覽。';
  if (code === 'email_address_invalid') return 'Email 格式不正確，請檢查後重新輸入。';
  if (code === '42501' || value.status === 401 || /JWT expired|invalid refresh token/i.test(message)) return '登入或配對權限已變更，請重新整理配對狀態；若仍失敗，請重新登入。';
  if (code === '23503' || code === 'PGRST116') return '這筆內容可能已被刪除，請重新整理後確認；目前輸入會保留。';
  if (code === '23514') return '資料未符合欄位規則，請檢查名稱、日期或字數後重試。';
  if (code === '23505') return '這筆資料可能已儲存，請先重新整理確認，避免重複送出。';
  if (/[\u3400-\u9fff]/.test(message)) return message;
  return fallback;
}
