export type CalendarEvent = {
  id: string;
  couple_id: string;
  created_by: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  created_at: string;
};

export type Anniversary = {
  id: string;
  couple_id: string;
  created_by: string;
  title: string;
  event_date: string;
  repeats_yearly: boolean;
  reminder_enabled: boolean;
  reminder_days_before: number;
  created_at: string;
};

export type DiaryEntry = {
  id: string;
  couple_id: string;
  created_by: string;
  body: string;
  created_at: string;
};

export type DiaryComment = {
  id: string;
  couple_id: string;
  diary_id: string;
  created_by: string;
  body: string;
  created_at: string;
};

export type MoodEntry = {
  id: string;
  couple_id: string;
  created_by: string;
  mood: 'happy' | 'calm' | 'sad' | 'excited' | 'tired' | 'loved';
  created_at: string;
};

export type CoupleData = {
  coupleId: string;
  events: CalendarEvent[];
  anniversaries: Anniversary[];
  diaries: DiaryEntry[];
  comments: DiaryComment[];
  moods: MoodEntry[];
};

export const moodOptions: { value: MoodEntry['mood']; label: string; emoji: string }[] = [
  { value: 'happy', label: '開心', emoji: '😊' },
  { value: 'calm', label: '平靜', emoji: '😌' },
  { value: 'sad', label: '低落', emoji: '🥺' },
  { value: 'excited', label: '期待', emoji: '✨' },
  { value: 'tired', label: '疲憊', emoji: '😴' },
  { value: 'loved', label: '被愛著', emoji: '💛' },
];
