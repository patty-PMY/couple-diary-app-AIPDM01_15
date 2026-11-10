import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';
import { colors } from '../../lib/theme';

const icons: Record<string, string> = { index: '⌂', calendar: '▦', dates: '♡', diary: '✎', profile: '☺' };
const labels: Record<string, string> = { index: '今天', calendar: '行程', dates: '紀念日', diary: '日記', profile: '我的' };
export default function TabLayout() {
  return <Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: colors.green, tabBarInactiveTintColor: colors.muted, tabBarLabel: labels[route.name], tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>{icons[route.name]}</Text>, tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line, height: 64, paddingTop: 5, paddingBottom: 7 }, tabBarLabelStyle: { fontSize: 10, fontWeight: '600' }, sceneStyle: { backgroundColor: colors.background } })}>
    <Tabs.Screen name="index" /><Tabs.Screen name="calendar" /><Tabs.Screen name="dates" /><Tabs.Screen name="diary" /><Tabs.Screen name="profile" />
  </Tabs>;
}
