import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { Text, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../lib/theme';
import { useApp } from '../../context/useApp';
import { Page } from '../../components/UI';
import { LoadingState } from '../../components/Feedback';

const icons: Record<string, string> = { index: '⌂', calendar: '▦', dates: '♡', diary: '✎', profile: '☺' };
const labels: Record<string, string> = { index: '今天', calendar: '行程', dates: '紀念日', diary: '日記', profile: '我的' };
export default function TabLayout() {
  const { ready, session, isPreview, pairingStatus } = useApp();
  const { fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  if (!ready || pairingStatus === 'loading') return <Page><LoadingState message="正在讀取帳號與配對狀態…" /></Page>;
  if (!session && !isPreview) return <Redirect href="/" />;
  if (!isPreview && pairingStatus !== 'paired') return <Redirect href="/pair" />;
  return <Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: colors.muted, tabBarAccessibilityLabel: labels[route.name], tabBarAllowFontScaling: true, tabBarLabelPosition: 'below-icon', tabBarLabel: ({ color }) => <Text style={{ color, fontSize: 13, lineHeight: 20, fontWeight: '600', textAlign: 'center', flexShrink: 1 }}>{labels[route.name]}</Text>, tabBarIcon: ({ color }) => <Text accessible={false} importantForAccessibility="no" style={{ color, fontSize: 20 }}>{icons[route.name]}</Text>, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: Math.max(72, 72 + Math.ceil((fontScale - 1) * 88)) + insets.bottom, paddingTop: 6, paddingBottom: Math.max(8, insets.bottom) }, tabBarLabelStyle: { fontSize: 13, fontWeight: '600' }, sceneStyle: { backgroundColor: colors.background } })}>
    <Tabs.Screen name="index" /><Tabs.Screen name="calendar" /><Tabs.Screen name="dates" /><Tabs.Screen name="diary" /><Tabs.Screen name="profile" />
  </Tabs>;
}
