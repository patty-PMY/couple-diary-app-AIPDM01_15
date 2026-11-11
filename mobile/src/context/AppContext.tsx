import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Session } from '@supabase/supabase-js';
import React, { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { PairingStatus, pairingError, validateInvite } from '../lib/pairing';
import { Anniversary, CalendarEvent, CoupleData, DiaryComment, DiaryEntry, MoodEntry } from '../lib/models';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { validateEmail, validateSignup } from '../lib/validation';
import { AppContext } from './app-context';

const PREVIEW_KEY = 'our-days-preview-data-v1';
const PREVIEW_COUPLE = 'our-days-preview-couple';
const CONSENT_VERSION = 'v1';

type SignupConfirmation = {
  adultConfirmed: boolean;
  consentAccepted: boolean;
};

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function previewSeed(): CoupleData {
  const today = new Date();
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);
  const anniversary = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 12);
  return {
    coupleId: PREVIEW_COUPLE,
    events: [{
      id: 'preview-event-1', couple_id: PREVIEW_COUPLE, created_by: 'you', title: '一起吃晚餐',
      starts_at: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 18, 30).toISOString(),
      ends_at: null, timezone: 'Asia/Taipei', created_at: new Date().toISOString(),
    }],
    anniversaries: [{
      id: 'preview-date-1', couple_id: PREVIEW_COUPLE, created_by: 'you', title: '我們的紀念日',
      event_date: `${anniversary.getFullYear()}-${String(anniversary.getMonth() + 1).padStart(2, '0')}-${String(anniversary.getDate()).padStart(2, '0')}`,
      repeats_yearly: true, reminder_enabled: true, reminder_days_before: 1, created_at: new Date().toISOString(),
    }],
    diaries: [{
      id: 'preview-diary-1', couple_id: PREVIEW_COUPLE, created_by: 'partner',
      body: '今天路上看到一整排盛開的花，第一個想到的就是你。下次一起來散步吧 🌼',
      created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    }],
    comments: [{
      id: 'preview-comment-1', couple_id: PREVIEW_COUPLE, diary_id: 'preview-diary-1', created_by: 'you',
      body: '好呀，這週末一起去！', created_at: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    }],
    moods: [{
      id: 'preview-mood-1', couple_id: PREVIEW_COUPLE, created_by: 'partner', mood: 'happy', created_at: new Date().toISOString(),
    }],
  };
}

async function scheduleReminder(title: string, eventDate: string, daysBefore: number, repeatsYearly: boolean) {
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== 'granted') return;
  const [year, month, day] = eventDate.split('-').map(Number);
  const now = new Date();
  let targetYear = year;
  if (repeatsYearly) {
    targetYear = now.getFullYear();
    const occurrence = new Date(targetYear, month - 1, day);
    if (occurrence < new Date(now.getFullYear(), now.getMonth(), now.getDate())) targetYear += 1;
  }
  const reminderDate = new Date(targetYear, month - 1, day - daysBefore, 9, 0, 0);
  if (reminderDate <= now) return;
  const content = { title: '重要日子快到了', body: `${title} · ${eventDate}`, data: { scope: 'our-days-anniversary' } };
  if (repeatsYearly) {
    await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.YEARLY, month: reminderDate.getMonth() + 1, day: reminderDate.getDate(), hour: 9, minute: 0 } });
  } else {
    await Notifications.scheduleNotificationAsync({ content, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate } });
  }
}

export type AppContextValue = {
  session: Session | null;
  ready: boolean;
  isPreview: boolean;
  configured: boolean;
  noticeConfigured: boolean;
  testDataRegion: string;
  testRetention: string;
  coupleId: string | null;
  pairingStatus: PairingStatus;
  events: CalendarEvent[];
  anniversaries: Anniversary[];
  diaries: DiaryEntry[];
  comments: DiaryComment[];
  moods: MoodEntry[];
  error: string | null;
  clearError: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, confirmation: SignupConfirmation) => Promise<void>;
  signOut: () => Promise<void>;
  enterPreview: () => Promise<void>;
  createInvite: () => Promise<string>;
  acceptInvite: (token: string) => Promise<void>;
  refresh: () => Promise<void>;
  createEvent: (title: string, startsAt: string) => Promise<void>;
  createAnniversary: (title: string, eventDate: string, repeatsYearly: boolean, reminderEnabled: boolean) => Promise<void>;
  createDiary: (body: string) => Promise<void>;
  createComment: (diaryId: string, body: string) => Promise<void>;
  createMood: (mood: MoodEntry['mood']) => Promise<void>;
};

export function AppProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [data, setData] = useState<CoupleData | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<PairingStatus>('loading');
  const identity = useRef<string | null>(null);
  const refreshVersion = useRef(0);

  const refresh = useCallback(async () => {
    const owner = isPreview ? 'preview' : session?.user.id ?? null;
    if (identity.current !== owner) return;
    const version = ++refreshVersion.current;
    const current = () => version === refreshVersion.current && identity.current === owner;
    try {
    if (isPreview) {
      const saved = await AsyncStorage.getItem(PREVIEW_KEY);
      if (current()) { setData(saved ? JSON.parse(saved) as CoupleData : previewSeed()); setPairingStatus('paired'); }
      return;
    }
    if (!supabase || !session) {
      setData(null);
      setPairingStatus('unpaired');
      return;
    }
    const membership = await supabase.rpc('get_pairing_status').maybeSingle<{ couple_id: string; member_count: number }>();
    if (!current()) return;
    if (membership.error) throw membership.error;
    if (!membership.data) {
      setData(null);
      setPairingStatus('unpaired');
      setError(null);
      return;
    }
    if (Number(membership.data.member_count) !== 2) {
      setData(null);
      setPairingStatus('pending');
      setError(null);
      return;
    }
    const coupleId = membership.data.couple_id as string;
    const [events, anniversaries, reminders, diaries, comments, moods] = await Promise.all([
      supabase.from('calendar_events').select('*').eq('couple_id', coupleId).order('starts_at', { ascending: true }),
      supabase.from('anniversary_dates').select('*').eq('couple_id', coupleId).order('event_date', { ascending: true }),
      supabase.from('anniversary_reminders').select('anniversary_id').eq('user_id', session.user.id),
      supabase.from('diary_entries').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }),
      supabase.from('diary_comments').select('*').eq('couple_id', coupleId).order('created_at', { ascending: true }),
      supabase.from('mood_entries').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }),
    ]);
    const result = [events, anniversaries, reminders, diaries, comments, moods].find((response) => response.error);
    if (!current()) return;
    if (result?.error) throw result.error;
    setData({
      coupleId,
      events: events.data ?? [], anniversaries: (anniversaries.data ?? []).map((row) => ({ ...row, reminder_enabled: (reminders.data ?? []).some((reminder) => reminder.anniversary_id === row.id), reminder_days_before: 1 })), diaries: diaries.data ?? [],
      comments: comments.data ?? [], moods: moods.data ?? [],
    } as CoupleData);
    setPairingStatus('paired');
    setError(null);
    } catch (reason) {
      if (!current()) return;
      setData(null);
      setPairingStatus('error');
      setError('無法讀取配對狀態，請確認網路後重試。');
      throw reason;
    }
  }, [isPreview, session]);

  useEffect(() => {
    let alive = true;
    let authRevision = 0;
    async function init() {
      if (!supabase) {
        setReady(true);
        return;
      }
      const revision = authRevision;
      const { data: result, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (alive && revision === authRevision) { identity.current = result.session?.user.id ?? null; setSession(result.session); }
      if (alive) setReady(true);
    }
    void init().catch((reason) => { setError(reason instanceof Error ? reason.message : '無法讀取登入狀態'); setReady(true); });
    const { data: listener } = supabase?.auth.onAuthStateChange((_event, nextSession) => {
      ++authRevision;
      if (identity.current !== (nextSession?.user.id ?? null)) {
        identity.current = nextSession?.user.id ?? null;
        ++refreshVersion.current;
        setData(null);
        setPairingStatus(nextSession ? 'loading' : 'unpaired');
      }
      setSession(nextSession);
      setIsPreview(false);
      setError(null);
    }) ?? { data: { subscription: { unsubscribe: () => undefined } } };
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!ready) return;
    void refresh().catch(() => undefined);
  }, [ready, refresh]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active' && ready) void refresh().catch(() => undefined);
    });
    return () => listener.remove();
  }, [ready, refresh]);

  const persistPreview = useCallback(async (next: CoupleData) => {
    setData(next);
    await AsyncStorage.setItem(PREVIEW_KEY, JSON.stringify(next));
  }, []);

  const requirePair = useCallback(() => {
    if (!data?.coupleId || pairingStatus !== 'paired' || identity.current !== (isPreview ? 'preview' : session?.user.id)) throw new Error('請先完成伴侶配對。');
    return data.coupleId;
  }, [data?.coupleId, pairingStatus, isPreview, session?.user.id]);
  const actorId = session?.user.id ?? 'you';

  const value = useMemo<AppContextValue>(() => ({
    session, ready, isPreview, configured: isSupabaseConfigured,
    noticeConfigured: Boolean(process.env.EXPO_PUBLIC_TEST_DATA_REGION?.trim() && process.env.EXPO_PUBLIC_TEST_RETENTION?.trim()),
    testDataRegion: process.env.EXPO_PUBLIC_TEST_DATA_REGION?.trim() ?? '',
    testRetention: process.env.EXPO_PUBLIC_TEST_RETENTION?.trim() ?? '',
    coupleId: data?.coupleId ?? null, pairingStatus,
    events: data?.events ?? [], anniversaries: data?.anniversaries ?? [], diaries: data?.diaries ?? [],
    comments: data?.comments ?? [], moods: data?.moods ?? [], error,
    clearError: () => setError(null),
    signIn: async (email, password) => {
      if (!supabase) throw new Error('尚未設定 Supabase。');
      const emailError = validateEmail(email);
      if (emailError) throw new Error(emailError);
      if (!password) throw new Error('請輸入密碼。');
      const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
    },
    signUp: async (email, password, confirmation) => {
      if (!supabase) throw new Error('尚未設定 Supabase。');
      const emailError = validateEmail(email);
      if (emailError) throw new Error(emailError);
      if (password.length < 8) throw new Error('密碼至少 8 個字元。');
      const signupError = validateSignup(
        confirmation.consentAccepted,
        confirmation.adultConfirmed,
        process.env.EXPO_PUBLIC_TEST_DATA_REGION ?? '',
        process.env.EXPO_PUBLIC_TEST_RETENTION ?? '',
      );
      if (signupError) throw new Error(signupError);
      const { error: authError } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: {
          data: {
            adult_confirmed: confirmation.adultConfirmed,
            consent_accepted: confirmation.consentAccepted,
            consent_version: CONSENT_VERSION,
            consent_at: new Date().toISOString(),
          },
        },
      });
      if (authError) throw authError;
    },
    signOut: async () => {
      if (isPreview) {
        setIsPreview(false);
        setData(null);
        identity.current = null;
        ++refreshVersion.current;
        setPairingStatus('unpaired');
        return;
      }
      if (supabase) {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
        if (signOutError) throw new Error('登出失敗，請確認網路後再試。');
      }
      identity.current = null;
      ++refreshVersion.current;
      setSession(null); setData(null); setPairingStatus('unpaired'); setError(null);
    },
    enterPreview: async () => {
      identity.current = 'preview';
      ++refreshVersion.current;
      setSession(null);
      setIsPreview(true);
      const saved = await AsyncStorage.getItem(PREVIEW_KEY);
      const preview = saved ? JSON.parse(saved) as CoupleData : previewSeed();
      setData(preview);
      setPairingStatus('paired');
      if (!saved) await AsyncStorage.setItem(PREVIEW_KEY, JSON.stringify(preview));
    },
    createInvite: async () => {
      if (isPreview || !supabase || !session) throw new Error('請先登入再建立配對邀請。');
      const { data: token, error: rpcError } = await supabase.rpc('create_couple_invite');
      if (rpcError) throw new Error(pairingError(rpcError));
      if (identity.current !== session.user.id) throw new Error('帳號已切換，請重新登入後確認配對狀態。');
      ++refreshVersion.current;
      setData(null); setPairingStatus('pending');
      return token as string;
    },
    acceptInvite: async (token) => {
      if (isPreview || !supabase || !session) throw new Error('請先登入再接受配對邀請。');
      const invalid = validateInvite(token);
      if (invalid) throw new Error(invalid);
      const { error: rpcError } = await supabase.rpc('accept_couple_invite', { invite_token: token.trim() });
      if (rpcError) throw new Error(pairingError(rpcError));
      if (identity.current !== session.user.id) return;
      try { await refresh(); } catch { throw new Error('配對已完成，但共享內容載入失敗。請重新整理配對狀態。'); }
    },
    refresh,
    createEvent: async (title, startsAt) => {
      const coupleId = requirePair();
      const record = { id: id(), couple_id: coupleId, created_by: actorId, title: title.trim(), starts_at: new Date(startsAt).toISOString(), ends_at: null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei', created_at: new Date().toISOString() };
      if (isPreview) return persistPreview({ ...data!, events: [...data!.events, record].sort((a, b) => a.starts_at.localeCompare(b.starts_at)) });
      if (!supabase) throw new Error('尚未連接資料服務。');
      const { error: saveError } = await supabase.from('calendar_events').insert({ ...record, id: undefined });
      if (saveError) throw saveError;
      await refresh();
    },
    createAnniversary: async (title, eventDate, repeatsYearly, reminderEnabled) => {
      const coupleId = requirePair();
      const record = { id: id(), couple_id: coupleId, created_by: actorId, title: title.trim(), event_date: eventDate, repeats_yearly: repeatsYearly, reminder_enabled: reminderEnabled, reminder_days_before: 1, created_at: new Date().toISOString() };
      if (isPreview) return persistPreview({ ...data!, anniversaries: [...data!.anniversaries, record].sort((a, b) => a.event_date.localeCompare(b.event_date)) });
      if (!supabase) throw new Error('尚未連接資料服務。');
      const { data: saved, error: saveError } = await supabase.from('anniversary_dates').insert({ couple_id: coupleId, created_by: actorId, title: title.trim(), event_date: eventDate, repeats_yearly: repeatsYearly }).select('id').single();
      if (saveError) throw saveError;
      if (reminderEnabled && saved?.id) {
        const { error: reminderError } = await supabase.from('anniversary_reminders').insert({ anniversary_id: saved.id, couple_id: coupleId, user_id: actorId, days_before: 1 });
        if (reminderError) throw reminderError;
        await scheduleReminder(title.trim(), eventDate, 1, repeatsYearly);
      }
      await refresh();
    },
    createDiary: async (body) => {
      const coupleId = requirePair();
      const record = { id: id(), couple_id: coupleId, created_by: actorId, body: body.trim(), created_at: new Date().toISOString() };
      if (isPreview) return persistPreview({ ...data!, diaries: [record, ...data!.diaries] });
      if (!supabase) throw new Error('尚未連接資料服務。');
      const { error: saveError } = await supabase.from('diary_entries').insert({ couple_id: coupleId, created_by: actorId, body: body.trim() });
      if (saveError) throw saveError;
      await refresh();
    },
    createComment: async (diaryId, body) => {
      const coupleId = requirePair();
      const record = { id: id(), couple_id: coupleId, diary_id: diaryId, created_by: actorId, body: body.trim(), created_at: new Date().toISOString() };
      if (isPreview) return persistPreview({ ...data!, comments: [...data!.comments, record] });
      if (!supabase) throw new Error('尚未連接資料服務。');
      const { error: saveError } = await supabase.from('diary_comments').insert({ couple_id: coupleId, diary_id: diaryId, created_by: actorId, body: body.trim() });
      if (saveError) throw saveError;
      await refresh();
    },
    createMood: async (mood) => {
      const coupleId = requirePair();
      const record: MoodEntry = { id: id(), couple_id: coupleId, created_by: actorId, mood, created_at: new Date().toISOString() };
      if (isPreview) return persistPreview({ ...data!, moods: [record, ...data!.moods] });
      if (!supabase) throw new Error('尚未連接資料服務。');
      const { error: saveError } = await supabase.from('mood_entries').insert({ couple_id: coupleId, created_by: actorId, mood });
      if (saveError) throw saveError;
      await refresh();
    },
  }), [session, ready, isPreview, data, pairingStatus, error, refresh, persistPreview, actorId, requirePair]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
