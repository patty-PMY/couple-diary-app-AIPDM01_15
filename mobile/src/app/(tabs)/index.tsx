import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Heading, Page, Tag } from '../../components/UI';
import { useApp } from '../../context/useApp';
import { colors } from '../../lib/theme';
import { daysUntil } from '../../lib/validation';

function dateLabel(value: string) {
  return new Date(value).toLocaleString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function HomeScreen() {
  const { isPreview, coupleId, events, anniversaries, diaries } = useApp();
  const nextEvent = events[0]; const nextDate = [...anniversaries].sort((a, b) => daysUntil(a.event_date, a.repeats_yearly) - daysUntil(b.event_date, b.repeats_yearly))[0];
  return <Page>
    <View style={styles.top}><View><Text style={styles.hello}>OUR DAYS · 一起的日常</Text><Text style={styles.title}>今天，也在彼此身邊</Text></View>{isPreview ? <Tag>預覽模式</Tag> : <Tag>私密空間</Tag>}</View>
    <Card style={styles.hero}><Text style={styles.heroEmoji}>🌿</Text><View style={{ flex: 1, gap: 5 }}><Text style={styles.heroTitle}>把小日子，慢慢記下來</Text><Text style={styles.heroCopy}>一段行程、一句留言，都是一起生活的痕跡。</Text></View></Card>
    {!coupleId ? <Card><Heading eyebrow="第一步" title="邀請伴侶加入" subtitle="配對後，才能開始共享行程與日記。" /><Link href="/pair" asChild><Button>開始配對</Button></Link></Card> : <>
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>接下來</Text><Link href="/calendar" asChild><Pressable><Text style={styles.link}>查看全部 →</Text></Pressable></Link></View>
      <Card style={styles.infoCard}><View style={styles.iconBox}><Text style={{ fontSize: 22 }}>🗓️</Text></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.cardLabel}>下一個行程</Text><Text style={styles.cardTitle}>{nextEvent?.title ?? '還沒有安排'}</Text><Text style={styles.cardCopy}>{nextEvent ? dateLabel(nextEvent.starts_at) : '一起新增你們的第一個約定'}</Text></View></Card>
      <Card style={[styles.infoCard, { backgroundColor: colors.yellow, borderColor: colors.yellow }]}><View style={[styles.iconBox, { backgroundColor: '#FBF4DB' }]}><Text style={{ fontSize: 22 }}>💛</Text></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.cardLabel}>重要日子</Text><Text style={styles.cardTitle}>{nextDate?.title ?? '留下值得記得的日子'}</Text><Text style={styles.cardCopy}>{nextDate ? `還有 ${daysUntil(nextDate.event_date, nextDate.repeats_yearly)} 天` : '紀念日、生日或下次見面'}</Text></View></Card>
      <View style={styles.sectionRow}><Text style={styles.sectionTitle}>最近的心情</Text><Link href="/diary" asChild><Pressable><Text style={styles.link}>去日記 →</Text></Pressable></Link></View>
      <Card style={{ gap: 10 }}><Text style={styles.cardTitle}>{diaries[0] ? `「${diaries[0].body.slice(0, 58)}${diaries[0].body.length > 58 ? '…' : ''}」` : '寫下今天的一點心情'}</Text><Text style={styles.cardCopy}>{diaries[0] ? dateLabel(diaries[0].created_at) : '不用每天寫，想分享時再留下文字或貼紙。'}</Text><Link href="/diary" asChild><Button variant="secondary">{diaries[0] ? '閱讀日記與留言' : '分享心情'}</Button></Link></Card>
      <Link href="/pair" asChild><Pressable style={styles.pairLink}><Text style={styles.pairLinkText}>配對設定 →</Text></Pressable></Link>
    </>}
    <Text style={styles.footnote}>只屬於你們兩個的小小空間。</Text>
  </Page>;
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 6 },
  hello: { fontSize: 10, letterSpacing: 1.7, color: colors.green, fontWeight: '800', marginBottom: 5 },
  title: { fontSize: 23, lineHeight: 30, color: colors.ink, fontWeight: '700' },
  hero: { backgroundColor: colors.greenLight, borderColor: colors.greenLight, flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 112 }, heroEmoji: { fontSize: 35 },
  heroTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' }, heroCopy: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: -7 }, sectionTitle: { color: colors.ink, fontSize: 17, fontWeight: '700' }, link: { color: colors.green, fontSize: 13, fontWeight: '700' },
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: 13 }, iconBox: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenLight },
  cardLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' }, cardTitle: { color: colors.ink, fontSize: 16, lineHeight: 22, fontWeight: '700' }, cardCopy: { fontSize: 12, lineHeight: 18, color: colors.muted },
  pairLink: { alignSelf: 'center', padding: 9 }, pairLinkText: { color: colors.muted, fontSize: 12 }, footnote: { textAlign: 'center', color: colors.muted, fontSize: 11, paddingTop: 2 },
});
