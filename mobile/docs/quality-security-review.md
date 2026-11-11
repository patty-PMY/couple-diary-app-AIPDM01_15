# Task 4.3／4.4 檢查紀錄

## 介面與無障礙

- 次要文字由 `#78827A` 改為 `#526257`；主要、次要、綠色文案在目前五種內容背景上皆通過一般文字 4.5:1 對比測試。輸入框邊界通過 3:1。
- 說明文字放大，首頁標題、狀態標籤與區段操作可換行；頁面在 360px 以下使用 16px 左右留白，寬螢幕內容上限 840px。
- 共用按鈕至少 48×48，文字可換行；輸入欄位有名稱及提示，頁面標題提供 heading 語意，首頁連結提供明確目的，日記／留言／心情編輯與刪除包含作者、時間及內容類型。
- 保留系統字體縮放。底部分頁使用可換行的標籤，並依 fontScale 與底部安全區增加高度；避免套件預設單行裁切。表單使用可捲動內容與鍵盤避讓。
- Chrome 的 Expo Web 預覽檢查 320、390、768px：首頁、行程、紀念日、日記、我的，共 15 個組合，DOM 邊界檢查皆無橫向溢出；另目視檢查小螢幕登入、首頁及平板首頁。
- `Accessibility.test.tsx` 在 iOS／Android 模組設定下，檢查 320px／200% 字體、390px、768px 的共用標題、欄位、按鈕忙碌狀態與字體縮放設定；這是語意回歸，不是原生排版引擎測試。

## 存取政策與輸入限制

新增 `20261111060000_input_policy_review.sql`。部署時須先依檔名順序套用既有 migrations，再套用此檔；本次只在隔離本機 PostgreSQL 執行，未部署至託管專案。

- 所有 12 張 public 資料表啟用 RLS。共享內容須登入且屬於恰有兩人的配對；待配對的一人空間不開放共享內容。
- `policy-review.mjs` 執行 522 個政策／輸入案例：兩組配對各兩人、未配對、待配對及匿名，對三個空間的六張共享表逐一執行 SELECT／INSERT／UPDATE／DELETE，檢查實際 rowCount 或 PostgreSQL 權限錯誤。
- 配對雙方可管理共享內容，新增時不能冒用作者；更新不能改寫作者、配對、識別欄位或留言父項。跨配對留言由複合外鍵拒絕。個人提醒只允許本人讀寫，伴侶可建立自己的提醒。
- 提醒政策明確限定父紀念日的 id 及 couple_id；直接寫入配對成員、邀請、個人資料及派送紀錄仍被撤銷。匿名不能呼叫 security-definer 函式；年度派送服務權限與裝置隔離由既有年度提醒測試覆蓋。
- 行程及紀念日名稱在資料庫與前端使用同一組 ECMAScript Unicode 空白判定，先去頭尾空白，再限制 1–120 個 Unicode 字元；直接表寫入與 RPC 均受觸發器保護。測試涵蓋純 Unicode 空白、120／121 個 emoji、帶前後空白的有效名稱。
- 既有資料庫測試一併重跑：日記 500 字、留言 100 字、Unicode 空白、心情列舉、日期／時區／無限值、提醒範圍、邀請到期、並行接受與兩人容量。
- 若伺服器已回報不同配對且新內容讀取失敗，清除舊配對快取；同配對暫時斷線則保留內容並標示非最新。新增 AppProvider 回歸測試。

## 驗證與剩餘範圍

`npm.cmd run typecheck`、`npm.cmd run lint`、12 個 Jest 套件共 88 項測試通過；隔離 PostgreSQL 14 組檢查通過，包含上述 522 個案例，結果記錄於 `supabase/validation/result.json`。

Web 預覽用於版面檢查。真實手機的 VoiceOver／TalkBack、系統放大字體、鍵盤、安全區及通知投遞仍須在 task 5.3 驗收；本次沒有連線正式 Supabase、送出推播、部署或發布程式。

參考：[React Native 無障礙](https://reactnative.dev/docs/accessibility)、[useWindowDimensions](https://reactnative.dev/docs/usewindowdimensions)、[Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/)、[WCAG 文字對比](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)。
