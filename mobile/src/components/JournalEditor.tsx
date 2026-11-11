import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { characterCount, validateText } from '../lib/validation';
import { colors } from '../lib/theme';
import { Button, Field } from './UI';

export function JournalEditor({ label, maximum, initial = '', busy, saveLabel, onSave, onCancel, clearAfterSave = false }: {
  label: string; maximum: number; initial?: string; busy: boolean; saveLabel: string;
  onSave: (body: string) => Promise<boolean>; onCancel?: () => void; clearAfterSave?: boolean;
}) {
  const [body, setBody] = useState(initial);
  const [error, setError] = useState('');
  const count = characterCount(body);
  async function save() {
    if (busy) return;
    const invalid = validateText(body, maximum);
    if (invalid) { setError(invalid); return; }
    if (await onSave(body) && clearAfterSave) setBody('');
  }
  return <View style={styles.editor}>
    <Field label={label} value={body} editable={!busy} onChangeText={(value) => { setBody(value); setError(''); }} multiline numberOfLines={maximum === 500 ? 5 : 2} textAlignVertical="top" inputStyle={maximum === 500 ? styles.diaryInput : styles.commentInput} />
    <Text style={[styles.count, count > maximum && styles.error]}>{count} / {maximum} 字 · {count > maximum ? `超出 ${count - maximum} 字` : `還可輸入 ${maximum - count} 字`}</Text>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Button disabled={busy} loading={busy} onPress={save}>{busy ? '處理中…' : saveLabel}</Button>
    {onCancel ? <Button variant="secondary" disabled={busy} onPress={onCancel}>取消編輯</Button> : null}
  </View>;
}
const styles = StyleSheet.create({
  editor: { gap: 10 }, count: { color: colors.ink, fontSize: 13 },
  error: { color: colors.danger, fontSize: 14, lineHeight: 22 },
  diaryInput: { minHeight: 130, paddingTop: 12, paddingBottom: 12 },
  commentInput: { minHeight: 74, paddingTop: 12, paddingBottom: 12 },
});
