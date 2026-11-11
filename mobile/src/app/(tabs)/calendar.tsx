import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Heading, Page, Tag } from '../../components/UI';
import { useApp } from '../../context/useApp';
import { CalendarEvent } from '../../lib/models';
import { eventDateTime, eventInputTime, localDate, parseEventTime } from '../../lib/calendar';
import { isValidIsoDate } from '../../lib/validation';
import { colors } from '../../lib/theme';

const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei';
function defaultTime() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  date.setHours(18, 30, 0, 0);
  return eventInputTime(date.toISOString(), deviceZone);
}

export default function CalendarScreen() {
  const { events, coupleId, createEvent, updateEvent, deleteEvent, refresh, isPreview, session, error } = useApp();
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(defaultTime);
  const [timezone, setTimezone] = useState(deviceZone);
  const [selectedDate, setSelectedDate] = useState(localDate(new Date()));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const validDate = isValidIsoDate(selectedDate);
  const list = useMemo(() => [...events]
    .filter((event) => eventDateTime(event.starts_at, deviceZone).slice(0, 10) === selectedDate)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)), [events, selectedDate]);

  function open(event: CalendarEvent | 'new') {
    setEditing(event); setDeleting(null); setMessage('');
    setTitle(event === 'new' ? '' : event.title);
    setTimezone(event === 'new' ? deviceZone : event.timezone);
    setStartsAt(event === 'new' ? defaultTime() : eventInputTime(event.starts_at, event.timezone));
  }
  async function save() {
    if (busy) return;
    const date = parseEventTime(startsAt, timezone.trim());
    if (!date) { setMessage('請確認日期、時間、UTC 偏移與時區一致，例如 2026-11-12 18:30 +08:00、Asia/Taipei。'); return; }
    setBusy(true); setMessage('');
    try {
      if (editing && editing !== 'new') await updateEvent(editing.id, title, date.toISOString(), timezone.trim());
      else await createEvent(title, date.toISOString(), timezone.trim());
      setSelectedDate(eventDateTime(date.toISOString(), deviceZone).slice(0, 10));
      setEditing(null); setTitle('');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : '儲存失敗，輸入已保留，請重試。'); }
    finally { setBusy(false); }
  }
  async function remove(eventId: string) {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await deleteEvent(eventId); setDeleting(null); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : '刪除失敗，請重試。'); }
    finally { setBusy(false); }
  }
  async function reload() {
    setBusy(true); setMessage('');
    try { await refresh(); } catch { setMessage('重新整理失敗，請確認網路後重試。'); }
    finally { setBusy(false); }
  }

  return <Page>
    <Heading eyebrow="SHARED CALENDAR" title="共用行程" subtitle="看見彼此的安排，讓見面更容易。" />
    {isPreview ? <Tag>本機預覽</Tag> : null}
    <Field label="查看日期" accessibilityLabel="查看行程日期" value={selectedDate} onChangeText={setSelectedDate} placeholder="YYYY-MM-DD" helper={`依裝置時區 ${deviceZone} 篩選。`} />
    {!validDate ? <Text accessibilityRole="alert" style={styles.message}>請輸入有效日期（YYYY-MM-DD）。</Text> : null}
    {message || error ? <Text accessibilityRole="alert" style={styles.message}>{message || error}</Text> : null}
    <Button variant="secondary" disabled={busy} onPress={reload}>{busy ? '處理中…' : '重新整理'}</Button>
    {coupleId ? <>
      {editing ? <Card>
        <Heading title={editing === 'new' ? '新增行程' : '編輯行程'} />
        <Field label="行程名稱" accessibilityLabel="行程名稱" editable={!busy} value={title} onChangeText={setTitle} maxLength={240} />
        <Field label="日期、時間與 UTC 偏移" accessibilityLabel="行程日期時間與 UTC 偏移" editable={!busy} value={startsAt} onChangeText={setStartsAt} helper="YYYY-MM-DD HH:mm +08:00；夏令時間結束時，可用偏移指定重複的小時。" />
        <Field label="行程時區" accessibilityLabel="行程時區" editable={!busy} autoCapitalize="none" value={timezone} onChangeText={setTimezone} helper="例如 Asia/Taipei 或 America/New_York。" />
        <Button disabled={busy} onPress={save}>{busy ? '儲存中…' : '儲存行程'}</Button>
        <Button variant="secondary" disabled={busy} onPress={() => { setEditing(null); setMessage(''); }}>取消編輯</Button>
      </Card> : <Button disabled={busy} onPress={() => open('new')}>＋ 新增行程</Button>}
      {validDate && list.map((event) => <Card key={event.id}>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text style={styles.copy}>{eventDateTime(event.starts_at, event.timezone)} · {event.timezone}</Text>
        <Text style={styles.copy}>建立者：{event.created_by === (session?.user.id ?? 'you') ? '你' : '伴侶'}</Text>
        {event.timezone !== deviceZone ? <Text style={styles.copy}>裝置時間：{eventDateTime(event.starts_at, deviceZone)} · {deviceZone}</Text> : null}
        {deleting === event.id ? <>
          <Text style={styles.copy}>確認刪除「{event.title}」？伴侶也將看不到此行程。</Text>
          <Button disabled={busy} onPress={() => remove(event.id)}>確認刪除</Button>
          <Button variant="secondary" disabled={busy} onPress={() => setDeleting(null)}>取消刪除</Button>
        </> : <View style={styles.actions}>
          <Button variant="secondary" disabled={busy} accessibilityLabel={`編輯行程：${event.title}`} onPress={() => open(event)}>編輯</Button>
          <Button variant="quiet" disabled={busy || editing !== null} accessibilityLabel={`刪除行程：${event.title}`} onPress={() => { setDeleting(event.id); setMessage(''); }}>刪除</Button>
        </View>}
      </Card>)}
      {validDate && !list.length ? <Card><Text style={styles.eventTitle}>這天還沒有行程</Text><Text style={styles.copy}>選擇其他日期，或新增第一個行程。</Text></Card> : null}
    </> : <Card><Text style={styles.eventTitle}>先配對，再一起安排</Text><Text style={styles.copy}>完成伴侶配對後，就能建立共享行程。</Text></Card>}
  </Page>;
}

const styles = StyleSheet.create({
  eventTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  copy: { color: colors.ink, fontSize: 14, lineHeight: 22 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  message: { color: colors.danger, fontSize: 14, lineHeight: 22 },
});
