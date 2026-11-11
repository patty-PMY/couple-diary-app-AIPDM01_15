import { Redirect, router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Heading, Page, Tag } from '../components/UI';
import { LoadingState, Notice } from '../components/Feedback';
import { useApp } from '../context/useApp';
import { colors } from '../lib/theme';
import { validateInvite } from '../lib/pairing';
import { userMessage } from '../lib/errors';

type Action = 'invite' | 'join' | 'reload' | 'share' | 'leave';
export default function PairScreen() {
  const { ready, session, pairingStatus, refreshing, isPreview, createInvite, acceptInvite, refresh, signOut, error } = useApp();
  const [token, setToken] = useState(''); const [invite, setInvite] = useState('');
  const [notice, setNotice] = useState<{ message: string; tone: 'info' | 'success' | 'error' } | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const lock = useRef(false);
  const busy = pending !== null || Boolean(refreshing);
  async function run(action: Action, operation: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setPending(action); setNotice(null);
    try { await operation(); }
    catch (reason) { setNotice({ message: userMessage(reason, action === 'share' ? '分享未完成，可再次分享或長按邀請碼複製後傳給伴侶。' : '配對操作未完成，請重新整理狀態後重試。'), tone: 'error' }); }
    finally { lock.current = false; setPending(null); }
  }
  function join() {
    const invalid = validateInvite(token);
    if (invalid) { setNotice({ message: invalid, tone: 'error' }); return; }
    void run('join', async () => { await acceptInvite(token); setNotice({ message: '配對已完成，現在可以進入你們的共享空間。', tone: 'success' }); });
  }
  useEffect(() => {
    if (pairingStatus !== 'pending') return;
    const timer = setInterval(() => { if (!lock.current && !refreshing) void refresh().catch(() => setNotice({ message: '暫時無法更新配對狀態，請確認網路後按「重新整理配對狀態」。', tone: 'error' })); }, 10000);
    return () => clearInterval(timer);
  }, [pairingStatus, refresh, refreshing]);
  if (!ready) return <Page><LoadingState message="正在讀取登入狀態…" /></Page>;
  if (!session && !isPreview) return <Redirect href="/" />;
  return <Page>
    <Heading eyebrow="TOGETHER" title="和伴侶配對" subtitle="帳號已準備好。完成雙人配對後，才會開放共享內容。" />
    {refreshing && pairingStatus !== 'loading' ? <LoadingState message="正在更新配對狀態…" /> : null}
    {notice ? <Notice {...notice} /> : null}
    {isPreview ? <Card><Tag>本機預覽</Tag><Text style={styles.copy}>你正在查看示範配對，邀請碼不會建立真實配對，也不會與伴侶同步。</Text><Button onPress={() => router.replace('/(tabs)')}>回到預覽</Button></Card>
      : pairingStatus === 'paired' ? <Card><Tag>3／3 已完成配對</Tag><Text style={styles.title}>你們的空間已準備好</Text><Text style={styles.copy}>可以開始新增行程、重要日期、日記或心情，內容只提供給這組配對。</Text><Button onPress={() => router.replace('/(tabs)')}>開始一起記錄</Button></Card>
      : pairingStatus === 'loading' ? <LoadingState message="正在確認配對狀態…" />
      : pairingStatus === 'error' ? <Card><Notice message={error || '無法讀取配對狀態，請確認網路後重試。'} tone="error" /><Button disabled={busy} loading={pending === 'reload'} onPress={() => run('reload', refresh)}>重新整理配對狀態</Button><Text style={styles.copy}>若仍無法載入，可先登出，再重新登入。</Text></Card>
      : <>
        <Card><Tag>{pairingStatus === 'pending' ? '2／3 等待伴侶' : '1／3 選擇配對方式'}</Tag><Text style={styles.copy}>{pairingStatus === 'pending' ? '把邀請碼傳給伴侶，請對方登入並接受邀請。每 10 秒更新一次狀態，也可手動重新整理。' : '由其中一人建立邀請碼，另一人登入自己的帳號並貼上代碼；兩種方式擇一即可。'}</Text></Card>
        <Card><Text style={styles.title}>我來邀請伴侶</Text><Text style={styles.copy}>邀請碼限使用一次，48 小時後到期。只分享給你要配對的伴侶。</Text>
          <Button disabled={busy} loading={pending === 'invite'} onPress={() => run('invite', async () => { setInvite(await createInvite()); setNotice({ message: '邀請碼已建立。請分享給伴侶，等待對方接受。', tone: 'success' }); })}>{pending === 'invite' ? '建立邀請碼中…' : pairingStatus === 'pending' ? '重新產生邀請碼' : '建立邀請碼'}</Button>
          {invite ? <View style={styles.codeBox}><Text selectable accessibilityLabel={`邀請碼：${invite}`} style={styles.code}>{invite}</Text><Button variant="secondary" disabled={busy} loading={pending === 'share'} onPress={() => run('share', async () => { const result = await Share.share({ message: `加入我們的 Our Days 私密空間，邀請碼：${invite}` }); if (result.action === Share.dismissedAction) setNotice({ message: '已取消分享，邀請碼仍可使用；可以再次分享或長按代碼複製。', tone: 'info' }); })}>分享邀請碼</Button></View> : <Notice message={pairingStatus === 'pending' ? '這台裝置未保留原邀請碼。若遺失或已過期，請重新產生並分享；舊碼會立即失效。' : '尚未建立邀請碼，按上方按鈕即可開始。'} />}
          {pairingStatus === 'pending' ? <Text style={styles.copy}>重新產生會讓舊碼失效；已有邀請時無法接受其他人的代碼。</Text> : null}
        </Card>
        {pairingStatus === 'unpaired' ? <Card><Text style={styles.title}>伴侶已邀請我</Text><Field label="邀請碼" value={token} onChangeText={setToken} editable={!busy} autoCapitalize="none" autoCorrect={false} maxLength={48} helper="貼上完整的 48 字元代碼，不需再次建立邀請。" /><Button disabled={busy} loading={pending === 'join'} variant="secondary" onPress={join}>{pending === 'join' ? '接受邀請中…' : '接受邀請'}</Button></Card> : null}
        <Button disabled={busy} loading={pending === 'reload'} variant="secondary" onPress={() => run('reload', refresh)}>重新整理配對狀態</Button>
      </>}
    <Button disabled={busy} loading={pending === 'leave'} variant="quiet" onPress={() => run('leave', async () => { await signOut(); router.replace('/'); })}>{isPreview ? '離開預覽' : '登出'}</Button>
  </Page>;
}
const styles = StyleSheet.create({ title: { color: colors.ink, fontSize: 17, fontWeight: '700' }, copy: { color: colors.ink, fontSize: 14, lineHeight: 22 }, codeBox: { gap: 12, padding: 14, backgroundColor: colors.background, borderRadius: 14 }, code: { color: colors.green, fontSize: 17, lineHeight: 26 } });
