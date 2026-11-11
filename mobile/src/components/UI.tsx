import React, { PropsWithChildren } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, PressableProps, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextStyle, useWindowDimensions, View, ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../lib/theme';

export function Page({ children, contentStyle }: PropsWithChildren<{ contentStyle?: StyleProp<ViewStyle> }>) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}><ScrollView contentContainerStyle={[styles.page, { paddingHorizontal: width < 360 ? 16 : 24, paddingBottom: Math.max(32, insets.bottom + 16) }, contentStyle]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">{children}</ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
export function Heading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return <View style={styles.heading}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text accessibilityRole="header" style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>;
}
export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) { return <View style={[styles.card, style]}>{children}</View>; }
export function Button({ children, variant = 'primary', style, loading = false, disabled, accessibilityState, ...props }: PressableProps & { children: React.ReactNode; variant?: 'primary' | 'secondary' | 'quiet'; style?: StyleProp<ViewStyle>; loading?: boolean }) {
  const inactive = Boolean(disabled || loading);
  return <Pressable accessibilityRole="button" disabled={inactive} accessibilityState={{ ...accessibilityState, disabled: inactive, busy: loading }} style={({ pressed }) => [styles.button, styles[`button_${variant}`], inactive && styles.disabled, pressed && styles.pressed, style]} {...props}>{loading ? <ActivityIndicator color={variant === 'primary' ? colors.white : colors.green} /> : null}<Text style={[styles.buttonText, variant !== 'primary' && styles.buttonTextSecondary]}>{children}</Text></Pressable>;
}
export function Field({ label, helper, style, inputStyle, ...props }: Omit<TextInputProps, 'style'> & { label: string; helper?: string; style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle> }) {
  return <View style={[styles.fieldWrap, style]}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} accessibilityHint={helper} placeholderTextColor={colors.muted} style={[styles.input, inputStyle]} {...props} />{helper ? <Text style={styles.helper}>{helper}</Text> : null}</View>;
}
export function Tag({ children }: PropsWithChildren) { return <View style={styles.tag}><Text style={styles.tagText}>{children}</Text></View>; }

const styles = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: colors.background }, page: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32, gap: 16, flexGrow: 1, width: '100%', maxWidth: 840, alignSelf: 'center' },
  heading: { gap: 5, marginBottom: 2 }, eyebrow: { color: colors.green, letterSpacing: 1.6, fontWeight: '700', fontSize: 11 },
  title: { fontSize: 29, lineHeight: 36, color: colors.ink, fontWeight: '700' }, subtitle: { fontSize: 14, lineHeight: 21, color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 12 },
  button: { minHeight: 48, minWidth: 48, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 15, justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 8, maxWidth: '100%' }, disabled: { opacity: 0.55 },
  button_primary: { backgroundColor: colors.green }, button_secondary: { backgroundColor: colors.greenLight }, button_quiet: { backgroundColor: 'transparent' },
  buttonText: { fontSize: 16, lineHeight: 24, fontWeight: '700', color: colors.white, textAlign: 'center', flexShrink: 1 }, buttonTextSecondary: { color: colors.green }, pressed: { opacity: 0.78 },
  fieldWrap: { gap: 7, minWidth: 0 }, label: { color: colors.ink, fontSize: 14, lineHeight: 21, fontWeight: '600' },
  input: { backgroundColor: colors.surface, borderColor: colors.controlBorder, borderWidth: 1, borderRadius: 14, minHeight: 52, paddingHorizontal: 14, paddingVertical: 12, color: colors.ink, fontSize: 16, lineHeight: 24, minWidth: 0 }, helper: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.greenLight, maxWidth: '100%', flexShrink: 1 }, tagText: { color: colors.green, fontWeight: '700', fontSize: 14, lineHeight: 21, flexShrink: 1 },
});
