export interface Semester {
  id: string;
  user_id: string;
  name: string;
  start_date: string; // ISO date string YYYY-MM-DD
  end_date: string;   // ISO date string YYYY-MM-DD
  is_active: boolean;
  created_at: string; // ISO timestamp
}

export interface Subject {
  id: string;
  user_id: string;
  semester_id: string;
  name: string;
  short_code: string;
  total_hours: number;
  attendance_target_percent: number;
  color: string; // Hex color string
  created_at: string;
}

export interface TimetableSlot {
  id: string;
  user_id: string;
  semester_id: string;
  subject_id: string;
  day_of_week: number; // 1=Monday to 6=Saturday
  start_time: string;  // time string HH:MM:SS
  end_time: string;    // time string HH:MM:SS
  room?: string | null;
  faculty?: string | null;
}

export type SpecialDayType = 'holiday' | 'no_college' | 'extra_working';

export interface SpecialDay {
  id: string;
  user_id: string;
  semester_id: string;
  date: string; // ISO date string YYYY-MM-DD
  type: SpecialDayType;
  label: string;
}

export interface ExtraLecture {
  id: string;
  user_id: string;
  semester_id: string;
  subject_id: string;
  date: string; // ISO date string YYYY-MM-DD
  start_time: string;
  end_time: string;
  reason?: string | null;
  original_timetable_slot_id?: string | null;
}

export type AttendanceStatus = 'attended' | 'missed' | 'cancelled';

export interface AttendanceRecord {
  id: string;
  user_id: string;
  date: string; // ISO date string YYYY-MM-DD
  timetable_slot_id?: string | null;
  extra_lecture_id?: string | null;
  status: AttendanceStatus;
  note?: string | null;
  created_at: string;
  updated_at: string;
}

// Combined frontend-friendly types for scheduling
export interface DetailedLecture {
  id: string; // Slot ID or ExtraLecture ID
  is_extra: boolean;
  subject_id: string;
  subject_name: string;
  short_code: string;
  color: string;
  start_time: string;
  end_time: string;
  room?: string | null;
  faculty?: string | null;
  reason?: string | null;
  attendance?: AttendanceRecord | null;
}
