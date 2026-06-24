import type { SupabaseClient } from '@supabase/supabase-js';
import type { Subject, TimetableSlot, SpecialDay, ExtraLecture, AttendanceRecord, DetailedLecture, AttendanceStatus } from './types';

// Helper to compute hours between two times (HH:MM:SS format)
export function getHoursBetween(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh - sh) + (em - sm) / 60;
}

// Helper to parse YYYY-MM-DD safely into a local date and get JS day of week (1=Mon, 6=Sat, 7=Sun)
export function getDayOfWeekFromDate(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

// 1. Get Subject Stats
export async function getSubjectStats(
  supabase: SupabaseClient,
  subjectId: string,
  semesterId: string
) {
  // Fetch subject details
  const { data: subject, error: subError } = await supabase
    .from('subjects')
    .select('*')
    .eq('id', subjectId)
    .single();

  if (subError || !subject) {
    throw new Error('Subject not found');
  }

  // Fetch timetable slots for this subject
  const { data: slots } = await supabase
    .from('timetable_slots')
    .select('*')
    .eq('subject_id', subjectId);

  // Fetch extra lectures for this subject
  const { data: extraLectures } = await supabase
    .from('extra_lectures')
    .select('*')
    .eq('subject_id', subjectId);

  const slotIds = slots?.map((s) => s.id) || [];
  const extraIds = extraLectures?.map((el) => el.id) || [];

  // Fetch attendance records matching either slots or extra lectures
  let query = supabase.from('attendance_records').select('*');
  
  if (slotIds.length > 0 && extraIds.length > 0) {
    query = query.or(`timetable_slot_id.in.(${slotIds.join(',')}),extra_lecture_id.in.(${extraIds.join(',')})`);
  } else if (slotIds.length > 0) {
    query = query.in('timetable_slot_id', slotIds);
  } else if (extraIds.length > 0) {
    query = query.in('extra_lecture_id', extraIds);
  } else {
    // No slots or extra lectures exist yet
    return {
      totalHours: subject.total_hours,
      attendedHours: 0,
      missedHours: 0,
      cancelledHours: 0,
      attendancePercent: 100,
      lecturesNeeded: 0,
      lecturesSafeToMiss: 0,
      status: 'safe' as const,
    };
  }

  const { data: records } = await query;

  let attendedHours = 0;
  let missedHours = 0;
  let cancelledHours = 0;

  records?.forEach((rec) => {
    let duration = 1; // Fallback to 1 hour
    
    if (rec.timetable_slot_id) {
      const slot = slots?.find((s) => s.id === rec.timetable_slot_id);
      if (slot) duration = getHoursBetween(slot.start_time, slot.end_time);
    } else if (rec.extra_lecture_id) {
      const el = extraLectures?.find((e) => e.id === rec.extra_lecture_id);
      if (el) duration = getHoursBetween(el.start_time, el.end_time);
    }

    if (rec.status === 'attended') {
      attendedHours += duration;
    } else if (rec.status === 'missed') {
      missedHours += duration;
    } else if (rec.status === 'cancelled') {
      cancelledHours += duration;
    }
  });

  const totalHoursHeld = attendedHours + missedHours;
  const attendancePercent = totalHoursHeld > 0 ? (attendedHours / totalHoursHeld) * 100 : 100;
  
  const target = subject.attendance_target_percent || 80;
  let status: 'safe' | 'borderline' | 'at_risk' = 'safe';
  if (attendancePercent < 65) {
    status = 'at_risk';
  } else if (attendancePercent < 80) {
    status = 'borderline';
  }

  // Calculate N lectures to recover or safe to miss
  let lecturesNeeded = 0;
  let lecturesSafeToMiss = 0;

  if (attendancePercent < target) {
    // Recovery formula (N consecutive lectures to reach target)
    lecturesNeeded = Math.ceil(((target / 100) * totalHoursHeld - attendedHours) / (1 - target / 100));
  } else {
    // Safety buffer formula (N lectures safe to miss)
    lecturesSafeToMiss = Math.floor((attendedHours - (target / 100) * totalHoursHeld) / (target / 100));
  }

  return {
    totalHours: subject.total_hours,
    attendedHours,
    missedHours,
    cancelledHours,
    attendancePercent,
    lecturesNeeded: Math.max(0, lecturesNeeded),
    lecturesSafeToMiss: Math.max(0, lecturesSafeToMiss),
    status,
  };
}

// 2. Get Day Schedule
export async function getDaySchedule(
  supabase: SupabaseClient,
  date: string,
  userId: string,
  semesterId: string
): Promise<{ type: 'holiday'; label: string } | { type: 'schedule'; lectures: DetailedLecture[] }> {
  // Check if date is a holiday or no-college day in special_days
  const { data: specialDay } = await supabase
    .from('special_days')
    .select('*')
    .eq('semester_id', semesterId)
    .eq('date', date)
    .maybeSingle();

  if (specialDay && (specialDay.type === 'holiday' || specialDay.type === 'no_college')) {
    return {
      type: 'holiday',
      label: specialDay.label,
    };
  }

  // Determine day of week (1=Mon, 6=Sat, 7=Sun)
  const dayOfWeek = getDayOfWeekFromDate(date);

  // If Sunday and not marked as extra working, by default no classes
  if (dayOfWeek === 7 && (!specialDay || specialDay.type !== 'extra_working')) {
    return {
      type: 'schedule',
      lectures: [],
    };
  }

  // Fetch subjects for color, name details
  const { data: subjects } = await supabase
    .from('subjects')
    .select('*')
    .eq('semester_id', semesterId);

  // Fetch timetable slots for this day of week
  const { data: slots } = await supabase
    .from('timetable_slots')
    .select('*')
    .eq('semester_id', semesterId)
    .eq('day_of_week', dayOfWeek);

  // Fetch extra lectures for this date
  const { data: extraLectures } = await supabase
    .from('extra_lectures')
    .select('*')
    .eq('semester_id', semesterId)
    .eq('date', date);

  // Fetch attendance records for this date
  const { data: records } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('date', date)
    .eq('user_id', userId);

  const lectures: DetailedLecture[] = [];

  // Add timetable slots (checking if they are overridden/cancelled)
  slots?.forEach((slot) => {
    const matchedSubject = subjects?.find((s) => s.id === slot.subject_id);
    if (!matchedSubject) return;

    // Check if there is an extra lecture that acts as a reschedule for this specific slot
    const isRescheduled = extraLectures?.some((el) => el.original_timetable_slot_id === slot.id);
    const attendance = records?.find((r) => r.timetable_slot_id === slot.id) || null;

    // A slot is cancelled if marked cancelled OR if replaced by reschedule extra lecture
    const isCancelled = isRescheduled || attendance?.status === 'cancelled';

    lectures.push({
      id: slot.id,
      is_extra: false,
      subject_id: slot.subject_id,
      subject_name: matchedSubject.name,
      short_code: matchedSubject.short_code,
      color: matchedSubject.color,
      start_time: slot.start_time,
      end_time: slot.end_time,
      room: slot.room,
      faculty: slot.faculty,
      attendance: attendance,
    });
  });

  // Add extra lectures
  extraLectures?.forEach((el) => {
    const matchedSubject = subjects?.find((s) => s.id === el.subject_id);
    if (!matchedSubject) return;

    const attendance = records?.find((r) => r.extra_lecture_id === el.id) || null;

    lectures.push({
      id: el.id,
      is_extra: true,
      subject_id: el.subject_id,
      subject_name: matchedSubject.name,
      short_code: matchedSubject.short_code,
      color: matchedSubject.color,
      start_time: el.start_time,
      end_time: el.end_time,
      reason: el.reason,
      attendance: attendance,
    });
  });

  // Sort lectures chronologically by start_time
  lectures.sort((a, b) => a.start_time.localeCompare(b.start_time));

  return {
    type: 'schedule',
    lectures,
  };
}

// 3. Get Month Calendar Data
export async function getMonthCalendarData(
  supabase: SupabaseClient,
  year: number,
  month: number,
  userId: string,
  semesterId: string
): Promise<Record<string, { status: 'attended' | 'partial' | 'missed' | 'holiday' | 'none'; lectureCount: number; subjectColors: string[] }>> {
  // Format dates matching the target month
  const monthStart = `${year}-${month.toString().padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const monthEnd = `${nextYear}-${nextMonth.toString().padStart(2, '0')}-01`;

  // Fetch special days for this semester
  const { data: specialDays } = await supabase
    .from('special_days')
    .select('*')
    .eq('semester_id', semesterId)
    .gte('date', monthStart)
    .lt('date', monthEnd);

  // Fetch all timetable slots
  const { data: slots } = await supabase
    .from('timetable_slots')
    .select('*')
    .eq('semester_id', semesterId);

  // Fetch extra lectures for this month
  const { data: extraLectures } = await supabase
    .from('extra_lectures')
    .select('*')
    .eq('semester_id', semesterId)
    .gte('date', monthStart)
    .lt('date', monthEnd);

  // Fetch subjects for color references
  const { data: subjects } = await supabase
    .from('subjects')
    .select('*')
    .eq('semester_id', semesterId);

  // Fetch attendance records for this month
  const { data: records } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('user_id', userId)
    .gte('date', monthStart)
    .lt('date', monthEnd);

  const calendarData: Record<string, { status: 'attended' | 'partial' | 'missed' | 'holiday' | 'none'; lectureCount: number; subjectColors: string[] }> = {};

  // Loop through all days of the month
  const daysInMonth = new Date(year, month, 0).getDate();
  
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
    
    // Check if special day holiday
    const spec = specialDays?.find((s) => s.date === dateStr);
    if (spec && (spec.type === 'holiday' || spec.type === 'no_college')) {
      calendarData[dateStr] = {
        status: 'holiday',
        lectureCount: 0,
        subjectColors: [],
      };
      continue;
    }

    const dayOfWeek = getDayOfWeekFromDate(dateStr);
    
    // Skip Sundays unless it's a special extra working day
    const isSunday = dayOfWeek === 7;
    const isExtraWorking = spec?.type === 'extra_working';
    if (isSunday && !isExtraWorking) {
      continue;
    }

    // Accumulate subjects scheduled for this day
    const dayColors: string[] = [];
    let scheduledLecturesCount = 0;
    let markedAttended = 0;
    let markedMissed = 0;
    let hasUnmarked = false;

    // Timetable Slots
    slots?.forEach((slot) => {
      if (slot.day_of_week === dayOfWeek) {
        // Check if rescheduled/replaced
        const isRescheduled = extraLectures?.some((el) => el.date === dateStr && el.original_timetable_slot_id === slot.id);
        const rec = records?.find((r) => r.date === dateStr && r.timetable_slot_id === slot.id);
        
        if (isRescheduled || rec?.status === 'cancelled') {
          return; // Ignore cancelled slots
        }

        scheduledLecturesCount++;
        const sub = subjects?.find((s) => s.id === slot.subject_id);
        if (sub && !dayColors.includes(sub.color)) {
          dayColors.push(sub.color);
        }

        if (rec) {
          if (rec.status === 'attended') markedAttended++;
          if (rec.status === 'missed') markedMissed++;
        } else {
          hasUnmarked = true;
        }
      }
    });

    // Extra Lectures
    extraLectures?.forEach((el) => {
      if (el.date === dateStr) {
        scheduledLecturesCount++;
        const sub = subjects?.find((s) => s.id === el.subject_id);
        if (sub && !dayColors.includes(sub.color)) {
          dayColors.push(sub.color);
        }

        const rec = records?.find((r) => r.date === dateStr && r.extra_lecture_id === el.id);
        if (rec) {
          if (rec.status === 'attended') markedAttended++;
          if (rec.status === 'missed') markedMissed++;
        } else {
          hasUnmarked = true;
        }
      }
    });

    if (scheduledLecturesCount === 0) {
      continue;
    }

    // Determine status indicator
    let status: 'attended' | 'partial' | 'missed' | 'holiday' | 'none' = 'none';
    if (markedAttended === scheduledLecturesCount) {
      status = 'attended';
    } else if (markedMissed === scheduledLecturesCount) {
      status = 'missed';
    } else if (markedAttended > 0 || markedMissed > 0 || hasUnmarked) {
      status = 'partial';
    }

    calendarData[dateStr] = {
      status,
      lectureCount: scheduledLecturesCount,
      subjectColors: dayColors.slice(0, 3), // Limit dots to 3
    };
  }

  return calendarData;
}

// 4. Mark Attendance
export async function markAttendance(
  supabase: SupabaseClient,
  params: {
    date: string;
    slotId?: string | null;
    extraLectureId?: string | null;
    status: AttendanceStatus;
    note?: string | null;
  }
) {
  const { date, slotId, extraLectureId, status, note } = params;

  // Validate that exactly one of slotId or extraLectureId is provided, unless status is cancelled (where it has to link to something)
  const hasSlot = !!slotId;
  const hasExtra = !!extraLectureId;
  
  if ((hasSlot && hasExtra) || (!hasSlot && !hasExtra)) {
    throw new Error('Exactly one of timetable_slot_id or extra_lecture_id must be provided.');
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('User session not found');

  // Check if attendance record already exists
  let checkQuery = supabase
    .from('attendance_records')
    .select('*')
    .eq('date', date)
    .eq('user_id', user.id);

  if (slotId) {
    checkQuery = checkQuery.eq('timetable_slot_id', slotId);
  } else {
    checkQuery = checkQuery.eq('extra_lecture_id', extraLectureId);
  }

  const { data: existingRecords } = await checkQuery;
  const existing = existingRecords && existingRecords.length > 0 ? existingRecords[0] : null;

  if (existing) {
    // Update existing record
    const { data, error } = await supabase
      .from('attendance_records')
      .update({
        status,
        note: note || null,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    // Insert new record
    const { data, error } = await supabase
      .from('attendance_records')
      .insert({
        user_id: user.id,
        date,
        timetable_slot_id: slotId || null,
        extra_lecture_id: extraLectureId || null,
        status,
        note: note || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

// 5. Get Overall Stats
export async function getOverallStats(
  supabase: SupabaseClient,
  semesterId: string,
  userId: string
) {
  // Fetch subjects
  const { data: subjects } = await supabase
    .from('subjects')
    .select('*')
    .eq('semester_id', semesterId);

  if (!subjects || subjects.length === 0) {
    return {
      overallPercent: 100,
      subjectsAtRisk: 0,
      totalScheduled: 0,
      totalAttended: 0,
      totalMissed: 0,
    };
  }

  let totalAttendedHours = 0;
  let totalHeldHours = 0;
  let subjectsAtRiskCount = 0;
  let totalScheduledCount = 0;
  let totalAttendedCount = 0;
  let totalMissedCount = 0;

  for (const sub of subjects) {
    const stats = await getSubjectStats(supabase, sub.id, semesterId);
    
    totalAttendedHours += stats.attendedHours;
    totalHeldHours += (stats.attendedHours + stats.missedHours);
    
    if (stats.status === 'at_risk') {
      subjectsAtRiskCount++;
    }

    // Fetch counts from records
    // Total scheduled in records for this subject
    const { data: records } = await supabase
      .from('attendance_records')
      .select('status, timetable_slot_id, extra_lecture_id')
      .eq('user_id', userId);

    // Fetch slots and extra lectures to identify subject link
    const { data: slots } = await supabase.from('timetable_slots').select('id').eq('subject_id', sub.id);
    const { data: extras } = await supabase.from('extra_lectures').select('id').eq('subject_id', sub.id);
    
    const sIds = slots?.map((s) => s.id) || [];
    const eIds = extras?.map((e) => e.id) || [];

    records?.forEach((rec) => {
      const isMatch = (rec.timetable_slot_id && sIds.includes(rec.timetable_slot_id)) || 
                      (rec.extra_lecture_id && eIds.includes(rec.extra_lecture_id));
      
      if (isMatch) {
        if (rec.status === 'attended') {
          totalScheduledCount++;
          totalAttendedCount++;
        } else if (rec.status === 'missed') {
          totalScheduledCount++;
          totalMissedCount++;
        }
      }
    });
  }

  const overallPercent = totalHeldHours > 0 ? (totalAttendedHours / totalHeldHours) * 100 : 100;

  return {
    overallPercent,
    subjectsAtRisk: subjectsAtRiskCount,
    totalScheduled: totalScheduledCount,
    totalAttended: totalAttendedCount,
    totalMissed: totalMissedCount,
  };
}
