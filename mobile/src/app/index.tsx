import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field, Page } from '../components/UI';
import { useApp } from '../context/useApp';
import { colors } from '../lib/theme';
import { validateEmail } from '../lib/validation';

export default function WelcomeScreen() {
  const { ready, session, isPreview, configured, noticeConfigured, testDataRegion, testRetention, signIn, signUp, enterPreview } = useApp();
  const [createAccount, setCreateAccount] = useState(false); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false); const [adult, setAdult] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  useEffect(() => { if (ready && (session || isPreview)) router.replace('/(tabs)'); }, [ready, session, isPreview]);
  async function submit() {
    const emailError = validateEmail(email);
    if (emailError) { setMessage(emailError); return; }
    if (!password || (createAccount && password.length < 8)) { setMessage(createAccount ? '密碼至少 8 個字元。' : '請輸入密碼。'); return; }
    if (createAccount && (!consent || !adult)) { setMessage('建立帳號前，請先同意資料使用說明並確認已年滿 18 歲。'); return; }
    setBusy(true); setMessage('');
    try { if (createAccount) { await signUp(email, password, { consentAccepted: consent, adultConfirmed: adult }); setMessage('帳號已送出。若收到驗證信，請先完成 Email 驗證，再登入。'); } else await signIn(email, password); }
    catch (error) { setMessage(error instanceof Error ? error.message : '目前無法完成操作，請稍後再試。'); }
    finally { setBusy(false); }
  }
  if (!ready) return <View style={styles.loading}><ActivityIndicator color={colors.green} /><Text style={{ color: colors.muted }}>準備 Our Days…</Text></View>;
  return <Page contentStyle={styles.page}>
    <View style={styles.brandBlock}><View style={styles.logo}><Text style={styles.logoText}>♡</Text></View><Text style={styles.brand}>Our Days</Text><Text style={styles.brandLine}>把彼此的日常，好好放在一起。</Text>
      <View style={styles.art}><Text style={styles.artEmoji}>☀️ 🌿 ☁️</Text><Text style={styles.artCopy}>每一天的小事，\n都值得被分享。</Text></View>
    </View>
    <Card style={styles.authCard}>
      <View style={styles.switcher}><Pressable onPress={() => { setCreateAccount(false); setMessage(''); }} style={[styles.switchItem, !createAccount && styles.switchSelected]}><Text style={[styles.switchText, !createAccount && styles.switchTextActive]}>登入</Text></Pressable><Pressable onPress={() => { setCreateAccount(true); setMessage(''); }} style={[styles.switchItem, createAccount && styles.switchSelected]}><Text style={[styles.switchText, createAccount && styles.switchTextActive]}>建立帳號</Text></Pressable></View>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" autoComplete="email" />
      <Field label="密碼" value={password} onChangeText={setPassword} secureTextEntry placeholder="至少 8 個字元" autoComplete={createAccount ? 'new-password' : 'password'} />
      {createAccount ? <View style={{ gap: 12 }}>
        <View style={styles.notice}><Text style={styles.noticeTitle}>測試版資料使用說明（v1）</Text><Text style={styles.checkCopy}>僅供年滿 18 歲的受邀情侶試用。帳號資料用於登入，並記錄成年確認與本說明的同意版本及時間；配對後，行程、重要日期、日記、留言與心情會與伴侶共享，並存放於測試版 Supabase 專案。資料區域：{testDataRegion || '尚未設定'}。保存安排：{testRetention || '尚未設定'}。預覽資料只留在本機。不要輸入敏感內容；需要移除測試資料時請聯絡測試負責人。此版本尚無自助刪除帳號功能。</Text></View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: consent, disabled: busy }} accessibilityLabel="我已閱讀並同意以上資料使用說明" disabled={busy} onPress={() => setConsent(!consent)} style={styles.checkRow}><Text style={styles.check}>{consent ? '✓' : ''}</Text><Text style={styles.checkCopy}>我已閱讀並同意以上資料使用說明。</Text></Pressable>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: adult, disabled: busy }} accessibilityLabel="我確認已年滿 18 歲" disabled={busy} onPress={() => setAdult(!adult)} style={styles.checkRow}><Text style={styles.check}>{adult ? '✓' : ''}</Text><Text style={styles.checkCopy}>我確認已年滿 18 歲。</Text></Pressable>
      </View> : null}
      {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
      {createAccount && configured && !noticeConfigured ? <Text style={styles.note}>測試負責人尚未設定資料區域與保存期間，目前先停用帳號註冊。</Text> : null}
      <Button onPress={submit} disabled={busy || !configured || (createAccount && !noticeConfigured)}>{busy ? '請稍候…' : createAccount ? '建立帳號' : '登入'}</Button>
      {!configured ? <Text style={styles.note}>雲端同步尚未設定，可先進入本機預覽。預覽資料不會同步，也請勿輸入真實個資。</Text> : null}
      <Button variant="secondary" onPress={async () => { await enterPreview(); router.replace('/(tabs)'); }}>先看預覽</Button>
    </Card>
    <Text style={styles.footer}>私密、溫柔，剛剛好的陪伴。</Text>
  </Page>;
}

const styles = StyleSheet.create({
  page: { maxWidth: 520, width: '100%', alignSelf: 'center', paddingTop: 26 }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background },
  brandBlock: { alignItems: 'center', gap: 7 }, logo: { width: 50, height: 50, borderRadius: 18, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginBottom: 3 }, logoText: { color: 'white', fontSize: 28 },
  brand: { fontSize: 28, color: colors.ink, fontWeight: '800' }, brandLine: { fontSize: 14, color: colors.muted }, art: { width: '100%', minHeight: 106, borderRadius: 24, backgroundColor: colors.yellow, marginTop: 12, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, artEmoji: { fontSize: 24 }, artCopy: { color: colors.ink, fontSize: 16, lineHeight: 24, fontWeight: '700', textAlign: 'right' },
  authCard: { marginTop: 3, gap: 15 }, switcher: { flexDirection: 'row', borderRadius: 13, padding: 4, backgroundColor: colors.background }, switchItem: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }, switchSelected: { backgroundColor: colors.surface }, switchText: { fontSize: 14, fontWeight: '600', color: colors.muted }, switchTextActive: { color: colors.green },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, check: { width: 21, height: 21, borderRadius: 7, borderWidth: 1, borderColor: colors.green, color: colors.green, textAlign: 'center', overflow: 'hidden' }, checkCopy: { flex: 1, color: colors.ink, fontSize: 12, lineHeight: 18 }, notice: { backgroundColor: colors.background, borderRadius: 13, padding: 12, gap: 6 }, noticeTitle: { color: colors.ink, fontWeight: '700', fontSize: 12 }, message: { color: colors.danger, lineHeight: 19, fontSize: 13 }, note: { color: colors.muted, fontSize: 12, lineHeight: 18 }, footer: { textAlign: 'center', color: colors.muted, fontSize: 12, paddingBottom: 5 },
});
