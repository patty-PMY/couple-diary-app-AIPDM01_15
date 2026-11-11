import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Heading, Page, Tag } from '../../components/UI';
import { useApp } from '../../context/useApp';
import { Anniversary } from '../../lib/models';
import { countdownDays, nextOccurrence, nextReminder, validateAnniversary } from '../../lib/anniversaries';
import { localDate } from '../../lib/calendar';
import { colors } from '../../lib/theme';
import { SharedDataStatus } from '../../components/SharedDataStatus';
import { EmptyState } from '../../components/Feedback';
import { userMessage } from '../../lib/errors';

export default function DatesScreen() {
  const { anniversaries, coupleId, createAnniversary, updateAnniversary, deleteAnniversary, refresh, refreshing, isPreview, error, reminderNotice } = useApp();
  const [editing, setEditing] = useState<Anniversary | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(localDate(new Date()));
  const [repeats, setRepeats] = useState(true);
  const [remind, setRemind] = useState(false);
  const [operation, setOperation] = useState<'save' | 'delete' | 'refresh' | 'reminder' | null>(null);
  const busy = operation !== null;
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  const items = [...anniversaries].sort((a, b) => nextOccurrence(a.event_date, a.repeats_yearly, now).getTime() - nextOccurrence(b.event_date, b.repeats_yearly, now).getTime());

  function open(item: Anniversary | 'new') {
    setEditing(item); setDeleting(null); setMessage('');
    setTitle(item === 'new' ? '' : item.title);
    setEventDate(item === 'new' ? localDate(new Date()) : item.event_date);
    setRepeats(item === 'new' ? true : item.repeats_yearly);
    setRemind(false);
  }
  async function save() {
    if (busy) return;
    const invalid = validateAnniversary(title, eventDate);
    if (invalid) { setMessage(invalid); return; }
    setOperation('save'); setMessage('');
    try {
      if (editing && editing !== 'new') await updateAnniversary(editing.id, title, eventDate, repeats);
      else await createAnniversary(title, eventDate, repeats, remind);
      setEditing(null); setTitle(''); setNow(new Date());
    } catch (reason) { setMessage(userMessage(reason, '儲存失敗，輸入已保留，請重試。')); }
    finally { setOperation(null); }
  }
  async function remove(itemId: string) {
    setOperation('delete'); setMessage('');
    try { await deleteAnniversary(itemId); setDeleting(null); }
    catch (reason) { setMessage(userMessage(reason, '刪除失敗，請重新整理後重試。')); }
    finally { setOperation(null); }
  }
  async function reload() {
    setOperation('refresh'); setMessage('');
    try { await refresh(); setNow(new Date()); }
    catch { setMessage('無法重新整理，請確認網路後再試。'); }
    finally { setOperation(null); }
  }
  return <Page>
    <Heading eyebrow="MILESTONES" title="重要日子" subtitle="讓值得期待的日子，有一個小小倒數。" />
    <SharedDataStatus />
    <Text style={styles.copy}>開啟每年提醒時，會透過 Expo、Apple／Google 傳送裝置推播 token 與通用提醒文案。紀念日名稱與日期僅在 App 顯示，不包含在推播中；需要網路及通知權限。</Text>
    {isPreview ? <Tag>本機預覽：提醒設定僅示範，不發送通知</Tag> : null}
    {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
    {reminderNotice ? <Text accessibilityRole="alert" style={styles.copy}>{reminderNotice}</Text> : null}
    <Button variant="secondary" disabled={busy || refreshing} loading={operation === 'refresh' || refreshing} onPress={reload}>重新整理日期與提醒</Button>
    {coupleId ? <>
      {editing ? <Card>
        <Heading title={editing === 'new' ? '新增重要日子' : '編輯重要日子'} />
        <Field label="名稱" accessibilityLabel="重要日期名稱" editable={!busy} value={title} onChangeText={setTitle} maxLength={240} />
        <Field label="日期" accessibilityLabel="重要日期" editable={!busy} value={eventDate} onChangeText={setEventDate} placeholder="YYYY-MM-DD" helper="例如 2026-11-22" />
        <Toggle checked={repeats} disabled={busy} onPress={() => setRepeats(!repeats)} title="每年重複" detail="2 月 29 日在非閏年順延到 3 月 1 日。" />
        {editing === 'new' ? <Toggle checked={remind} disabled={busy} onPress={() => setRemind(!remind)} title="提醒我" detail="只為你開啟：前一天上午 9 點。每年提醒使用上方說明的通用推播。" /> : <Text style={styles.copy}>編輯共享日期不會改變任何人的提醒偏好；你的提醒時間會依新日期調整。</Text>}
        <Button disabled={busy} loading={operation === 'save'} onPress={save}>{operation === 'save' ? '儲存中…' : '儲存日期'}</Button>
        <Button variant="secondary" disabled={busy} onPress={() => { setEditing(null); setMessage(''); }}>取消編輯</Button>
      </Card> : <Button disabled={busy} onPress={() => open('new')}>＋ 新增重要日子</Button>}
      {items.map((item) => {
        const occurrence = nextOccurrence(item.event_date, item.repeats_yearly, now);
        const past = !item.repeats_yearly && localDate(occurrence) < localDate(now);
        const days = countdownDays(item.event_date, item.repeats_yearly, now);
        return <Card key={item.id}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.copy}>{item.event_date} · {item.repeats_yearly ? '每年重複' : '不重複'}</Text>
          <Text style={styles.count}>{past ? '日期已過' : days === 0 ? '就是今天' : `還有 ${days} 天`}</Text>
          {item.repeats_yearly ? <Text style={styles.copy}>下次日期：{localDate(occurrence)}</Text> : null}
          <ReminderEditor item={item} disabled={busy} now={now} onBusy={(value) => setOperation(value ? 'reminder' : null)} />
          {deleting === item.id ? <>
            <Text style={styles.copy}>確認刪除「{item.title}」？雙方的此日期提醒也會移除。伴侶裝置將於下次重新整理時同步取消。</Text>
            <Button disabled={busy} loading={operation === 'delete'} onPress={() => remove(item.id)}>確認刪除</Button>
            <Button variant="secondary" disabled={busy} onPress={() => setDeleting(null)}>取消刪除</Button>
          </> : <View style={styles.actions}>
            <Button disabled={busy} variant="secondary" accessibilityLabel={`編輯重要日期：${item.title}`} onPress={() => open(item)}>編輯日期</Button>
            <Button disabled={busy || editing !== null} variant="quiet" accessibilityLabel={`刪除重要日期：${item.title}`} onPress={() => { setDeleting(item.id); setMessage(''); }}>刪除日期</Button>
          </View>}
        </Card>;
      })}
      {!items.length && !refreshing && !error ? <EmptyState title="還沒有重要日子" message="新增第一個日期，讓彼此一起期待。" actionLabel="新增第一個重要日子" disabled={busy} onAction={() => open('new')} /> : null}
    </> : error ? <EmptyState title="重要日期尚未載入" message="請按重新整理重試，或到配對設定確認登入狀態。" /> : !refreshing ? <Card><Text style={styles.title}>先配對，再一起記下</Text><Text style={styles.copy}>完成伴侶配對後，就能共享重要日子。</Text></Card> : null}
  </Page>;
}

function ReminderEditor({ item, disabled, now, onBusy }: { item: Anniversary; disabled: boolean; now: Date; onBusy: (busy: boolean) => void }) {
  const { setAnniversaryReminder, isPreview } = useApp();
  const [days, setDays] = useState(String(item.reminder_days_before));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => setDays(String(item.reminder_days_before)), [item.reminder_days_before]);
  async function save(enabled: boolean) {
    if (busy) return;
    if (enabled && (!/^\d{1,2}$/.test(days) || Number(days) > 30)) { setMessage('請輸入提前 0 至 30 天，0 代表當天。'); return; }
    setBusy(true); onBusy(true); setMessage('');
    try { await setAnniversaryReminder(item.id, enabled, enabled ? Number(days) : item.reminder_days_before); setMessage(enabled ? '已儲存你的提醒設定。' : '已停用你的提醒。'); }
    catch (reason) { setMessage(userMessage(reason, '提醒更新失敗，請確認網路後重試。')); }
    finally { setBusy(false); onBusy(false); }
  }
  const next = nextReminder(item.event_date, item.repeats_yearly, item.reminder_days_before, now);
  return <View style={styles.reminder}>
    <Text style={styles.copy}>你的提醒：{item.reminder_enabled ? `已開啟，提前 ${item.reminder_days_before} 天上午 9 點` : '未開啟'}</Text>
    {item.repeats_yearly ? <Text style={styles.copy}>每年由伺服器依最後登記的裝置時區提醒，不需重新開啟 App。開啟即同意上方的通用推播資料使用方式。</Text> : null}
    {item.reminder_enabled ? <Text style={styles.copy}>{isPreview ? '預覽不排程通知。' : next ? `下次提醒：${localDate(next.date)} 09:00（裝置時區）` : '提醒時間已過，不會補發通知。'}</Text> : null}
    <Field label="提前幾天提醒" accessibilityLabel={`${item.title}的提醒提前天數`} editable={!busy && !disabled} value={days} onChangeText={setDays} keyboardType="number-pad" helper="0 至 30 天；僅變更你的提醒。" />
    <Button disabled={busy || disabled} loading={busy} variant="secondary" onPress={() => save(true)}>{busy ? '更新中…' : item.reminder_enabled ? '儲存我的提醒' : '開啟我的提醒'}</Button>
    {item.reminder_enabled ? <Button disabled={busy || disabled} variant="quiet" onPress={() => save(false)}>停用我的提醒</Button> : null}
    {message ? <Text accessibilityRole="alert" style={styles.copy}>{message}</Text> : null}
  </View>;
}

function Toggle({ checked, disabled, onPress, title, detail }: { checked: boolean; disabled: boolean; onPress: () => void; title: string; detail: string }) {
  return <Pressable disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} accessibilityLabel={title} onPress={onPress} style={styles.toggle}>
    <Text style={styles.check}>{checked ? '☑' : '☐'}</Text><View style={styles.toggleText}><Text style={styles.title}>{title}</Text><Text style={styles.copy}>{detail}</Text></View>
  </Pressable>;
}
const styles = StyleSheet.create({
  title: { color: colors.ink, fontWeight: '700', fontSize: 16 },
  copy: { color: colors.ink, fontSize: 14, lineHeight: 22 },
  count: { color: colors.green, fontSize: 25, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  toggleText: { flex: 1, gap: 4 },
  check: { color: colors.green, fontSize: 24 },
  reminder: { gap: 10, borderTopWidth: 1, borderColor: colors.line, paddingTop: 12 },
});
