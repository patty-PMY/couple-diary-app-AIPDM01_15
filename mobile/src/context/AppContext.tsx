import AsyncStorage from '@react-native-async-storage/async-storage';
import { Session } from '@supabase/supabase-js';
import React, { PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { PairingStatus, pairingError, validateInvite } from '../lib/pairing';
import { Anniversary, CalendarEvent, CoupleData, DiaryComment, DiaryEntry, MoodEntry } from '../lib/models';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { validateEmail, validateSignup, validateText } from '../lib/validation';
import { AppContext } from './app-context';
import { validateEvent } from '../lib/calendar';
import { validateAnniversary } from '../lib/anniversaries';
import { requestReminderPermission, syncReminders } from '../lib/reminders';
import { registerAnnualPushDevice, unregisterAnnualPushDevice } from '../lib/annual-push';
import { applyJournalChange, JournalOperation, JournalRecord, JournalTable, validateMood } from '../lib/journal';

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
  createEvent: (title: string, startsAt: string, timezone?: string) => Promise<void>;
  updateEvent: (eventId: string, title: string, startsAt: string, timezone: string) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<void>;
  createAnniversary: (title: string, eventDate: string, repeatsYearly: boolean, reminderEnabled: boolean) => Promise<void>;
  updateAnniversary: (anniversaryId: string, title: string, eventDate: string, repeatsYearly: boolean) => Promise<void>;
  deleteAnniversary: (anniversaryId: string) => Promise<void>;
  setAnniversaryReminder: (anniversaryId: string, enabled: boolean, daysBefore: number) => Promise<void>;
  reminderNotice: string | null;
  createDiary: (body: string) => Promise<void>;
  createComment: (diaryId: string, body: string) => Promise<void>;
  createMood: (mood: MoodEntry['mood']) => Promise<void>;
  updateDiary: (diaryId: string, body: string) => Promise<void>;
  deleteDiary: (diaryId: string) => Promise<void>;
  updateComment: (commentId: string, body: string) => Promise<void>;
  deleteComment: (commentId: string) => Promise<void>;
  updateMood: (moodId: string, mood: MoodEntry['mood']) => Promise<void>;
  deleteMood: (moodId: string) => Promise<void>;
};

export function AppProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isPreview, setIsPreview] = useState(false);
  const [data, setData] = useState<CoupleData | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);
  const [pairingStatus, setPairingStatus] = useState<PairingStatus>('loading');
  const identity = useRef<string | null>(null);
  const refreshVersion = useRef(0);
  const pushSuspended = useRef(false);

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
      supabase.from('anniversary_reminders').select('anniversary_id, days_before').eq('user_id', session.user.id).eq('couple_id', coupleId),
      supabase.from('diary_entries').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }),
      supabase.from('diary_comments').select('*').eq('couple_id', coupleId).order('created_at', { ascending: true }),
      supabase.from('mood_entries').select('*').eq('couple_id', coupleId).order('created_at', { ascending: false }),
    ]);
    const result = [events, anniversaries, reminders, diaries, comments, moods].find((response) => response.error);
    if (!current()) return;
    if (result?.error) throw result.error;
    setData({
      coupleId,
      events: events.data ?? [], anniversaries: (anniversaries.data ?? []).map((row) => {
        const reminder = (reminders.data ?? []).find((item) => item.anniversary_id === row.id);
        return { ...row, reminder_enabled: Boolean(reminder), reminder_days_before: reminder?.days_before ?? 1 };
      }), diaries: diaries.data ?? [],
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
        void syncReminders(nextSession?.user.id ?? null, nextSession ? null : []).catch(() => setReminderNotice('無法清除舊帳號的通知，請關閉系統通知並重新登入後重試。'));
        identity.current = nextSession?.user.id ?? null;
        ++refreshVersion.current;
        setData(null);
        setPairingStatus(nextSession ? 'loading' : 'unpaired');
      }
      setSession(nextSession);
      if (nextSession) pushSuspended.current = false;
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
    if (!ready) return;
    let active = true;
    const owner = !isPreview ? session?.user.id ?? null : null;
    const items = owner && (pairingStatus === 'loading' || pairingStatus === 'error') ? null : owner && pairingStatus === 'paired' ? data?.anniversaries ?? [] : [];
    void (async () => {
      const notice = await syncReminders(owner, items);
      if (active && !pushSuspended.current && owner && items?.some((item) => item.repeats_yearly && item.reminder_enabled)) await registerAnnualPushDevice(owner);
      return notice;
    })().then((notice) => {
      if (active) setReminderNotice(notice);
    }).catch((reason) => {
      if (active) setReminderNotice(reason instanceof Error ? reason.message : '提醒排程同步失敗。日期已保留，請重新整理以重試提醒。');
    });
    return () => { active = false; };
  }, [ready, isPreview, session?.user.id, pairingStatus, data?.anniversaries]);

  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active' && ready) void refresh().catch(() => undefined);
    });
    return () => listener.remove();
  }, [ready, refresh]);

  const persistPreview = useCallback(async (next: CoupleData) => {
    const owner = identity.current;
    await AsyncStorage.setItem(PREVIEW_KEY, JSON.stringify(next));
    if (identity.current === owner) setData(next);
  }, []);

  const requirePair = useCallback(() => {
    if (!data?.coupleId || pairingStatus !== 'paired' || identity.current !== (isPreview ? 'preview' : session?.user.id)) throw new Error('請先完成伴侶配對。');
    return data.coupleId;
  }, [data?.coupleId, pairingStatus, isPreview, session?.user.id]);
  const actorId = session?.user.id ?? 'you';

  const mutateJournal = useCallback(async (table: JournalTable, operation: JournalOperation, recordId: string | null, changes: { body?: string; mood?: MoodEntry['mood']; diary_id?: string }) => {
    const coupleId = requirePair();
    const key = table === 'diary_entries' ? 'diaries' : table === 'diary_comments' ? 'comments' : 'moods';
    const previous = recordId ? data?.[key].find((item) => item.id === recordId) : null;
    if (operation !== 'create' && !previous) throw new Error('這筆內容已不存在，請重新整理。');
    if (table === 'diary_comments' && operation === 'create' && !data?.diaries.some((entry) => entry.id === changes.diary_id)) throw new Error('日記已不存在，請重新整理。');
    if (operation !== 'delete') {
      const invalid = table === 'mood_entries' ? validateMood(changes.mood ?? '') : validateText(changes.body ?? '', table === 'diary_entries' ? 500 : 100);
      if (invalid) throw new Error(invalid);
    }
    const record = { ...(previous ?? { id: id(), couple_id: coupleId, created_by: actorId, created_at: new Date().toISOString() }), ...changes } as JournalRecord;
    if (isPreview) return persistPreview(applyJournalChange(data!, table, operation, record));
    if (!supabase) throw new Error('尚未連接資料服務。');
    const query = supabase.from(table);
    const response = operation === 'create'
      ? await query.insert({ ...changes, couple_id: coupleId, created_by: actorId }).select('*').single()
      : operation === 'update'
        ? await query.update(changes).eq('id', recordId!).eq('couple_id', coupleId).select('*').single()
        : await query.delete().eq('id', recordId!).eq('couple_id', coupleId).select('*').single();
    if (response.error || !response.data) throw new Error('內容儲存失敗，請確認網路、配對狀態及內容是否仍存在後重試。');
    if (identity.current !== actorId) return;
    ++refreshVersion.current;
    setData((current) => current?.coupleId === coupleId ? applyJournalChange(current, table, operation, response.data as JournalRecord) : current);
  }, [actorId, data, isPreview, persistPreview, requirePair]);

  const value = useMemo<AppContextValue>(() => ({
    session, ready, isPreview, configured: isSupabaseConfigured,
    noticeConfigured: Boolean(process.env.EXPO_PUBLIC_TEST_DATA_REGION?.trim() && process.env.EXPO_PUBLIC_TEST_RETENTION?.trim()),
    testDataRegion: process.env.EXPO_PUBLIC_TEST_DATA_REGION?.trim() ?? '',
    testRetention: process.env.EXPO_PUBLIC_TEST_RETENTION?.trim() ?? '',
    coupleId: data?.coupleId ?? null, pairingStatus,
    events: data?.events ?? [], anniversaries: data?.anniversaries ?? [], diaries: data?.diaries ?? [],
    comments: data?.comments ?? [], moods: data?.moods ?? [], error, reminderNotice,
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
      pushSuspended.current = true;
      try {
      if (!isPreview) await unregisterAnnualPushDevice();
      await syncReminders(null, []);
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
      } catch (reason) { pushSuspended.current = false; throw reason; }
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
    createEvent: async (title, startsAt, timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Taipei') => {
      const coupleId = requirePair();
      const invalid = validateEvent(title, startsAt, timezone);
      if (invalid) throw new Error(invalid);
      const record = { id: id(), couple_id: coupleId, created_by: actorId, title: title.trim(), starts_at: new Date(startsAt).toISOString(), ends_at: null, timezone, created_at: new Date().toISOString() };
      if (isPreview) return persistPreview({ ...data!, events: [...data!.events, record].sort((a, b) => a.starts_at.localeCompare(b.starts_at)) });
      if (!supabase) throw new Error('尚未連接資料服務。');
      const { error: saveError } = await supabase.from('calendar_events').insert({ ...record, id: undefined });
      if (saveError) throw saveError;
      await refresh();
    },
    updateEvent: async (eventId, title, startsAt, timezone) => {
      const coupleId = requirePair();
      const invalid = validateEvent(title, startsAt, timezone);
      if (invalid) throw new Error(invalid);
      if (!data?.events.some((event) => event.id === eventId)) throw new Error('行程已不存在，請重新整理。');
      const changes = { title: title.trim(), starts_at: new Date(startsAt).toISOString(), timezone };
      if (isPreview) return persistPreview({ ...data!, events: data!.events.map((event) => event.id === eventId ? { ...event, ...changes } : event) });
      if (!supabase) throw new Error('尚未連接資料服務。');
      const { data: saved, error: saveError } = await supabase.from('calendar_events').update(changes).eq('id', eventId).eq('couple_id', coupleId).select('id').single();
      if (saveError || !saved) throw new Error('無法更新行程，請確認網路及配對狀態後重試。');
      await refresh();
    },
    deleteEvent: async (eventId) => {
      const coupleId = requirePair();
      if (isPreview) return persistPreview({ ...data!, events: data!.events.filter((event) => event.id !== eventId) });
      if (!supabase) throw new Error('尚未連接資料服務。');
      const { data: deleted, error: deleteError } = await supabase.from('calendar_events').delete().eq('id', eventId).eq('couple_id', coupleId).select('id').single();
      if (deleteError || !deleted) throw new Error('無法刪除行程，請確認網路及配對狀態後重試。');
      await refresh();
    },
    createAnniversary: async (title, eventDate, repeatsYearly, reminderEnabled) => {
      const coupleId = requirePair();
      const invalid = validateAnniversary(title, eventDate);
      if (invalid) throw new Error(invalid);
      const record = { id: id(), couple_id: coupleId, created_by: actorId, title: title.trim(), event_date: eventDate, repeats_yearly: repeatsYearly, reminder_enabled: reminderEnabled, reminder_days_before: 1, created_at: new Date().toISOString() };
      if (isPreview) return persistPreview({ ...data!, anniversaries: [...data!.anniversaries, record].sort((a, b) => a.event_date.localeCompare(b.event_date)) });
      if (!supabase) throw new Error('尚未連接資料服務。');
      if (reminderEnabled) {
        const allowed = await requestReminderPermission();
        if (!allowed) throw new Error('通知權限未開啟。可關閉「提醒我」儲存日期，倒數仍可使用；或至系統設定允許通知。');
        if (repeatsYearly) await registerAnnualPushDevice(actorId, true);
      }
      requirePair();
      const { data: saved, error: saveError } = await supabase.rpc('create_anniversary', { date_title: title.trim(), date_value: eventDate, yearly: repeatsYearly, remind: reminderEnabled });
      if (saveError || !saved) throw new Error('儲存日期失敗，請確認網路及資料庫遷移後重試。');
      if (identity.current !== actorId) return;
      setData((current) => current?.coupleId === coupleId ? { ...current, anniversaries: [...current.anniversaries, { ...saved, reminder_enabled: reminderEnabled, reminder_days_before: 1 } as Anniversary] } : current);
    },
    updateAnniversary: async (anniversaryId, title, eventDate, repeatsYearly) => {
      const coupleId = requirePair();
      const invalid = validateAnniversary(title, eventDate);
      if (invalid) throw new Error(invalid);
      if (!data?.anniversaries.some((item) => item.id === anniversaryId)) throw new Error('日期已不存在，請重新整理。');
      const changes = { title: title.trim(), event_date: eventDate, repeats_yearly: repeatsYearly };
      if (isPreview) return persistPreview({ ...data!, anniversaries: data!.anniversaries.map((item) => item.id === anniversaryId ? { ...item, ...changes } : item) });
      if (!supabase) throw new Error('尚未連接資料服務。');
      if (repeatsYearly && data?.anniversaries.find((item) => item.id === anniversaryId)?.reminder_enabled) await registerAnnualPushDevice(actorId, true);
      requirePair();
      const { data: saved, error: saveError } = await supabase.from('anniversary_dates').update(changes).eq('id', anniversaryId).eq('couple_id', coupleId).select('*').single();
      if (saveError || !saved) throw new Error('更新日期失敗，請重新整理確認日期仍存在後再試。');
      if (identity.current !== actorId) return;
      setData((current) => current?.coupleId === coupleId ? { ...current, anniversaries: current.anniversaries.map((item) => item.id === anniversaryId ? { ...item, ...saved } : item) } : current);
    },
    deleteAnniversary: async (anniversaryId) => {
      const coupleId = requirePair();
      if (isPreview) return persistPreview({ ...data!, anniversaries: data!.anniversaries.filter((item) => item.id !== anniversaryId) });
      if (!supabase) throw new Error('尚未連接資料服務。');
      const { data: deleted, error: deleteError } = await supabase.from('anniversary_dates').delete().eq('id', anniversaryId).eq('couple_id', coupleId).select('id').single();
      if (deleteError || !deleted) throw new Error('刪除日期失敗，請重新整理確認日期仍存在後再試。');
      if (identity.current !== actorId) return;
      setData((current) => current?.coupleId === coupleId ? { ...current, anniversaries: current.anniversaries.filter((item) => item.id !== anniversaryId) } : current);
    },
    setAnniversaryReminder: async (anniversaryId, enabled, daysBefore) => {
      const coupleId = requirePair();
      if (!Number.isInteger(daysBefore) || daysBefore < 0 || daysBefore > 30) throw new Error('提醒需設定為提前 0 至 30 天。');
      if (!data?.anniversaries.some((item) => item.id === anniversaryId)) throw new Error('日期已不存在，請重新整理。');
      const changes = { reminder_enabled: enabled, reminder_days_before: daysBefore };
      if (isPreview) return persistPreview({ ...data!, anniversaries: data!.anniversaries.map((item) => item.id === anniversaryId ? { ...item, ...changes } : item) });
      if (!supabase) throw new Error('尚未連接資料服務。');
      if (enabled && !await requestReminderPermission()) throw new Error('通知權限未開啟。倒數仍可使用，請至系統設定允許通知後重試。');
      if (enabled && data?.anniversaries.find((item) => item.id === anniversaryId)?.repeats_yearly) await registerAnnualPushDevice(actorId, true);
      requirePair();
      const response = enabled
        ? await supabase.from('anniversary_reminders').upsert({ anniversary_id: anniversaryId, couple_id: coupleId, user_id: actorId, days_before: daysBefore }, { onConflict: 'anniversary_id,user_id' }).select('id').single()
        : await supabase.from('anniversary_reminders').delete().eq('anniversary_id', anniversaryId).eq('couple_id', coupleId).eq('user_id', actorId);
      if (response.error) throw new Error('更新提醒失敗，請確認網路後重試。');
      if (identity.current !== actorId) return;
      setData((current) => current?.coupleId === coupleId ? { ...current, anniversaries: current.anniversaries.map((item) => item.id === anniversaryId ? { ...item, ...changes } : item) } : current);
    },
    createDiary: (body) => mutateJournal('diary_entries', 'create', null, { body }),
    updateDiary: (diaryId, body) => mutateJournal('diary_entries', 'update', diaryId, { body }),
    deleteDiary: (diaryId) => mutateJournal('diary_entries', 'delete', diaryId, {}),
    createComment: (diaryId, body) => mutateJournal('diary_comments', 'create', null, { diary_id: diaryId, body }),
    updateComment: (commentId, body) => mutateJournal('diary_comments', 'update', commentId, { body }),
    deleteComment: (commentId) => mutateJournal('diary_comments', 'delete', commentId, {}),
    createMood: (mood) => mutateJournal('mood_entries', 'create', null, { mood }),
    updateMood: (moodId, mood) => mutateJournal('mood_entries', 'update', moodId, { mood }),
    deleteMood: (moodId) => mutateJournal('mood_entries', 'delete', moodId, {}),
  }), [session, ready, isPreview, data, pairingStatus, error, reminderNotice, refresh, persistPreview, actorId, requirePair, mutateJournal]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
