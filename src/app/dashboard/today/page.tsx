'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Calendar, Check, X, Undo2, AlertTriangle, Sparkles, BookOpen } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { getDaySchedule, getOverallStats, markAttendance } from '@/lib/attendance';
import Modal from '@/components/ui/Modal';
import type { Semester, Subject, DetailedLecture, AttendanceStatus } from '@/lib/types';

export default function TodayPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [schedule, setSchedule] = useState<
    { type: 'holiday'; label: string } | { type: 'schedule'; lectures: DetailedLecture[] } | null
  >(null);

  // Overall Stats
  const [overallPercent, setOverallPercent] = useState(100);
  const [atRiskCount, setAtRiskCount] = useState(0);
  const [weeklyScheduled, setWeeklyScheduled] = useState(0);
  const [weeklyAttended, setWeeklyAttended] = useState(0);

  // Reschedule Form Modal
  const [reschedulingLecture, setReschedulingLecture] = useState<DetailedLecture | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('09:00');
  const [actionLoading, setActionLoading] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];

  const loadData = async () => {
    try {
      // 1. User check
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // 2. Fetch active semester
      const { data: semesters } = await supabase.from('semesters').select('*');
      const active = semesters?.find((s) => s.is_active) || semesters?.[0] || null;
      setActiveSemester(active);

      if (active) {
        // 3. Fetch subjects
        const { data: subjectsData } = await supabase
          .from('subjects')
          .select('*')
          .eq('semester_id', active.id);
        const subs = subjectsData || [];
        setSubjects(subs);

        // 4. Fetch schedule
        const sched = await getDaySchedule(supabase, todayStr, user.id, active.id);
        setSchedule(sched);

        // 5. Fetch overall stats
        const stats = await getOverallStats(supabase, active.id, user.id);
        setOverallPercent(stats.overallPercent);
        setAtRiskCount(stats.subjectsAtRisk);

        // Calculate this week's scheduled vs attended hours
        // Let's query records for this week (Monday to Sunday)
        const curr = new Date();
        const first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1); // Monday
        const last = first + 6; // Sunday
        
        const mondayDateStr = new Date(curr.setDate(first)).toISOString().split('T')[0];
        const sundayDateStr = new Date(curr.setDate(last)).toISOString().split('T')[0];

        const { data: weekRecords } = await supabase
          .from('attendance_records')
          .select('status, timetable_slot_id, extra_lecture_id')
          .eq('user_id', user.id)
          .gte('date', mondayDateStr)
          .lte('date', sundayDateStr);

        // Fetch timetable slots and extra lectures
        const { data: weekSlots } = await supabase.from('timetable_slots').select('id, start_time, end_time').eq('semester_id', active.id);
        const { data: weekExtras } = await supabase.from('extra_lectures').select('id, start_time, end_time').eq('semester_id', active.id).gte('date', mondayDateStr).lte('date', sundayDateStr);

        let schedHours = 0;
        let attHours = 0;

        weekRecords?.forEach((rec) => {
          let duration = 1;
          if (rec.timetable_slot_id) {
            const sl = weekSlots?.find((s) => s.id === rec.timetable_slot_id);
            if (sl) {
              const [sh, sm] = sl.start_time.split(':').map(Number);
              const [eh, em] = sl.end_time.split(':').map(Number);
              duration = (eh - sh) + (em - sm) / 60;
            }
          } else if (rec.extra_lecture_id) {
            const ex = weekExtras?.find((e) => e.id === rec.extra_lecture_id);
            if (ex) {
              const [sh, sm] = ex.start_time.split(':').map(Number);
              const [eh, em] = ex.end_time.split(':').map(Number);
              duration = (eh - sh) + (em - sm) / 60;
            }
          }

          if (rec.status === 'attended') {
            schedHours += duration;
            attHours += duration;
          } else if (rec.status === 'missed') {
            schedHours += duration;
          }
        });

        setWeeklyScheduled(Math.round(schedHours * 10) / 10);
        setWeeklyAttended(Math.round(attHours * 10) / 10);
      }
    } catch (err) {
      console.error('Error loading Today page details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [supabase]);

  const handleMark = async (lecture: DetailedLecture, status: AttendanceStatus) => {
    if (!userId) return;
    setActionLoading(true);
    try {
      await markAttendance(supabase, {
        date: todayStr,
        slotId: lecture.is_extra ? null : lecture.id,
        extraLectureId: lecture.is_extra ? lecture.id : null,
        status,
      });
      await loadData();
      router.refresh(); // Refresh layout to update global alerts
    } catch (err) {
      console.error('Failed to mark attendance:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingLecture || !rescheduleDate || !activeSemester || !userId) return;

    setActionLoading(true);
    try {
      // 1. Mark original slot as 'cancelled'
      await markAttendance(supabase, {
        date: todayStr,
        slotId: reschedulingLecture.is_extra ? null : reschedulingLecture.id,
        extraLectureId: reschedulingLecture.is_extra ? reschedulingLecture.id : null,
        status: 'cancelled',
        note: `Rescheduled to ${rescheduleDate}`,
      });

      // 2. Compute end time based on original duration
      const [sh, sm] = reschedulingLecture.start_time.split(':').map(Number);
      const [eh, em] = reschedulingLecture.end_time.split(':').map(Number);
      const durationHours = (eh - sh) + (em - sm) / 60;

      const [resh, resm] = rescheduleTime.split(':').map(Number);
      const endHour = resh + durationHours;
      const formatTime = (h: number, m: number) => {
        const hh = Math.floor(h).toString().padStart(2, '0');
        const mm = Math.floor((h % 1) * 60 + m).toString().padStart(2, '0');
        return `${hh}:${mm}:00`;
      };
      const newEndTime = formatTime(endHour, resm);

      // Create new extra lecture record
      await supabase.from('extra_lectures').insert({
        user_id: userId,
        semester_id: activeSemester.id,
        subject_id: reschedulingLecture.subject_id,
        date: rescheduleDate,
        start_time: `${rescheduleTime}:00`,
        end_time: newEndTime,
        reason: 'Rescheduled class',
        original_timetable_slot_id: reschedulingLecture.is_extra ? null : reschedulingLecture.id,
      });

      setReschedulingLecture(null);
      await loadData();
      router.refresh();
    } catch (err) {
      console.error('Failed to reschedule class:', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Date Formatting Helper
  const getHeaderDate = () => {
    const dateObj = new Date();
    return dateObj.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  const getSemesterWeek = () => {
    if (!activeSemester) return '';
    const start = new Date(activeSemester.start_date).getTime();
    const curr = new Date(todayStr).getTime();
    const diff = curr - start;
    const week = Math.max(1, Math.ceil(diff / (7 * 24 * 60 * 60 * 1000)));
    return `Week ${week} of ${activeSemester.name}`;
  };

  const cleanTimeStr = (tStr: string) => {
    const parts = tStr.split(':');
    const hr = parseInt(parts[0]);
    const suf = hr >= 12 ? 'PM' : 'AM';
    const hr12 = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
    return `${hr12}:${parts[1]} ${suf}`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 bg-[#EBEBEB] w-64 rounded animate-pulse" />
        <div className="space-y-3">
          <div className="h-16 bg-[#EBEBEB] rounded-xl animate-pulse" />
          <div className="h-16 bg-[#EBEBEB] rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  // Check if past 5PM and today has unmarked lectures
  const currentHour = new Date().getHours();
  const isPast5PM = currentHour >= 17;
  const unmarkedLectures =
    schedule?.type === 'schedule' ? schedule.lectures.filter((l) => !l.attendance) : [];
  const unmarkedCount = unmarkedLectures.length;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Date Header */}
      <div>
        <h1 className="text-2xl font-medium text-[#111111] tracking-tight">
          {getHeaderDate()}
        </h1>
        {activeSemester && (
          <p className="text-xs text-[#6B6B6B] mt-1 font-medium font-sans">
            {getSemesterWeek()}
          </p>
        )}
      </div>

      {/* "Mark today" Reminder Banner */}
      {isPast5PM && unmarkedCount > 0 && (
        <div className="p-3 rounded-lg bg-[#D97706]/8 border border-[#D97706]/20 text-[#D97706] text-xs flex items-center gap-2 animate-in fade-in duration-200">
          <AlertTriangle size={15} className="flex-shrink-0" />
          <span>
            You have {unmarkedCount} unmarked lecture{unmarkedCount > 1 ? 's' : ''} today — mark them before the day ends
          </span>
        </div>
      )}

      {/* Today's Schedule Card */}
      {!activeSemester ? (
        <div className="card text-center py-12">
          <Calendar size={32} className="mx-auto text-[#ABABAB] mb-3" />
          <h3 className="text-sm font-medium text-[#111111] mb-1">No Active Semester</h3>
          <p className="text-xs text-[#6B6B6B] max-w-sm mx-auto">
            Please configure your semester details in Settings first.
          </p>
        </div>
      ) : schedule?.type === 'holiday' ? (
        <div className="card flex items-center gap-4 py-8 border-dashed bg-white justify-center">
          <Calendar className="text-[#ABABAB]" size={24} />
          <div>
            <h3 className="text-sm font-medium text-[#111111]">
              {schedule.label || 'Holiday'}
            </h3>
            <p className="text-xs text-[#6B6B6B] mt-0.5">No classes scheduled for today.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-xs font-semibold text-[#111111] uppercase tracking-wider">
            Today's Lectures
          </h2>

          {schedule?.lectures.length === 0 ? (
            <div className="card text-center py-12 bg-white flex flex-col items-center justify-center">
              <BookOpen size={36} className="text-[#ABABAB] mb-3" />
              <h3 className="text-sm font-medium text-[#111111] mb-1">No Lectures Today</h3>
              <p className="text-xs text-[#6B6B6B] max-w-xs mx-auto">
                No classes scheduled for today. Take some rest or schedule an extra working lecture in the Timetable tab.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {schedule?.lectures.map((lecture) => {
                const status = lecture.attendance?.status;
                const cardBorder =
                  status === 'attended'
                    ? 'border-[#1A9E5F]/30 bg-[#1A9E5F]/3'
                    : status === 'missed'
                    ? 'border-[#DC2626]/30 bg-[#DC2626]/3'
                    : status === 'cancelled'
                    ? 'border-[#EBEBEB] opacity-60 bg-[#FAFAFA]'
                    : 'border-[#EBEBEB] bg-white';

                return (
                  <div
                    key={lecture.id}
                    className={`card relative p-4 pl-6 overflow-hidden flex items-center justify-between gap-4 transition-colors ${cardBorder}`}
                  >
                    {/* Left color bar */}
                    <div
                      className="absolute top-0 bottom-0 left-0 w-1"
                      style={{ backgroundColor: lecture.color }}
                    />

                    <div className="flex items-start gap-3 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-semibold text-[#111111] truncate">
                            {lecture.subject_name}
                          </h4>
                          {lecture.is_extra && (
                            <span className="text-[8px] font-medium text-[#5B5BD6] bg-[#5B5BD6]/10 px-1 rounded">
                              Extra
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[#6B6B6B] mt-1.5 block font-sans">
                          {cleanTimeStr(lecture.start_time)} – {cleanTimeStr(lecture.end_time)}
                        </span>
                        <span className="text-[9px] text-[#ABABAB] mt-0.5 block truncate">
                          {lecture.room ? `Room ${lecture.room}` : 'No Room'} • {lecture.faculty || 'No Faculty'}
                        </span>
                      </div>
                    </div>

                    {/* Marking Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {status && status !== 'cancelled' ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[9px] font-semibold px-2.5 py-0.5 rounded-full capitalize ${
                              status === 'attended'
                                ? 'bg-[#1A9E5F]/15 text-[#1A9E5F]'
                                : 'bg-[#DC2626]/15 text-[#DC2626]'
                            }`}
                          >
                            {status}
                          </span>
                          <button
                            onClick={() => handleMark(lecture, status === 'attended' ? 'missed' : 'attended')}
                            className="text-[10px] text-[#5B5BD6] font-medium hover:underline"
                            disabled={actionLoading}
                          >
                            Change
                          </button>
                        </div>
                      ) : status === 'cancelled' ? (
                        <span className="text-[9px] font-semibold px-2.5 py-0.5 rounded-full bg-[#ABABAB]/15 text-[#6B6B6B]">
                          Cancelled
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleMark(lecture, 'attended')}
                            className="w-7 h-7 rounded border border-[#EBEBEB] bg-white flex items-center justify-center text-[#6B6B6B] hover:text-[#1A9E5F] hover:bg-[#1A9E5F]/5"
                            title="Attended"
                            disabled={actionLoading}
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => handleMark(lecture, 'missed')}
                            className="w-7 h-7 rounded border border-[#EBEBEB] bg-white flex items-center justify-center text-[#6B6B6B] hover:text-[#DC2626] hover:bg-[#DC2626]/5"
                            title="Missed"
                            disabled={actionLoading}
                          >
                            <X size={14} />
                          </button>
                          <button
                            onClick={() => setReschedulingLecture(lecture)}
                            className="w-7 h-7 rounded border border-[#EBEBEB] bg-white flex items-center justify-center text-[#6B6B6B] hover:text-[#5B5BD6] hover:bg-[#5B5BD6]/5"
                            title="Reschedule"
                            disabled={actionLoading}
                          >
                            <Undo2 size={13} className="-scale-x-100" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bottom Metrics Row */}
      {activeSemester && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-[#EBEBEB] pt-8">
          <div className="card p-4 flex flex-col justify-between">
            <span className="text-[10px] text-[#6B6B6B] font-medium block">Overall %</span>
            <span className="text-lg font-semibold text-[#111111] mt-2 block">
              {Math.round(overallPercent)}%
            </span>
          </div>

          <div className="card p-4 flex flex-col justify-between">
            <span className="text-[10px] text-[#6B6B6B] font-medium block">At-Risk Subjects</span>
            <span className={`text-lg font-semibold mt-2 block ${atRiskCount > 0 ? 'text-[#DC2626]' : 'text-[#111111]'}`}>
              {atRiskCount}
            </span>
          </div>

          <div className="card p-4 flex flex-col justify-between">
            <span className="text-[10px] text-[#6B6B6B] font-medium block">Weekly Scheduled</span>
            <span className="text-lg font-semibold text-[#111111] mt-2 block">
              {weeklyScheduled} hrs
            </span>
          </div>

          <div className="card p-4 flex flex-col justify-between">
            <span className="text-[10px] text-[#6B6B6B] font-medium block">Weekly Attended</span>
            <span className="text-lg font-semibold text-[#111111] mt-2 block">
              {weeklyAttended} hrs
            </span>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedulingLecture && (
        <Modal
          isOpen={reschedulingLecture !== null}
          onClose={() => setReschedulingLecture(null)}
          title={`Reschedule ${reschedulingLecture.subject_name}`}
        >
          <form onSubmit={handleReschedule} className="space-y-4">
            <p className="text-xs text-[#6B6B6B] leading-relaxed">
              This cancels the lecture scheduled for today ({getHeaderDate()}) and moves it to a new date.
            </p>
            <div>
              <label className="text-[#6B6B6B] text-xs mb-1.5 block">Target Date</label>
              <input
                type="date"
                required
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="input-field text-sm"
                disabled={actionLoading}
              />
            </div>
            <div>
              <label className="text-[#6B6B6B] text-xs mb-1.5 block">New Start Time</label>
              <input
                type="time"
                required
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
                className="input-field text-sm"
                disabled={actionLoading}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={actionLoading}
                className="btn-primary text-xs py-2 flex-1"
              >
                Confirm Reschedule
              </button>
              <button
                type="button"
                onClick={() => setReschedulingLecture(null)}
                className="btn-secondary text-xs py-2 flex-1"
              >
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
