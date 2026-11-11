import { Redirect, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Heading, Page, Tag } from '../components/UI';
import { useApp } from '../context/useApp';
import { colors } from '../lib/theme';

export default function PairScreen() {
  const { ready, session, pairingStatus, isPreview, createInvite, acceptInvite, refresh, signOut, error } = useApp();
  const [token, setToken] = useState(''); const [invite, setInvite] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  async function makeInvite() { setBusy(true); setMessage(''); try { const code = await createInvite(); setInvite(code); } catch (error) { setMessage(error instanceof Error ? error.message : '目前無法建立邀請。'); } finally { setBusy(false); } }
  async function join() { if (!token.trim()) { setMessage('請輸入伴侶分享的邀請碼。'); return; } setBusy(true); setMessage(''); try { await acceptInvite(token); setMessage('配對成功！'); } catch (error) { setMessage(error instanceof Error ? error.message : '邀請碼無效或已過期。'); } finally { setBusy(false); } }
  async function reload() { setBusy(true); setMessage(''); try { await refresh(); } catch { setMessage('無法重新整理，請確認網路後重試。'); } finally { setBusy(false); } }
  async function leave() { setBusy(true); try { await signOut(); router.replace('/'); } catch (reason) { setMessage(reason instanceof Error ? reason.message : '登出失敗，請稍後重試。'); } finally { setBusy(false); } }
  async function shareInvite() { try { await Share.share({ message: `加入我們的 Our Days 私密空間，邀請碼：${invite}` }); } catch { setMessage('分享失敗，請長按邀請碼複製後傳給伴侶。'); } }
  useEffect(() => {
    if (pairingStatus !== 'pending') return;
    const timer = setInterval(() => { void refresh().catch(() => setMessage('狀態更新失敗，可按重新整理重試。')); }, 10000);
    return () => clearInterval(timer);
  }, [pairingStatus, refresh]);
  if (!ready) return <Page><Text>載入登入狀態…</Text></Page>;
  if (!session && !isPreview) return <Redirect href="/" />;
  return <Page>
    {pairingStatus === 'paired' || isPreview ? <Button variant="quiet" onPress={() => router.replace('/(tabs)')}>← 返回</Button> : null}
    <Heading eyebrow="TOGETHER" title="和伴侶配對" subtitle="配對後，彼此才能看見共享行程與日記。" />
    {isPreview ? <Card><Tag>本機預覽</Tag><Text style={styles.body}>預覽畫面已載入示範情侶資料。邀請碼不會建立真實配對或同步至雲端。</Text><Button onPress={() => router.replace('/(tabs)')}>回到預覽</Button></Card> : pairingStatus === 'paired' ? <Card><Text style={styles.success}>✓ 已完成配對</Text><Text style={styles.body}>你們的共享內容會只提供給這組配對查看。</Text><Button onPress={() => router.replace('/(tabs)')}>回到今天</Button></Card> : pairingStatus === 'loading' || pairingStatus === 'error' ? <Card><Text>{pairingStatus === 'loading' ? '讀取配對狀態…' : error || '無法讀取配對狀態。'}</Text><Button disabled={busy} onPress={reload}>重新整理</Button></Card> : <>
      {pairingStatus === 'pending' ? <Card><Tag>等待伴侶加入</Tag><Text style={styles.body}>伴侶接受邀請後才會開啟共享空間。每 10 秒更新狀態；若遺失或過期，請重新產生邀請碼，舊碼會失效。</Text></Card> : null}
      <Card><Text style={styles.step}>01 邀請伴侶</Text><Text style={styles.body}>建立一次性邀請碼，分享給伴侶。邀請碼 48 小時後到期。</Text><Button disabled={busy} onPress={makeInvite}>{busy ? '建立中…' : '建立邀請碼'}</Button>{invite ? <View style={styles.codeBox}><Text selectable style={styles.code}>{invite}</Text><Button variant="secondary" disabled={busy} onPress={shareInvite}>分享邀請碼</Button></View> : null}</Card>
      {pairingStatus === 'unpaired' ? <Card><Text style={styles.step}>02 輸入伴侶邀請碼</Text><Field label="邀請碼" value={token} onChangeText={setToken} autoCapitalize="none" autoCorrect={false} maxLength={48} editable={!busy} placeholder="貼上伴侶傳來的代碼" /><Button variant="secondary" disabled={busy} onPress={join}>接受邀請</Button></Card> : null}
      <Button variant="secondary" disabled={busy} onPress={reload}>重新整理配對狀態</Button>
    </>}
    <Button variant="quiet" disabled={busy} onPress={leave}>{isPreview ? '離開預覽' : '登出'}</Button>
    {message ? <Text style={styles.error}>{message}</Text> : null}
  </Page>;
}
const styles = StyleSheet.create({ step: { color: colors.green, fontSize: 13, fontWeight: '800' }, body: { color: colors.muted, fontSize: 13, lineHeight: 20 }, codeBox: { backgroundColor: colors.background, padding: 12, borderRadius: 14, gap: 10, alignItems: 'center' }, code: { color: colors.ink, fontSize: 17, letterSpacing: 2, fontWeight: '700' }, success: { color: colors.green, fontSize: 17, fontWeight: '800' }, error: { color: colors.danger, fontSize: 13 } });
