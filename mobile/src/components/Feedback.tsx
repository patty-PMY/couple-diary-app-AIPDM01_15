import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';
import { Button, Card } from './UI';

export function Notice({ message, tone = 'info' }: { message: string; tone?: 'info' | 'success' | 'error' }) {
  return <Text accessibilityRole={tone === 'error' ? 'alert' : undefined} accessibilityLiveRegion="polite" style={[styles.copy, tone === 'error' ? styles.error : tone === 'success' ? styles.success : undefined]}>{message}</Text>;
}
export function LoadingState({ message }: { message: string }) {
  return <View accessible accessibilityRole="progressbar" accessibilityLabel={message} accessibilityState={{ busy: true }} style={styles.loading}><ActivityIndicator color={colors.green} /><Text style={styles.copy}>{message}</Text></View>;
}
export function EmptyState({ title, message, actionLabel, onAction, disabled = false }: { title: string; message: string; actionLabel?: string; onAction?: () => void; disabled?: boolean }) {
  return <Card><Text accessibilityRole="header" style={styles.title}>{title}</Text><Text style={styles.copy}>{message}</Text>{actionLabel && onAction ? <Button disabled={disabled} variant="secondary" onPress={onAction}>{actionLabel}</Button> : null}</Card>;
}
const styles = StyleSheet.create({
  copy: { color: colors.ink, fontSize: 14, lineHeight: 22 },
  title: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  error: { color: colors.danger }, success: { color: colors.green },
  loading: { paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
});
