import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Heading, Page, Tag } from '../../components/UI';
import { JournalEditor } from '../../components/JournalEditor';
import { useApp } from '../../context/useApp';
import { MoodEntry, moodOptions } from '../../lib/models';
import { colors } from '../../lib/theme';

type Selection = { kind: 'diary' | 'comment' | 'mood'; id: string } | null;
function dateLabel(value: string) { return new Date(value).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }

export default function DiaryScreen() {
  const app = useApp();
  const { diaries, comments, moods, coupleId, session, isPreview } = app;
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<Selection>(null);
  const [deleting, setDeleting] = useState<Selection>(null);
  const [selectedMood, setSelectedMood] = useState<MoodEntry['mood'] | null>(null);
  const author = (createdBy: string) => createdBy === (session?.user.id ?? 'you') ? '你' : '伴侶';
  const sorted = [...diaries].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const sortedMoods = [...moods].sort((a, b) => b.created_at.localeCompare(a.created_at));

  async function run(action: () => Promise<void>, success: string) {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setMessage('');
    try { await action(); setMessage(success); return true; }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : '操作失敗，輸入內容已保留，請重試。'); return false; }
    finally { locked.current = false; setBusy(false); }
  }
  async function remove() {
    if (!deleting) return;
    const selected = deleting;
    const action = selected.kind === 'diary' ? () => app.deleteDiary(selected.id) : selected.kind === 'comment' ? () => app.deleteComment(selected.id) : () => app.deleteMood(selected.id);
    if (await run(action, '內容已刪除。')) { setDeleting(null); setEditing(null); }
  }
  function openEdit(selection: Selection) { setEditing(selection); setDeleting(null); setMessage(''); }
  function confirmDelete(selection: Selection) { setDeleting(selection); setEditing(null); setMessage(''); }

  return <Page>
    <Heading eyebrow="OUR LITTLE JOURNAL" title="雙人日記" subtitle="分享今天的一點心情，不用每天都寫。" />
    {isPreview ? <Tag>本機預覽：內容只儲存在此裝置</Tag> : null}
    {message || app.error ? <Text accessibilityRole="alert" style={styles.message}>{message || app.error}</Text> : null}
    <Button variant="secondary" disabled={busy} onPress={() => run(app.refresh, '已取得最新內容。')}>重新整理日記</Button>
    {!coupleId ? <Card><Text style={styles.title}>先完成伴侶配對</Text><Text style={styles.copy}>完成配對後，就能發布日記、留言及心情。</Text></Card> : <>
      <Card>
        <Text style={styles.title}>寫一篇日記</Text>
        <JournalEditor label="日記內容" maximum={500} busy={busy} saveLabel="發布日記" clearAfterSave onSave={(body) => run(() => app.createDiary(body), '日記已發布。')} />
      </Card>
      <Card>
        <Text style={styles.title}>今天的心情</Text><Text style={styles.copy}>先選貼紙，再確認記錄；也可以不選，不需撰寫日記。</Text>
        <MoodPicker value={selectedMood} disabled={busy} onChange={setSelectedMood} />
        <Button disabled={busy || !selectedMood} onPress={async () => { if (selectedMood && await run(() => app.createMood(selectedMood), '心情已記錄。')) setSelectedMood(null); }}>確認記錄心情</Button>
        {selectedMood ? <Button variant="quiet" disabled={busy} onPress={() => setSelectedMood(null)}>取消心情選擇</Button> : null}
      </Card>
      {deleting ? <Card><Text style={styles.title}>確認刪除{deleting.kind === 'diary' ? '日記' : deleting.kind === 'comment' ? '留言' : '心情'}？</Text><Text style={styles.copy}>{deleting.kind === 'diary' ? '這篇日記下的所有留言也會刪除，雙方都將看不到。' : '刪除後，雙方都將看不到這筆內容。'}</Text><Button disabled={busy} onPress={remove}>確認刪除</Button><Button variant="secondary" disabled={busy} onPress={() => setDeleting(null)}>取消刪除</Button></Card> : null}
      <Text style={styles.title}>你們的心情紀錄</Text>
      {sortedMoods.map((entry) => <View key={entry.id} testID={`mood-${entry.id}`}><Card>
        <Text style={styles.copy}>{author(entry.created_by)} · {dateLabel(entry.created_at)}</Text>
        <Text style={styles.title}>{moodOptions.find((mood) => mood.value === entry.mood)?.emoji} {moodOptions.find((mood) => mood.value === entry.mood)?.label}</Text>
        {editing?.kind === 'mood' && editing.id === entry.id ? <MoodEditor key={entry.id} value={entry.mood} busy={busy} onCancel={() => setEditing(null)} onSave={async (value) => { if (await run(() => app.updateMood(entry.id, value), '心情已更新。')) setEditing(null); }} /> : <Actions busy={busy} onEdit={() => openEdit({ kind: 'mood', id: entry.id })} onDelete={() => confirmDelete({ kind: 'mood', id: entry.id })} />}
      </Card></View>)}
      {!sortedMoods.length ? <Text style={styles.copy}>還沒有心情紀錄，想分享時再選一個貼紙。</Text> : null}
      <Text style={styles.title}>你們的日常</Text>
      {sorted.map((entry) => <View key={entry.id} testID={`diary-${entry.id}`}><Card>
        <Text style={styles.copy}>{author(entry.created_by)} · {dateLabel(entry.created_at)}</Text>
        {editing?.kind === 'diary' && editing.id === entry.id ? <JournalEditor label="編輯日記內容" maximum={500} initial={entry.body} busy={busy} saveLabel="儲存日記" onCancel={() => setEditing(null)} onSave={async (body) => { const saved = await run(() => app.updateDiary(entry.id, body), '日記已更新。'); if (saved) setEditing(null); return saved; }} /> : <><Text style={styles.body}>{entry.body}</Text><Actions busy={busy} onEdit={() => openEdit({ kind: 'diary', id: entry.id })} onDelete={() => confirmDelete({ kind: 'diary', id: entry.id })} /></>}
        <Text style={styles.title}>留言</Text>
        {comments.filter((comment) => comment.diary_id === entry.id).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((comment) => <View key={comment.id} testID={`comment-${comment.id}`} style={styles.comment}>
          <Text style={styles.copy}>{author(comment.created_by)} · {dateLabel(comment.created_at)}</Text>
          {editing?.kind === 'comment' && editing.id === comment.id ? <JournalEditor label="編輯留言內容" maximum={100} initial={comment.body} busy={busy} saveLabel="儲存留言" onCancel={() => setEditing(null)} onSave={async (body) => { const saved = await run(() => app.updateComment(comment.id, body), '留言已更新。'); if (saved) setEditing(null); return saved; }} /> : <><Text style={styles.body}>{comment.body}</Text><Actions busy={busy} onEdit={() => openEdit({ kind: 'comment', id: comment.id })} onDelete={() => confirmDelete({ kind: 'comment', id: comment.id })} /></>}
        </View>)}
        <JournalEditor label="留言內容" maximum={100} busy={busy} saveLabel="送出留言" clearAfterSave onSave={(body) => run(() => app.createComment(entry.id, body), '留言已送出。')} />
      </Card></View>)}
      {!sorted.length ? <Card><Text style={styles.title}>故事從第一篇開始</Text><Text style={styles.copy}>在上方寫下第一篇日記，想分享時再留下內容。</Text></Card> : null}
    </>}
  </Page>;
}

function Actions({ busy, onEdit, onDelete }: { busy: boolean; onEdit: () => void; onDelete: () => void }) {
  return <View style={styles.actions}><Button variant="secondary" disabled={busy} onPress={onEdit}>編輯</Button><Button variant="quiet" disabled={busy} onPress={onDelete}>刪除</Button></View>;
}
function MoodPicker({ value, disabled, onChange }: { value: MoodEntry['mood'] | null; disabled: boolean; onChange: (value: MoodEntry['mood']) => void }) {
  return <View style={styles.moods}>{moodOptions.map((mood) => <Pressable key={mood.value} accessibilityRole="radio" accessibilityLabel={`心情：${mood.label}`} accessibilityState={{ checked: value === mood.value, disabled }} disabled={disabled} onPress={() => onChange(mood.value)} style={[styles.mood, value === mood.value && styles.selected]}><Text style={styles.emoji}>{mood.emoji}</Text><Text style={styles.copy}>{mood.label}</Text></Pressable>)}</View>;
}
function MoodEditor({ value, busy, onSave, onCancel }: { value: MoodEntry['mood']; busy: boolean; onSave: (value: MoodEntry['mood']) => Promise<void>; onCancel: () => void }) {
  const [selected, setSelected] = useState(value);
  return <View style={styles.editor}><MoodPicker value={selected} disabled={busy} onChange={setSelected} /><Button disabled={busy} onPress={() => onSave(selected)}>儲存心情</Button><Button variant="secondary" disabled={busy} onPress={onCancel}>取消編輯</Button></View>;
}
const styles = StyleSheet.create({ title: { color: colors.ink, fontSize: 17, fontWeight: '700' }, copy: { color: colors.ink, fontSize: 13, lineHeight: 21 }, body: { color: colors.ink, fontSize: 16, lineHeight: 25 }, message: { color: colors.ink, fontSize: 14, lineHeight: 22 }, comment: { gap: 10, padding: 12, borderRadius: 12, backgroundColor: colors.background }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, moods: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, mood: { minWidth: 68, minHeight: 68, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.line, padding: 8, borderRadius: 14 }, selected: { borderColor: colors.green, backgroundColor: colors.greenLight }, emoji: { fontSize: 25 }, editor: { gap: 10 } });
