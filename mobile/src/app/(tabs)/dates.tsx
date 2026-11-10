import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Heading, Page, Tag } from '../../components/UI';
import { useApp } from '../../context/useApp';
import { colors } from '../../lib/theme';
import { daysUntil, isValidIsoDate } from '../../lib/validation';

function dateString(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }

export default function DatesScreen() {
  const { anniversaries, coupleId, createAnniversary, isPreview } = useApp();
  const [adding, setAdding] = useState(false); const [title, setTitle] = useState(''); const [eventDate, setEventDate] = useState(dateString(new Date(Date.now() + 7 * 86400000)));
  const [repeats, setRepeats] = useState(true); const [remind, setRemind] = useState(true); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  async function save() {
    if (!title.trim() || !isValidIsoDate(eventDate)) { setMessage('請輸入名稱及有效日期（YYYY-MM-DD）。'); return; }
    setBusy(true); setMessage('');
    try { await createAnniversary(title, eventDate, repeats, remind); setTitle(''); setEventDate(dateString(new Date(Date.now() + 7 * 86400000))); setAdding(false); }
    catch (error) { setMessage(error instanceof Error ? error.message : '儲存失敗，請稍後再試。'); }
    finally { setBusy(false); }
  }
  const items = [...anniversaries].sort((a, b) => daysUntil(a.event_date, a.repeats_yearly) - daysUntil(b.event_date, b.repeats_yearly));
  return <Page>
    <Heading eyebrow="MILESTONES" title="重要日子" subtitle="讓值得期待的日子，有一個小小倒數。" />
    {items.length ? <Card style={styles.feature}><Text style={styles.featureEmoji}>💌</Text><View style={{ flex: 1 }}><Text style={styles.featureLabel}>最近的約定</Text><Text style={styles.featureTitle}>{items[0].title}</Text></View><View style={styles.count}><Text style={styles.countNum}>{daysUntil(items[0].event_date, items[0].repeats_yearly)}</Text><Text style={styles.countLabel}>天</Text></View></Card> : null}
    {adding ? <Card><Heading title="新增重要日子" subtitle="紀念日、生日，或下次見面的日子。" /><Field label="名稱" value={title} onChangeText={setTitle} placeholder="例如：第一次見面的日子" maxLength={120} /><Field label="日期" value={eventDate} onChangeText={setEventDate} placeholder="YYYY-MM-DD" helper="使用西元年月日，例如 2026-11-22" />
      <Toggle checked={repeats} onPress={() => setRepeats(!repeats)} title="每年重複" detail="適用於生日或週年紀念日。" /><Toggle checked={remind} onPress={() => setRemind(!remind)} title="提醒我" detail="在日期前一天上午 9 點提醒。" />
      {message ? <Text style={styles.message}>{message}</Text> : null}<View style={styles.actions}><View style={{ flex: 1 }}><Button variant="secondary" onPress={() => setAdding(false)}>取消</Button></View><View style={{ flex: 1 }}><Button disabled={busy} onPress={save}>{busy ? '儲存中…' : '儲存日期'}</Button></View></View>
    </Card> : coupleId ? <Button onPress={() => setAdding(true)}>＋ 新增重要日子</Button> : <Card><Text style={styles.emptyTitle}>先配對，再一起記下</Text><Text style={styles.emptyCopy}>完成伴侶配對後，就能共享重要日子。</Text></Card>}
    {items.length ? <View style={{ gap: 10 }}>{items.map((item, index) => <Card key={item.id} style={styles.dateCard}><View style={[styles.dateIcon, index % 2 ? styles.iconGreen : styles.iconPeach]}><Text style={{ fontSize: 21 }}>{index % 2 ? '🌷' : '💛'}</Text></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.itemTitle}>{item.title}</Text><Text style={styles.itemDate}>{item.event_date}{item.repeats_yearly ? ' · 每年' : ''}</Text><Text style={styles.itemDate}>{item.reminder_enabled ? '🔔 已設定提醒' : '未設定提醒'}</Text></View><View style={styles.miniCount}><Text style={styles.miniNum}>{daysUntil(item.event_date, item.repeats_yearly)}</Text><Text style={styles.itemDate}>天後</Text></View></Card>)}</View> : coupleId && !adding ? <Card style={styles.empty}><Text style={{ fontSize: 34 }}>💛</Text><Text style={styles.emptyTitle}>還沒有重要日子</Text><Text style={styles.emptyCopy}>新增第一個日期，讓彼此一起期待。</Text></Card> : null}
    {isPreview ? <Tag>預覽資料儲存在此裝置</Tag> : null}
  </Page>;
}

function Toggle({ checked, onPress, title, detail }: { checked: boolean; onPress: () => void; title: string; detail: string }) {
  return <Pressable onPress={onPress} style={styles.toggle}><View style={[styles.checkbox, checked && styles.checked]}><Text style={{ color: 'white', fontWeight: '700' }}>{checked ? '✓' : ''}</Text></View><View style={{ flex: 1, gap: 2 }}><Text style={styles.itemTitle}>{title}</Text><Text style={styles.itemDate}>{detail}</Text></View></Pressable>;
}
const styles = StyleSheet.create({ feature: { backgroundColor: colors.green, borderColor: colors.green, flexDirection: 'row', alignItems: 'center', gap: 12 }, featureEmoji: { fontSize: 26 }, featureLabel: { color: '#D9E8DF', fontSize: 12 }, featureTitle: { color: 'white', fontSize: 16, fontWeight: '700', marginTop: 3 }, count: { alignItems: 'center', minWidth: 45 }, countNum: { fontSize: 27, fontWeight: '800', color: 'white' }, countLabel: { color: '#D9E8DF', fontSize: 11 }, dateCard: { flexDirection: 'row', alignItems: 'center', gap: 12 }, dateIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, iconPeach: { backgroundColor: colors.peach }, iconGreen: { backgroundColor: colors.greenLight }, itemTitle: { color: colors.ink, fontWeight: '700', fontSize: 14 }, itemDate: { color: colors.muted, fontSize: 11 }, miniCount: { alignItems: 'center', paddingLeft: 8 }, miniNum: { fontSize: 22, color: colors.green, fontWeight: '800' }, toggle: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }, checkbox: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, checked: { backgroundColor: colors.green, borderColor: colors.green }, actions: { flexDirection: 'row', gap: 9 }, message: { color: colors.danger, fontSize: 12 }, empty: { alignItems: 'center', paddingVertical: 25 }, emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' }, emptyCopy: { color: colors.muted, fontSize: 13, textAlign: 'center' }, });
