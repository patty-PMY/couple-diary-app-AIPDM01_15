# Our Days

供情侶共享日記與生活記錄的 iOS／Android 跨平台應用程式。

## 本機設定

1. 安裝 Node.js 22.13 以上版本。
2. 在本目錄執行 `npm ci` 安裝應用程式依賴。
3. 將 `.env.example` 複製為 `.env.local`，填寫 Supabase 專案 URL、公開 anon key、測試資料區域及保存安排。請勿在 App 放入 service_role key；資料使用說明未完整設定前，註冊會保持停用。
4. 依 [資料庫環境設定與驗證紀錄](docs/database-setup.md) 套用遷移，並確認 [測試版參與者說明](docs/participant-notice.md)。
5. 執行 `npx expo start`，使用 iOS 或 Android 開發用戶端開啟。可散佈的測試版請使用 Expo development build。

未設定 Supabase 時，可以進入本機預覽模式；資料僅存於裝置，不會與伴侶同步。

## 資料庫驗證

在 `supabase/validation` 目錄執行 `npm ci --ignore-scripts`，再執行 `npm run verify`，會以獨立的本機 PostgreSQL 驗證乾淨資料庫的初始遷移。工具支援 Windows x64，詳細範圍與結果見 [資料庫驗證紀錄](docs/database-setup.md)。

## 隱私與權限

遷移包含以配對為範圍的 RLS 政策；其實際授權行為尚待任務 1.3 驗證。service_role key 僅可存放於可信任的伺服器。本測試版只供受邀成年使用者參加，尚未提供自助刪除帳號功能；招募前須確認參與者說明、資料區域與保存／刪除安排。

## 建置

內部裝置測試使用 `npx eas-cli@latest build --profile development --platform all`；預覽散佈使用 `npx eas-cli@latest build --profile preview --platform all`。建置需要 Expo 帳號與平台簽章憑證。
