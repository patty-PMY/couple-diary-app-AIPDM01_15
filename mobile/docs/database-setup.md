# 資料庫環境設定與 1.2 驗證紀錄

## 開發環境設定

1. 建立獨立的 Supabase 開發專案，記錄實際資料區域。
2. 在 `mobile` 目錄把 `.env.example` 複製為 `.env.local`，填入以下設定。`.env.local` 已加入 Git 忽略規則。

| 變數 | 內容 |
| --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 專案的 HTTPS URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 專案的公開 anon key，不能使用 service_role key |
| `EXPO_PUBLIC_TEST_DATA_REGION` | 此測試專案實際部署的資料區域 |
| `EXPO_PUBLIC_TEST_RETENTION` | 向參與者說明的保存期間與測試結束處理安排 |

3. 確認專案尚未包含本應用程式的資料表。在 Supabase SQL Editor 執行 `supabase/migrations/20261110000000_init_our_days.sql`，以 `BEGIN;` 和 `COMMIT;` 包住整份 SQL，任何錯誤都應回滾並修正後重試。這份初始遷移只套用一次，不能在已有同名資料表的專案重複執行。
4. 在 Table Editor 確認下列 10 張 `public` 資料表均已建立：`profiles`、`couples`、`couple_members`、`couple_invitations`、`calendar_events`、`anniversary_dates`、`anniversary_reminders`、`diary_entries`、`diary_comments`、`mood_entries`。
5. 重新啟動 Expo，讓 `.env.local` 生效。測試資料區域及保存安排未填寫時，註冊保持停用。

Supabase 已提供 `auth.users`、`auth.uid()`、`anon`／`authenticated` 角色與 `extensions` schema。不要把下方本機驗證用的 `bootstrap.sql` 套用到 Supabase。

## 重跑乾淨資料庫套用驗證

本機驗證工具支援 Windows x64、Node.js 22.13 以上版本，不需要系統安裝 PostgreSQL、Docker 或 Supabase 帳號。在 `mobile/supabase/validation` 目錄執行：

```powershell
npm.cmd ci --ignore-scripts
npm.cmd run verify
```

工具會從固定版本的 npm 套件取得真正的 PostgreSQL 二進位檔，每次在系統暫存目錄建立新 cluster，以隨機密碼及可用連接埠啟動，僅監聽 `127.0.0.1`。英文暫存路徑可避免 Windows PostgreSQL 在中文專案路徑下的編碼問題。工具不接受遠端連線參數，不會連到現有專案資料庫。

驗證會先確認 `public` 沒有應用程式資料表，再建立最小的 Supabase 依賴契約：`auth.users` 的外鍵／metadata 欄位、`auth.uid()`、角色和 `extensions` schema。接著以單一交易執行未修改的初始遷移檔。

成功時會更新 `supabase/validation/result.json`，記錄資料庫版本、UTC 時間、遷移 SHA-256 與檢查結果。測試資料全部回滾，連線關閉後停止 PostgreSQL。暫存目錄保留資料檔與 `postgres.log` 供追查，不會安裝 Windows 服務。

## 本次結果

驗證時間：2026-11-10 22:36（Asia/Taipei）。資料庫版本：PostgreSQL 17.11／Windows x64。執行結果：8 項全部通過，程序結束碼為 0。

| 檢查 | 結果 |
| --- | --- |
| 執行前 `public` schema 為空白 | 通過 |
| 初始遷移整份在單一交易成功套用 | 通過 |
| 10 張應用程式資料表全部建立 | 通過 |
| 外鍵及檢查約束均有效 | 通過 |
| 4 個應用程式函式全部建立 | 通過 |
| 使用者 trigger、UUID 預設值、pgcrypto、10 張表的關聯寫入 | 通過 |
| 繁體中文及 emoji 的 UTF-8 讀寫往返 | 通過 |
| 測試資料回滾後，應用程式資料表全為空白 | 通過 |

這是實際 PostgreSQL 的遷移與結構冒煙驗證。最小 Auth 依賴契約只提供遷移需要的資料庫介面，未啟動 Supabase Auth HTTP 服務；託管專案部署、登入端點與使用者權限行為仍須在對應任務驗證。所有寫入使用本機資料庫管理員，因此本次結果不能作為 RLS 授權正確性的證據。

依使用者指示，1.3 保持待辦，等再次指定工作後才進行跨配對權限測試。

## 工具與依賴來源

- [Embedded Postgres 原始碼與使用方式](https://github.com/leinelissen/embedded-postgres)
- [Supabase Auth 初始資料庫結構](https://github.com/supabase/auth/blob/master/migrations/00_init_auth_schema.up.sql)：本機依賴契約依照遷移所需的欄位介面建立，不取代完整 Auth schema。
