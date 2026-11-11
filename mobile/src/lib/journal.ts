import { CoupleData, DiaryComment, DiaryEntry, MoodEntry, moodOptions } from './models';

export type JournalTable = 'diary_entries' | 'diary_comments' | 'mood_entries';
export type JournalRecord = DiaryEntry | DiaryComment | MoodEntry;
export type JournalOperation = 'create' | 'update' | 'delete';

export function validateMood(value: string) {
  return moodOptions.some((item) => item.value === value) ? null : '請先選擇一個有效的心情貼紙。';
}

export function applyJournalChange(data: CoupleData, table: JournalTable, operation: JournalOperation, record: JournalRecord) {
  if (record.couple_id !== data.coupleId) throw new Error('無法存取其他配對的內容。');
  const key = table === 'diary_entries' ? 'diaries' : table === 'diary_comments' ? 'comments' : 'moods';
  const items: JournalRecord[] = data[key];
  const next = operation === 'delete' ? items.filter((item) => item.id !== record.id)
    : operation === 'create' ? [...items.filter((item) => item.id !== record.id), record]
    : items.map((item) => item.id === record.id ? record : item);
  next.sort((a, b) => key === 'comments' ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at));
  return {
    ...data, [key]: next,
    ...(table === 'diary_entries' && operation === 'delete' ? { comments: data.comments.filter((comment) => comment.diary_id !== record.id) } : {}),
  } as CoupleData;
}
