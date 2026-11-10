import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Heading, Page, Tag } from '../../components/UI';
import { useApp } from '../../context/useApp';
import { DiaryEntry, moodOptions } from '../../lib/models';
import { characterCount, validateText } from '../../lib/validation';
import { colors } from '../../lib/theme';

function dateLabel(value: string) { return new Date(value).toLocaleString('zh-TW', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

export default function DiaryScreen() {
  const { diaries, comments, moods, coupleId, session, isPreview, createDiary, createComment, createMood } = useApp();
  const [body, setBody] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({}); const [commentErrors, setCommentErrors] = useState<Record<string, string>>({});
  const sorted = useMemo(() => [...diaries].sort((a, b) => b.created_at.localeCompare(a.created_at)), [diaries]);
  async function publish() {
    const validation = validateText(body, 500);
    if (validation) { setMessage(validation); return; }
    setBusy(true); setMessage(''); try { await createDiary(body); setBody(''); } catch (error) { setMessage(error instanceof Error ? error.message : '發布失敗，內容已保留。'); } finally { setBusy(false); }
  }
  async function postComment(entry: DiaryEntry) {
    const text = commentDrafts[entry.id] ?? '';
    const validation = validateText(text, 100);
    if (validation) { setCommentErrors((old) => ({ ...old, [entry.id]: validation })); return; }
    setCommentErrors((old) => ({ ...old, [entry.id]: '' }));
    try { await createComment(entry.id, text); setCommentDrafts((old) => ({ ...old, [entry.id]: '' })); }
    catch (error) { setCommentErrors((old) => ({ ...old, [entry.id]: error instanceof Error ? error.message : '留言失敗，內容已保留。' })); }
  }
  async function addMood(mood: (typeof moodOptions)[number]['value']) {
    try { await createMood(mood); setMessage('心情已記下來。'); setTimeout(() => setMessage(''), 1800); }
    catch (error) { setMessage(error instanceof Error ? error.message : '目前無法記錄心情。'); }
  }
  return <Page>
    <Heading eyebrow="OUR LITTLE JOURNAL" title="雙人日記" subtitle="分享今天的一點心情，不用每天都寫。" />
    <Card style={styles.moodCard}><View style={styles.cardHead}><View style={{ flex: 1 }}><Text style={styles.sectionTitle}>今天的心情</Text><Text style={styles.helper}>挑一個貼紙就好，也可以什麼都不選。</Text></View><Text style={{ fontSize: 22 }}>☁️</Text></View><View style={styles.moodGrid}>{moodOptions.map((mood) => <Pressable key={mood.value} accessibilityRole="button" accessibilityLabel={`記錄心情：${mood.label}`} onPress={() => addMood(mood.value)} style={styles.moodOption}><Text style={{ fontSize: 24 }}>{mood.emoji}</Text><Text style={styles.moodLabel}>{mood.label}</Text></Pressable>)}</View>{moods.length ? <Text style={styles.helper}>最近記錄：{moodOptions.find((m) => m.value === moods[0].mood)?.emoji} {moodOptions.find((m) => m.value === moods[0].mood)?.label}</Text> : null}</Card>
    {coupleId ? <Card><View style={styles.cardHead}><Text style={styles.sectionTitle}>寫一篇日記</Text>{isPreview ? <Tag>本機預覽</Tag> : null}</View><Field label="想分享什麼？" value={body} onChangeText={(value) => { setBody(value); setMessage(''); }} placeholder="今天發生了一件小事……" multiline numberOfLines={5} textAlignVertical="top" style={styles.diaryField} maxLength={650} /><View style={styles.counterRow}><Text style={[styles.counter, characterCount(body) > 500 && styles.counterError]}>{characterCount(body)} / 500 字</Text><Text style={styles.helper}>發布後，伴侶就能閱讀並留言。</Text></View>{message ? <Text style={styles.error}>{message}</Text> : null}<Button disabled={busy} onPress={publish}>{busy ? '發布中…' : '發布日記'}</Button></Card> : <Card><Text style={styles.sectionTitle}>先完成伴侶配對</Text><Text style={styles.helper}>配對後，這裡會成為只屬於你們的日記空間。</Text></Card>}
    <Text style={styles.listTitle}>你們的日常</Text>
    {sorted.map((entry) => {
      const own = entry.created_by === 'you' || entry.created_by === session?.user.id;
      const entryComments = comments.filter((comment) => comment.diary_id === entry.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
      return <Card key={entry.id} style={styles.entryCard}><View style={styles.authorRow}><View style={[styles.avatar, own ? styles.avatarYou : styles.avatarPartner]}><Text>{own ? '你' : '♡'}</Text></View><View style={{ flex: 1 }}><Text style={styles.author}>{own ? '你' : '伴侶'}</Text><Text style={styles.helper}>{dateLabel(entry.created_at)}</Text></View><Text style={{ fontSize: 18 }}>✦</Text></View><Text style={styles.entryBody}>{entry.body}</Text><View style={styles.commentDivider} />{entryComments.map((comment) => <View key={comment.id} style={styles.comment}><Text style={styles.commentName}>{comment.created_by === 'you' || comment.created_by === session?.user.id ? '你' : '伴侶'}</Text><Text style={styles.commentBody}>{comment.body}</Text></View>)}
        <View style={styles.commentRow}><View style={{ flex: 1 }}><Field label="" accessibilityLabel="留言" value={commentDrafts[entry.id] ?? ''} onChangeText={(value) => setCommentDrafts((old) => ({ ...old, [entry.id]: value }))} placeholder="留一句回應…" maxLength={120} /></View><Button style={styles.commentButton} onPress={() => postComment(entry)}>送出</Button></View>{commentErrors[entry.id] ? <Text style={styles.error}>{commentErrors[entry.id]}</Text> : null}</Card>;
    })}
    {!sorted.length && coupleId ? <Card style={styles.empty}><Text style={{ fontSize: 30 }}>📖</Text><Text style={styles.sectionTitle}>故事從第一篇開始</Text><Text style={styles.helper}>想寫的時候再寫，這裡會好好收著。</Text></Card> : null}
  </Page>;
}
const styles = StyleSheet.create({ moodCard: { backgroundColor: '#F1E9D5', borderColor: '#F1E9D5' }, cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '700' }, helper: { color: colors.muted, fontSize: 11, lineHeight: 17 }, moodGrid: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }, moodOption: { width: '15%', minWidth: 42, alignItems: 'center', gap: 4, paddingVertical: 5 }, moodLabel: { color: colors.ink, fontSize: 10 }, diaryField: { minHeight: 130, paddingTop: 13 }, counterRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 }, counter: { color: colors.muted, fontSize: 11, fontWeight: '700' }, counterError: { color: colors.danger }, error: { color: colors.danger, fontSize: 12 }, listTitle: { color: colors.ink, fontSize: 17, fontWeight: '700', marginBottom: -7 }, entryCard: { gap: 14 }, authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 38, height: 38, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, avatarYou: { backgroundColor: colors.peach }, avatarPartner: { backgroundColor: colors.greenLight }, author: { color: colors.ink, fontSize: 13, fontWeight: '700' }, entryBody: { color: colors.ink, fontSize: 15, lineHeight: 24 }, commentDivider: { height: 1, backgroundColor: colors.line }, comment: { backgroundColor: colors.background, borderRadius: 13, padding: 11, gap: 3 }, commentName: { color: colors.green, fontSize: 11, fontWeight: '700' }, commentBody: { color: colors.ink, fontSize: 13, lineHeight: 20 }, commentRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' }, commentButton: { width: 75 }, empty: { alignItems: 'center', paddingVertical: 28 }, });
