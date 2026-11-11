# 共享行程

## 使用方式

- 在「共用行程」輸入 `YYYY-MM-DD` 查看日期；清單依裝置時區篩選並依時間排序。
- 新增或編輯時，輸入名稱、日期時間與 UTC 偏移，以及 IANA 時區。例如 `2026-11-12 18:30 +08:00` 和 `Asia/Taipei`。偏移必須與該日期的時區一致，夏令時間開始時不存在的時間會被拒絕。
- 清單顯示行程時區、時間及原建立者；行程時區與裝置不同時，同時顯示裝置時間。
- 配對雙方可編輯及刪除行程。刪除需要確認；編輯不會改寫原建立者。儲存失敗時保留編輯內容。
- 點選「重新整理」取得伴侶的最新行程。本機預覽只儲存在此裝置。

## 資料庫更新

在測試用 Supabase 資料庫依序套用既有遷移後，套用 `supabase/migrations/20261111020000_calendar_management.sql`。本次僅在隔離 PostgreSQL 驗證，尚未部署至託管 Supabase。

新遷移允許配對伴侶更新行程，並以 trigger 禁止變更行程 ID、所屬配對、原建立者及建立時間。建立時仍要求 `created_by = auth.uid()`，跨配對讀寫維持由 RLS 拒絕。

新增與更新行程皆驗證時區及有效時間，拒絕未知時區與 PostgreSQL 的無限時間值。編輯欄位精確至分鐘，原有秒數與毫秒不影響 UTC 偏移計算。

## 已完成的驗證

- `npm.cmd run typecheck`：通過。
- `npm.cmd run lint`：結束碼 0。
- `npm.cmd test -- --watch=false`：3 個測試套件、15 項測試通過，包含跨日顯示、時區偏移、含秒數的時間、夏令時間空缺及重複小時。
- 在 `supabase/validation` 執行 `node verify.mjs`：10 項檢查通過，包含伴侶更新與刪除、原建立者不可變更、錯誤時區拒絕，以及其他配對不可讀取、更新或刪除行程。結果見 `supabase/validation/result.json`。

## 尚待裝置驗收

本次未完成 iOS／Android 介面驗收、託管 Supabase 同步或實機通知驗證。工作區未提供 `.env.local`／`.env`，目前命令環境也未找到 `adb` 或 `emulator`。

後續請依 `.env.example` 在本機設定測試用公開 Supabase 連線資訊與參與者說明，並準備 iOS／Android 開發用戶端。勿將 service_role 金鑰放入行動應用程式。裝置驗收時，以兩個已配對帳號確認新增、重新整理、互相編輯及刪除，另以其他配對確認隔離。
