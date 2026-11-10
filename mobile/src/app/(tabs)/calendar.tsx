import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Heading, Page, Tag } from '../../components/UI';
import { useApp } from '../../context/useApp';
import { colors } from '../../lib/theme';
import { parseLocalDateTime } from '../../lib/validation';

function defaultTime() { const date = new Date(Date.now() + 86400000); date.setHours(18, 30, 0, 0); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; }
function format(value: string) { return new Date(value).toLocaleString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }); }

export default function CalendarScreen() {
  const { events, coupleId, createEvent, isPreview } = useApp();
  const [adding, setAdding] = useState(false); const [title, setTitle] = useState(''); const [startsAt, setStartsAt] = useState(defaultTime()); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const list = useMemo(() => [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [events]);
  async function save() {
    const date = parseLocalDateTime(startsAt);
    if (!title.trim() || !date) { setMessage('請輸入行程名稱及有效的日期時間。'); return; }
    setBusy(true); setMessage('');
    try { await createEvent(title, date.toISOString()); setTitle(''); setStartsAt(defaultTime()); setAdding(false); }
    catch (error) { setMessage(error instanceof Error ? error.message : '儲存失敗，請保留內容後重試。'); }
    finally { setBusy(false); }
  }
  return <Page>
    <Heading eyebrow="SHARED CALENDAR" title="共用行程" subtitle="看見彼此的安排，讓見面更容易。" />
    <View style={styles.toolbar}><Text style={styles.month}>{new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' })}</Text>{isPreview ? <Tag>本機預覽</Tag> : null}</View>
    {adding ? <Card><Heading title="新增行程" subtitle="先記下時間，細節也可以之後再聊。" /><Field label="行程名稱" value={title} onChangeText={setTitle} placeholder="例如：一起吃晚餐" maxLength={120} /><Field label="日期與時間" value={startsAt} onChangeText={setStartsAt} placeholder="YYYY-MM-DD HH:mm" helper="使用 24 小時制，例如 2026-11-12 18:30" /><Actions onCancel={() => { setAdding(false); setMessage(''); }} onSave={save} busy={busy} message={message} /></Card> : coupleId ? <Button onPress={() => setAdding(true)}>＋ 新增行程</Button> : <Card><Text style={styles.emptyTitle}>先配對，再一起安排</Text><Text style={styles.emptyCopy}>完成伴侶配對後，就能建立共享行程。</Text></Card>}
    {list.length ? <View style={{ gap: 11 }}>{list.map((event, index) => <Card key={event.id} style={styles.eventCard}><View style={styles.dateBadge}><Text style={styles.dateDay}>{new Date(event.starts_at).getDate()}</Text><Text style={styles.dateMonth}>{new Date(event.starts_at).toLocaleDateString('zh-TW', { month: 'short' })}</Text></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventTime}>{format(event.starts_at)}</Text></View><Text style={styles.eventDot}>{index % 2 ? '🌼' : '🌿'}</Text></Card>)}</View> : coupleId && !adding ? <Card style={styles.empty}><Text style={styles.emptyEmoji}>🗓️</Text><Text style={styles.emptyTitle}>這裡還很空</Text><Text style={styles.emptyCopy}>新增第一個行程，開始一起計畫。</Text></Card> : null}
  </Page>;
}

function Actions({ onCancel, onSave, busy, message }: { onCancel: () => void; onSave: () => void; busy: boolean; message: string }) {
  return <View style={{ gap: 9 }}>{message ? <Text style={styles.message}>{message}</Text> : null}<View style={styles.actions}><View style={{ flex: 1 }}><Button variant="secondary" onPress={onCancel}>取消</Button></View><View style={{ flex: 1 }}><Button onPress={onSave} disabled={busy}>{busy ? '儲存中…' : '儲存行程'}</Button></View></View></View>;
}
const styles = StyleSheet.create({ toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, month: { color: colors.ink, fontSize: 16, fontWeight: '700' }, eventCard: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15 }, dateBadge: { width: 52, height: 56, borderRadius: 16, backgroundColor: colors.peach, alignItems: 'center', justifyContent: 'center' }, dateDay: { color: colors.ink, fontSize: 20, fontWeight: '800' }, dateMonth: { color: colors.ink, fontSize: 11, fontWeight: '600' }, eventTitle: { color: colors.ink, fontSize: 15, fontWeight: '700' }, eventTime: { color: colors.muted, fontSize: 12 }, eventDot: { fontSize: 20 }, empty: { alignItems: 'center', paddingVertical: 28 }, emptyEmoji: { fontSize: 34 }, emptyTitle: { color: colors.ink, fontWeight: '700', fontSize: 16 }, emptyCopy: { color: colors.muted, fontSize: 13, textAlign: 'center' }, actions: { flexDirection: 'row', gap: 9 }, message: { color: colors.danger, fontSize: 12 }, });
