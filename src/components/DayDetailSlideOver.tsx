'use client';

import { useState, useEffect } from 'react';
import { Clock, Calendar, Check, X, Undo2, Plus, AlertCircle, AlertTriangle } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { getDaySchedule, markAttendance } from '@/lib/attendance';
import SlideOver from '@/components/ui/SlideOver';
import Modal from '@/components/ui/Modal';
import type { Semester, Subject, DetailedLecture, AttendanceStatus } from '@/lib/types';

interface DayDetailSlideOverProps {
  isOpen: boolean;
  onClose: () => void;
  date: string; // "YYYY-MM-DD"
  activeSemester: Semester;
  subjects: Subject[];
  userId: string;
  onRefresh: () => void;
}

export default function DayDetailSlideOver({
  isOpen,
  onClose,
  date,
  activeSemester,
  subjects,
  userId,
  onRefresh,
}: DayDetailSlideOverProps) {
  const supabase = createSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [scheduleData, setScheduleData] = useState<
    { type: 'holiday'; label: string } | { type: 'schedule'; lectures: DetailedLecture[] } | null
  >(null);

  // Reschedule Form Modal
  const [reschedulingLecture, setReschedulingLecture] = useState<DetailedLecture | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('09:00');
  const [actionLoading, setActionLoading] = useState(false);

  // Add Extra Lecture Modal (inside slide-over)
  const [isExtraModalOpen, setIsExtraModalOpen] = useState(false);
  const [extraSubId, setExtraSubId] = useState(subjects[0]?.id || '');
  const [extraStart, setExtraStart] = useState('09:00');
  const [extraEnd, setExtraEnd] = useState('10:00');
  const [extraReason, setExtraReason] = useState('');

  // Load schedule details
  async function loadSchedule() {
    if (!date) return;
    setLoading(true);
    try {
      const schedule = await getDaySchedule(supabase, date, userId, activeSemester.id);
      setScheduleData(schedule);
    } catch (error) {
      console.error('Failed to load schedule:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen && date) {
      loadSchedule();
    }
  }, [isOpen, date]);

  const handleMark = async (lecture: DetailedLecture, status: AttendanceStatus) => {
    setActionLoading(true);
    try {
      await markAttendance(supabase, {
        date,
        slotId: lecture.is_extra ? null : lecture.id,
        extraLectureId: lecture.is_extra ? lecture.id : null,
        status,
      });
      await loadSchedule();
      onRefresh();
    } catch (err) {
      console.error('Error marking attendance:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveHoliday = async () => {
    setActionLoading(true);
    try {
      await supabase
        .from('special_days')
        .delete()
        .eq('semester_id', activeSemester.id)
        .eq('date', date);
      
      await loadSchedule();
      onRefresh();
    } catch (err) {
      console.error('Failed to remove holiday:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const startReschedule = (lecture: DetailedLecture) => {
    setReschedulingLecture(lecture);
    setRescheduleDate(date);
    setRescheduleTime(lecture.start_time.substring(0, 5));
  };

  const submitReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reschedulingLecture || !rescheduleDate) return;

    setActionLoading(true);
    try {
      // 1. Mark original slot as 'cancelled'
      await markAttendance(supabase, {
        date,
        slotId: reschedulingLecture.is_extra ? null : reschedulingLecture.id,
        extraLectureId: reschedulingLecture.is_extra ? reschedulingLecture.id : null,
        status: 'cancelled',
        note: `Rescheduled to ${rescheduleDate}`,
      });

      // 2. Create extra lecture on new date
      // Compute end time (duration same as original)
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
      await loadSchedule();
      onRefresh();
    } catch (err) {
      console.error('Failed to reschedule:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddExtraLecture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraSubId || !date || !extraStart || !extraEnd) return;
    if (extraStart >= extraEnd) return;

    setActionLoading(true);
    try {
      await supabase.from('extra_lectures').insert({
        user_id: userId,
        semester_id: activeSemester.id,
        subject_id: extraSubId,
        date,
        start_time: `${extraStart}:00`,
        end_time: `${extraEnd}:00`,
        reason: extraReason.trim() || null,
      });

      setIsExtraModalOpen(false);
      setExtraReason('');
      await loadSchedule();
      onRefresh();
    } catch (err) {
      console.error('Failed to add extra lecture:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const formatHeaderDate = (dStr: string) => {
    if (!dStr) return '';
    const [y, m, d] = dStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const cleanTimeStr = (tStr: string) => {
    const parts = tStr.split(':');
    const hr = parseInt(parts[0]);
    const suf = hr >= 12 ? 'PM' : 'AM';
    const hr12 = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
    return `${hr12}:${parts[1]} ${suf}`;
  };

  return (
    <>
      <SlideOver isOpen={isOpen} onClose={onClose} title={formatHeaderDate(date)}>
        {loading ? (
          <div className="space-y-4">
            <div className="h-20 bg-[#EBEBEB] rounded-lg animate-pulse" />
            <div className="h-20 bg-[#EBEBEB] rounded-lg animate-pulse" />
          </div>
        ) : scheduleData?.type === 'holiday' ? (
          <div className="space-y-6">
            <div className="card text-center py-8 border-dashed">
              <Calendar className="mx-auto text-[#ABABAB] mb-3" size={24} />
              <h4 className="text-sm font-medium text-[#111111] mb-1">
                {scheduleData.label || 'Holiday'}
              </h4>
              <p className="text-xs text-[#6B6B6B] mb-5">No classes scheduled for today.</p>
              <button
                onClick={handleRemoveHoliday}
                disabled={actionLoading}
                className="btn-secondary text-xs py-1.5 px-3 border-[#DC2626]/20 text-[#DC2626] hover:bg-[#DC2626]/5"
              >
                Remove Holiday Marker
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full justify-between">
            <div className="space-y-4">
              {scheduleData?.lectures.length === 0 ? (
                <div className="card text-center py-8 border-dashed text-xs text-[#6B6B6B]">
                  No lectures scheduled for this day.
                </div>
              ) : (
                scheduleData?.lectures.map((lecture) => {
                  const status = lecture.attendance?.status;
                  return (
                    <div
                      key={lecture.id}
                      className={`p-3.5 bg-white border rounded-lg flex items-center justify-between gap-3 transition-colors ${
                        status === 'attended'
                          ? 'border-[#1A9E5F]/30 bg-[#1A9E5F]/3'
                          : status === 'missed'
                          ? 'border-[#DC2626]/30 bg-[#DC2626]/3'
                          : status === 'cancelled'
                          ? 'border-[#EBEBEB] opacity-60 bg-[#FAFAFA]'
                          : 'border-[#EBEBEB]'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Colored Left Bar */}
                        <div
                          className="w-1 rounded h-10 mt-0.5 flex-shrink-0"
                          style={{ backgroundColor: lecture.color }}
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-[#111111] truncate">
                            {lecture.subject_name}
                          </h4>
                          <span className="text-[10px] text-[#6B6B6B] mt-0.5 block">
                            {cleanTimeStr(lecture.start_time)} – {cleanTimeStr(lecture.end_time)}
                          </span>
                          <span className="text-[9px] text-[#ABABAB] mt-0.5 block truncate">
                            {lecture.room ? `Room ${lecture.room}` : 'No Room'} • {lecture.faculty || 'No Faculty'}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {status && status !== 'cancelled' ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[9px] font-medium px-2 py-0.5 rounded-full capitalize ${
                                status === 'attended'
                                  ? 'bg-[#1A9E5F]/15 text-[#1A9E5F]'
                                  : 'bg-[#DC2626]/15 text-[#DC2626]'
                              }`}
                            >
                              {status}
                            </span>
                            <button
                              onClick={() => handleMark(lecture, status === 'attended' ? 'missed' : 'attended')}
                              className="text-[9px] text-[#5B5BD6] font-medium hover:underline"
                              disabled={actionLoading}
                            >
                              Change
                            </button>
                          </div>
                        ) : status === 'cancelled' ? (
                          <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-[#ABABAB]/15 text-[#6B6B6B]">
                            Cancelled
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleMark(lecture, 'attended')}
                              className="w-6 h-6 rounded border border-[#EBEBEB] flex items-center justify-center text-[#6B6B6B] hover:text-[#1A9E5F] hover:bg-[#1A9E5F]/5"
                              title="Attended"
                              disabled={actionLoading}
                            >
                              <Check size={13} />
                            </button>
                            <button
                              onClick={() => handleMark(lecture, 'missed')}
                              className="w-6 h-6 rounded border border-[#EBEBEB] flex items-center justify-center text-[#6B6B6B] hover:text-[#DC2626] hover:bg-[#DC2626]/5"
                              title="Missed"
                              disabled={actionLoading}
                            >
                              <X size={13} />
                            </button>
                            <button
                              onClick={() => startReschedule(lecture)}
                              className="w-6 h-6 rounded border border-[#EBEBEB] flex items-center justify-center text-[#6B6B6B] hover:text-[#5B5BD6] hover:bg-[#5B5BD6]/5"
                              title="Reschedule"
                              disabled={actionLoading}
                            >
                              <Undo2 size={12} className="-scale-x-100" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <button
              onClick={() => setIsExtraModalOpen(true)}
              className="btn-secondary w-full text-xs py-2 mt-8 flex items-center justify-center gap-1"
            >
              <Plus size={14} /> Add Extra Lecture
            </button>
          </div>
        )}
      </SlideOver>

      {/* Reschedule Modal */}
      {reschedulingLecture && (
        <Modal
          isOpen={reschedulingLecture !== null}
          onClose={() => setReschedulingLecture(null)}
          title={`Reschedule ${reschedulingLecture.subject_name}`}
        >
          <form onSubmit={submitReschedule} className="space-y-4">
            <p className="text-xs text-[#6B6B6B]">
              This will cancel the lecture on {formatHeaderDate(date)} and create a rescheduled lecture on the new date.
            </p>
            <div>
              <label className="text-[#6B6B6B] text-xs mb-1.5 block">New Date</label>
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

      {/* Add Extra Lecture Inline Modal */}
      <Modal
        isOpen={isExtraModalOpen}
        onClose={() => setIsExtraModalOpen(false)}
        title="Schedule Extra Lecture"
      >
        <form onSubmit={handleAddExtraLecture} className="space-y-4">
          <div>
            <label className="text-[#6B6B6B] text-xs mb-1.5 block">Subject</label>
            <select
              value={extraSubId}
              onChange={(e) => setExtraSubId(e.target.value)}
              className="input-field text-sm bg-white"
              disabled={actionLoading}
            >
              {subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} ({sub.short_code})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[#6B6B6B] text-xs mb-1.5 block">Start Time</label>
              <input
                type="time"
                required
                value={extraStart}
                onChange={(e) => setExtraStart(e.target.value)}
                className="input-field text-sm"
                disabled={actionLoading}
              />
            </div>
            <div>
              <label className="text-[#6B6B6B] text-xs mb-1.5 block">End Time</label>
              <input
                type="time"
                required
                value={extraEnd}
                onChange={(e) => setExtraEnd(e.target.value)}
                className="input-field text-sm"
                disabled={actionLoading}
              />
            </div>
          </div>

          <div>
            <label className="text-[#6B6B6B] text-xs mb-1.5 block">Notes / Reason (optional)</label>
            <input
              type="text"
              placeholder="e.g. Catch up session"
              value={extraReason}
              onChange={(e) => setExtraReason(e.target.value)}
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
              Schedule Lecture
            </button>
            <button
              type="button"
              onClick={() => setIsExtraModalOpen(false)}
              className="btn-secondary text-xs py-2 flex-1"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
