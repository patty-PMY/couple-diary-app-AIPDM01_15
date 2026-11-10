import { router } from 'expo-router';
import React, { useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Heading, Page, Tag } from '../components/UI';
import { useApp } from '../context/useApp';
import { colors } from '../lib/theme';

export default function PairScreen() {
  const { coupleId, isPreview, createInvite, acceptInvite } = useApp();
  const [token, setToken] = useState(''); const [invite, setInvite] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function makeInvite() { setBusy(true); setMessage(''); try { const code = await createInvite(); setInvite(code); } catch (error) { setMessage(error instanceof Error ? error.message : '目前無法建立邀請。'); } finally { setBusy(false); } }
  async function join() { if (!token.trim()) { setMessage('請輸入伴侶分享的邀請碼。'); return; } setBusy(true); setMessage(''); try { await acceptInvite(token); router.replace('/(tabs)'); } catch (error) { setMessage(error instanceof Error ? error.message : '邀請碼無效或已過期。'); } finally { setBusy(false); } }
  return <Page>
    <Button variant="quiet" onPress={() => router.back()}>← 返回</Button>
    <Heading eyebrow="TOGETHER" title="和伴侶配對" subtitle="配對後，彼此才能看見共享行程與日記。" />
    {isPreview ? <Card><Tag>本機預覽</Tag><Text style={styles.body}>預覽畫面已載入示範情侶資料。邀請碼不會建立真實配對或同步至雲端。</Text><Button onPress={() => router.replace('/(tabs)')}>回到預覽</Button></Card> : coupleId ? <Card><Text style={styles.success}>✓ 已完成配對</Text><Text style={styles.body}>你們的共享內容會只提供給這組配對查看。</Text><Button onPress={() => router.replace('/(tabs)')}>回到今天</Button></Card> : <>
      <Card><Text style={styles.step}>01 邀請伴侶</Text><Text style={styles.body}>建立一次性邀請碼，分享給伴侶。邀請碼 48 小時後到期。</Text><Button disabled={busy} onPress={makeInvite}>{busy ? '建立中…' : '建立邀請碼'}</Button>{invite ? <View style={styles.codeBox}><Text selectable style={styles.code}>{invite}</Text><Button variant="secondary" onPress={() => Share.share({ message: `加入我們的 Our Days 私密空間，邀請碼：${invite}` })}>分享邀請碼</Button></View> : null}</Card>
      <Card><Text style={styles.step}>02 輸入伴侶邀請碼</Text><Field label="邀請碼" value={token} onChangeText={setToken} autoCapitalize="none" placeholder="貼上伴侶傳來的代碼" /><Button variant="secondary" disabled={busy} onPress={join}>接受邀請</Button></Card>
    </>}
    {message ? <Text style={styles.error}>{message}</Text> : null}
  </Page>;
}
const styles = StyleSheet.create({ step: { color: colors.green, fontSize: 13, fontWeight: '800' }, body: { color: colors.muted, fontSize: 13, lineHeight: 20 }, codeBox: { backgroundColor: colors.background, padding: 12, borderRadius: 14, gap: 10, alignItems: 'center' }, code: { color: colors.ink, fontSize: 17, letterSpacing: 2, fontWeight: '700' }, success: { color: colors.green, fontSize: 17, fontWeight: '800' }, error: { color: colors.danger, fontSize: 13 } });
