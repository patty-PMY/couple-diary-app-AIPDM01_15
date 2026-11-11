import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button, Card, Heading, Page, Tag } from '../../components/UI';
import { useApp } from '../../context/useApp';
import { colors } from '../../lib/theme';

export default function ProfileScreen() {
  const { session, isPreview, coupleId, signOut } = useApp();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function leave() { setBusy(true); setMessage(''); try { await signOut(); router.replace('/'); } catch (reason) { setMessage(reason instanceof Error ? reason.message : '登出失敗，請稍後重試。'); } finally { setBusy(false); } }
  return <Page>
    <Heading eyebrow="YOUR SPACE" title="我的空間" subtitle="你們的日常，只留給彼此。" />
    <Card style={styles.profile}><View style={styles.avatar}><Text style={{ fontSize: 27 }}>♡</Text></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.name}>{isPreview ? '預覽中的你' : session?.user.email ?? 'Our Days 使用者'}</Text><Text style={styles.detail}>{coupleId ? '已建立雙人共享空間' : '尚未完成伴侶配對'}</Text></View>{isPreview ? <Tag>預覽</Tag> : null}</Card>
    <Card><Text style={styles.section}>隱私與資料</Text><Text style={styles.body}>行程、重要日期與日記只會提供給配對雙方。正式測試前，請確認資料使用說明及參與者同意內容。</Text><View style={styles.line} /><Text style={styles.small}>預覽模式資料只存於本機，不會與伴侶同步。請勿輸入真實個人資料。</Text></Card>
    <Button variant="secondary" onPress={() => router.push('/pair')}>{coupleId ? '查看配對設定' : '開始伴侶配對'}</Button>
    <Button variant="quiet" disabled={busy} onPress={leave}>{busy ? '登出中…' : isPreview ? '離開本機預覽' : '登出'}</Button>
    {message ? <Text accessibilityRole="alert">{message}</Text> : null}
  </Page>;
}
const styles = StyleSheet.create({ profile: { flexDirection: 'row', alignItems: 'center', gap: 12 }, avatar: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.peach, justifyContent: 'center', alignItems: 'center' }, name: { color: colors.ink, fontSize: 14, fontWeight: '700' }, detail: { color: colors.muted, fontSize: 11 }, section: { color: colors.ink, fontSize: 15, fontWeight: '700' }, body: { color: colors.ink, fontSize: 13, lineHeight: 21 }, line: { height: 1, backgroundColor: colors.line }, small: { color: colors.muted, fontSize: 11, lineHeight: 18 } });
