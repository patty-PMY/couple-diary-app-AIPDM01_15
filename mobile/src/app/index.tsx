import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Heading, Page } from '../components/UI';
import { LoadingState, Notice } from '../components/Feedback';
import { useApp } from '../context/useApp';
import { colors } from '../lib/theme';
import { validateEmail } from '../lib/validation';
import { userMessage } from '../lib/errors';

type Phase = 'notice' | 'account' | 'verify';
export default function WelcomeScreen() {
  const { ready, session, pairingStatus, isPreview, configured, noticeConfigured, testDataRegion, testRetention, signIn, signUp, enterPreview, retrySession, error } = useApp();
  const [creating, setCreating] = useState(false);
  const [phase, setPhase] = useState<Phase>('notice');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false); const [adult, setAdult] = useState(false);
  const [pending, setPending] = useState<'account' | 'preview' | 'restore' | null>(null);
  const [notice, setNotice] = useState<{ message: string; tone: 'info' | 'success' | 'error' } | null>(null);
  const locked = useRef(false);
  const busy = pending !== null;
  useEffect(() => {
    if (ready && (session || isPreview)) router.replace(isPreview || pairingStatus === 'paired' ? '/(tabs)' : '/pair');
  }, [ready, session, isPreview, pairingStatus]);
  function switchMode(create: boolean) {
    if (locked.current) return;
    setCreating(create); setPhase('notice'); setEmail(''); setPassword(''); setConsent(false); setAdult(false); setNotice(null);
  }
  function continueSignup() {
    if (!consent || !adult || !configured || !noticeConfigured) return;
    setPhase('account'); setNotice(null);
  }
  function reviewNotice() { setPhase('notice'); setEmail(''); setPassword(''); setNotice(null); }
  async function submit() {
    if (locked.current) return;
    if (creating && (phase !== 'account' || !consent || !adult)) { setNotice({ message: '請先閱讀資料使用說明，明確同意並確認已年滿 18 歲。', tone: 'error' }); return; }
    const invalid = validateEmail(email);
    if (invalid || !password || (creating && password.length < 8)) { setNotice({ message: invalid || (creating ? '密碼至少 8 個字元。' : '請輸入密碼。'), tone: 'error' }); return; }
    locked.current = true; setPending('account'); setNotice(null);
    try {
      if (creating) {
        const result = await signUp(email, password, { consentAccepted: consent, adultConfirmed: adult });
        setPassword('');
        if (result === 'signed_in') router.replace('/pair');
        else { setPhase('verify'); setNotice({ message: '註冊資料已送出。請查看信箱（含垃圾郵件）完成驗證，再回來登入。', tone: 'success' }); }
      } else {
        await signIn(email, password);
        setPassword(''); setNotice({ message: '登入成功，正在確認配對狀態…', tone: 'success' });
      }
    } catch (reason) { setNotice({ message: userMessage(reason, '帳號操作未完成，請稍後重試；Email 與密碼已保留。'), tone: 'error' }); }
    finally { locked.current = false; setPending(null); }
  }
  async function preview() {
    if (locked.current) return;
    locked.current = true; setPending('preview'); setNotice(null);
    try { await enterPreview(); router.replace('/(tabs)'); }
    catch (reason) { setNotice({ message: userMessage(reason, '無法開啟本機預覽，請確認裝置儲存空間後再試。'), tone: 'error' }); }
    finally { locked.current = false; setPending(null); }
  }
  if (!ready) return <Page><LoadingState message="正在讀取登入狀態…" /></Page>;
  return <Page contentStyle={styles.page}>
    <Heading eyebrow="OUR DAYS" title="把日常，好好放在一起" subtitle="建立帳號 → 完成 Email 驗證 → 邀請伴侶配對" />
    <Card>
      <View style={styles.switcher}>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: !creating, disabled: busy }} disabled={busy} onPress={() => switchMode(false)} style={[styles.tab, !creating && styles.selected]}><Text style={styles.label}>登入</Text></Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: creating, disabled: busy }} disabled={busy} onPress={() => switchMode(true)} style={[styles.tab, creating && styles.selected]}><Text style={styles.label}>建立帳號</Text></Pressable>
      </View>
      {creating && phase === 'notice' ? <>
        <Heading title="1. 閱讀並確認" subtitle="確認使用資格與資料用途後，才會請你填寫帳號資料。" />
        <View style={styles.notice}>
          <Text style={styles.label}>測試版資料使用說明（v1）</Text>
          <Text style={styles.copy}>使用資格：僅供年滿 18 歲、受邀參與測試的情侶。</Text>
          <Text style={styles.copy}>帳號資料：Email 與密碼用於登入；另記錄成年確認、同意版本與時間。</Text>
          <Text style={styles.copy}>伴侶可見內容：配對後，行程、重要日期、日記、留言與心情在配對雙方之間共享。</Text>
          <Text style={styles.copy}>資料儲存：測試版 Supabase 專案。資料區域：{testDataRegion || '尚未設定'}。保存安排：{testRetention || '尚未設定'}。</Text>
          <Text style={styles.copy}>可選提醒：開啟年度提醒前會另外說明推播 token 與通用文案的使用；推播不含紀念日名稱與日期。</Text>
          <Text style={styles.copy}>資料移除：請聯絡測試負責人，本版尚無自助刪除帳號功能。本機預覽資料只留在裝置，請勿輸入真實個資。</Text>
        </View>
        <Confirmation checked={adult} onPress={() => setAdult(!adult)} label="我確認已年滿 18 歲" />
        <Confirmation checked={consent} onPress={() => setConsent(!consent)} label="我已閱讀並同意以上資料使用說明" />
        {!noticeConfigured ? <Notice message="測試負責人尚未填妥資料區域與保存安排，目前無法繼續註冊。可先使用本機預覽，或聯絡測試負責人。" /> : null}
        <Button disabled={!adult || !consent || !noticeConfigured || !configured} onPress={continueSignup}>同意並繼續</Button>
      </> : creating && phase === 'verify' ? <>
        <Heading title="3. 完成 Email 驗證" subtitle={`請查看 ${email} 的信箱，完成驗證後再登入並邀請伴侶。`} />
        <Button onPress={() => { setCreating(false); setPhase('notice'); setNotice(null); }}>已完成驗證，前往登入</Button>
        <Notice message="若未收到信，請先檢查垃圾郵件並稍候片刻；確認 Email 輸入正確後再重試註冊。" />
      </> : <>
        <Heading title={creating ? '2. 建立你的帳號' : '歡迎回來'} subtitle={creating ? '已確認成年資格及同意資料使用說明。' : '登入後會依配對進度引導你繼續。'} />
        <Field label="Email" editable={!busy} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
        <Field label="密碼" editable={!busy} value={password} onChangeText={setPassword} secureTextEntry autoComplete={creating ? 'new-password' : 'password'} helper={creating ? '至少 8 個字元。' : undefined} />
        <Button disabled={!configured || busy} loading={pending === 'account'} onPress={submit}>{pending === 'account' ? creating ? '建立帳號中…' : '登入中…' : creating ? '建立帳號' : '登入'}</Button>
        {creating ? <Button variant="quiet" disabled={busy} onPress={reviewNotice}>返回資料使用說明</Button> : null}
      </>}
      {notice ? <Notice {...notice} /> : error ? <Notice message={userMessage(new Error(error))} tone="error" /> : null}
      {error ? <Button variant="secondary" disabled={busy} loading={pending === 'restore'} onPress={async () => {
        if (locked.current) return;
        locked.current = true; setPending('restore'); setNotice(null);
        try { await retrySession(); } catch (reason) { setNotice({ message: userMessage(reason, '仍無法讀取登入狀態，請稍候重試或重新登入。'), tone: 'error' }); }
        finally { locked.current = false; setPending(null); }
      }}>重試讀取登入狀態</Button> : null}
      {!configured ? <Notice message="雲端帳號服務尚未設定。可先使用本機預覽，或聯絡測試負責人啟用註冊與登入。" /> : null}
      <Button variant="secondary" disabled={busy} loading={pending === 'preview'} onPress={preview}>{pending === 'preview' ? '開啟預覽中…' : '先看預覽'}</Button>
    </Card>
  </Page>;
}
function Confirmation({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={onPress} style={styles.checkRow}><Text style={styles.check}>{checked ? '☑' : '☐'}</Text><Text style={styles.copy}>{label}</Text></Pressable>;
}
const styles = StyleSheet.create({ page: { maxWidth: 560, width: '100%', alignSelf: 'center', paddingTop: 26 }, switcher: { flexDirection: 'row', gap: 8 }, tab: { flex: 1, alignItems: 'center', borderRadius: 12, padding: 12, backgroundColor: colors.background }, selected: { backgroundColor: colors.greenLight }, label: { color: colors.ink, fontSize: 15, fontWeight: '700' }, copy: { color: colors.ink, fontSize: 14, lineHeight: 22, flexShrink: 1 }, notice: { gap: 10, padding: 14, backgroundColor: colors.background, borderRadius: 14 }, checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }, check: { color: colors.green, fontSize: 25 } });
