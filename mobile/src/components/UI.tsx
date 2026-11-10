import React, { PropsWithChildren } from 'react';
import { Pressable, PressableProps, ScrollView, StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../lib/theme';

export function Page({ children, contentStyle }: PropsWithChildren<{ contentStyle?: StyleProp<ViewStyle> }>) {
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={[styles.page, contentStyle]} keyboardShouldPersistTaps="handled">{children}</ScrollView></SafeAreaView>;
}
export function Heading({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return <View style={styles.heading}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>;
}
export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) { return <View style={[styles.card, style]}>{children}</View>; }
export function Button({ children, variant = 'primary', style, ...props }: PressableProps & { children: React.ReactNode; variant?: 'primary' | 'secondary' | 'quiet'; style?: StyleProp<ViewStyle> }) {
  return <Pressable accessibilityRole="button" style={({ pressed }) => [styles.button, styles[`button_${variant}`], pressed && styles.pressed, style]} {...props}><Text style={[styles.buttonText, variant !== 'primary' && styles.buttonTextSecondary]}>{children}</Text></Pressable>;
}
export function Field({ label, helper, style, ...props }: TextInputProps & { label: string; helper?: string; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.fieldWrap, style]}><Text style={styles.label}>{label}</Text><TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />{helper ? <Text style={styles.helper}>{helper}</Text> : null}</View>;
}
export function Tag({ children }: PropsWithChildren) { return <View style={styles.tag}><Text style={styles.tagText}>{children}</Text></View>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background }, page: { paddingHorizontal: 22, paddingTop: 14, paddingBottom: 34, gap: 16, flexGrow: 1 },
  heading: { gap: 5, marginBottom: 2 }, eyebrow: { color: colors.green, letterSpacing: 1.6, fontWeight: '700', fontSize: 11 },
  title: { fontSize: 29, lineHeight: 36, color: colors.ink, fontWeight: '700' }, subtitle: { fontSize: 14, lineHeight: 21, color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.line, padding: 18, gap: 12 },
  button: { minHeight: 48, paddingHorizontal: 17, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  button_primary: { backgroundColor: colors.green }, button_secondary: { backgroundColor: colors.greenLight }, button_quiet: { backgroundColor: 'transparent' },
  buttonText: { fontSize: 15, fontWeight: '700', color: colors.white }, buttonTextSecondary: { color: colors.green }, pressed: { opacity: 0.78 },
  fieldWrap: { gap: 7 }, label: { color: colors.ink, fontSize: 13, fontWeight: '600' },
  input: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 14, minHeight: 50, paddingHorizontal: 14, color: colors.ink, fontSize: 15 }, helper: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  tag: { alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 99, backgroundColor: colors.greenLight }, tagText: { color: colors.green, fontWeight: '700', fontSize: 12 },
});
