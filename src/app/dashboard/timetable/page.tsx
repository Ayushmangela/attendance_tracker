'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Calendar, Plus, Trash2, Edit2, Info, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import type { TimetableSlot, Subject, SpecialDay, ExtraLecture, Semester } from '@/lib/types';

// Preset Day names
const DAYS = [
  { label: 'Monday', val: 1 },
  { label: 'Tuesday', val: 2 },
  { label: 'Wednesday', val: 3 },
  { label: 'Thursday', val: 4 },
  { label: 'Friday', val: 5 },
  { label: 'Saturday', val: 6 },
];

export default function TimetablePage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [loading, setLoading] = useState(true);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [specialDays, setSpecialDays] = useState<SpecialDay[]>([]);
  const [extraLectures, setExtraLectures] = useState<ExtraLecture[]>([]);
  
  // Tab State: 'schedule' | 'special_days'
  const [activeTab, setActiveTab] = useState<'schedule' | 'special_days'>('schedule');
  const [editMode, setEditMode] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modals
  // 1. Timetable Slot Modal
  const [isSlotModalOpen, setIsSlotModalOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ day: number; hour: number } | null>(null);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [slotSubjectId, setSlotSubjectId] = useState('');
  const [slotRoom, setSlotRoom] = useState('');
  const [slotFaculty, setSlotFaculty] = useState('');
  const [slotDuration, setSlotDuration] = useState(1);

  // 2. Special Day Modal
  const [isSpecialDayModalOpen, setIsSpecialDayModalOpen] = useState(false);
  const [specialDayDate, setSpecialDayDate] = useState('');
  const [specialDayType, setSpecialDayType] = useState<'holiday' | 'no_college' | 'extra_working'>('holiday');
  const [specialDayLabel, setSpecialDayLabel] = useState('');

  // 3. Extra Lecture Modal
  const [isExtraLectureModalOpen, setIsExtraLectureModalOpen] = useState(false);
  const [extraSubId, setExtraSubId] = useState('');
  const [extraDate, setExtraDate] = useState('');
  const [extraStart, setExtraStart] = useState('09:00:00');
  const [extraEnd, setExtraEnd] = useState('10:00:00');
  const [extraReason, setExtraReason] = useState('');

  // Deletions
  const [slotToDelete, setSlotToDelete] = useState<TimetableSlot | null>(null);
  const [specialDayToDelete, setSpecialDayToDelete] = useState<SpecialDay | null>(null);
  const [extraLectureToDelete, setExtraLectureToDelete] = useState<ExtraLecture | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    async function loadData() {
      try {
        // 1. Fetch semesters
        const { data: semesters, error: semError } = await supabase
          .from('semesters')
          .select('*');

        if (semError) throw semError;

        const active = semesters?.find((s) => s.is_active) || semesters?.[0] || null;
        setActiveSemester(active);

        if (active) {
          // Fetch Subjects
          const { data: subjectsData, error: subError } = await supabase
            .from('subjects')
            .select('*')
            .eq('semester_id', active.id);
          if (subError) throw subError;
          setSubjects(subjectsData || []);

          // Fetch Timetable Slots
          const { data: slotsData, error: slotError } = await supabase
            .from('timetable_slots')
            .select('*')
            .eq('semester_id', active.id);
          if (slotError) throw slotError;
          setSlots(slotsData || []);

          // Fetch Special Days
          const { data: specialData, error: specError } = await supabase
            .from('special_days')
            .select('*')
            .eq('semester_id', active.id)
            .order('date', { ascending: true });
          if (specError) throw specError;
          setSpecialDays(specialData || []);

          // Fetch Extra Lectures
          const { data: extraData, error: extraError } = await supabase
            .from('extra_lectures')
            .select('*')
            .eq('semester_id', active.id)
            .order('date', { ascending: true });
          if (extraError) throw extraError;
          setExtraLectures(extraData || []);
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to load timetable data', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [supabase]);

  // Visual grid click handler
  const handleCellClick = (day: number, hour: number) => {
    if (!editMode || subjects.length === 0) return;

    // Check if slot exists
    const formattedStartTime = `${hour.toString().padStart(2, '0')}:00:00`;
    const existing = slots.find((s) => s.day_of_week === day && s.start_time === formattedStartTime);

    if (existing) {
      // Edit mode for existing slot
      setEditingSlot(existing);
      setSelectedCell(null);
      setSlotSubjectId(existing.subject_id);
      setSlotRoom(existing.room || '');
      setSlotFaculty(existing.faculty || '');
      
      // Calculate duration in hours
      const startH = parseInt(existing.start_time.split(':')[0]);
      const endH = parseInt(existing.end_time.split(':')[0]);
      setSlotDuration(endH - startH);
      
      setIsSlotModalOpen(true);
    } else {
      // Create new slot
      setEditingSlot(null);
      setSelectedCell({ day, hour });
      setSlotSubjectId(subjects[0].id);
      setSlotRoom('');
      setSlotFaculty('');
      setSlotDuration(1);
      setIsSlotModalOpen(true);
    }
  };

  const handleSaveSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSemester) return;

    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User session not found');

      if (editingSlot) {
        // UPDATE Slot
        const startHour = parseInt(editingSlot.start_time.split(':')[0]);
        const endHourStr = `${(startHour + slotDuration).toString().padStart(2, '0')}:00:00`;

        const { data, error } = await supabase
          .from('timetable_slots')
          .update({
            subject_id: slotSubjectId,
            end_time: endHourStr,
            room: slotRoom.trim() || null,
            faculty: slotFaculty.trim() || null,
          })
          .eq('id', editingSlot.id)
          .select()
          .single();

        if (error) throw error;

        setSlots(slots.map((s) => (s.id === editingSlot.id ? data : s)));
        showToast('Timetable slot updated.');
      } else if (selectedCell) {
        // CREATE Slot
        const { day, hour } = selectedCell;
        const startTimeStr = `${hour.toString().padStart(2, '0')}:00:00`;
        const endTimeStr = `${(hour + slotDuration).toString().padStart(2, '0')}:00:00`;

        const { data, error } = await supabase
          .from('timetable_slots')
          .insert({
            user_id: user.id,
            semester_id: activeSemester.id,
            subject_id: slotSubjectId,
            day_of_week: day,
            start_time: startTimeStr,
            end_time: endTimeStr,
            room: slotRoom.trim() || null,
            faculty: slotFaculty.trim() || null,
          })
          .select()
          .single();

        if (error) throw error;

        setSlots([...slots, data]);
        showToast('Timetable slot added.');
      }

      setIsSlotModalOpen(false);
      router.refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to save timetable slot', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSlot = async () => {
    if (!slotToDelete) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('timetable_slots').delete().eq('id', slotToDelete.id);
      if (error) throw error;

      setSlots(slots.filter((s) => s.id !== slotToDelete.id));
      setSlotToDelete(null);
      setIsSlotModalOpen(false);
      showToast('Slot deleted.');
      router.refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete slot', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Special Days DML
  const handleSaveSpecialDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!specialDayDate || !specialDayLabel.trim() || !activeSemester) return;

    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User session not found');

      const { data, error } = await supabase
        .from('special_days')
        .insert({
          user_id: user.id,
          semester_id: activeSemester.id,
          date: specialDayDate,
          type: specialDayType,
          label: specialDayLabel.trim(),
        })
        .select()
        .single();

      if (error) throw error;

      // Sort special days by date
      const updatedList = [...specialDays, data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setSpecialDays(updatedList);
      setIsSpecialDayModalOpen(false);
      setSpecialDayDate('');
      setSpecialDayLabel('');
      showToast('Special day recorded.');
      router.refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to save special day', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSpecialDay = async () => {
    if (!specialDayToDelete) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('special_days').delete().eq('id', specialDayToDelete.id);
      if (error) throw error;

      setSpecialDays(specialDays.filter((s) => s.id !== specialDayToDelete.id));
      setSpecialDayToDelete(null);
      showToast('Special day removed.');
      router.refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete special day', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Extra Lectures DML
  const handleSaveExtraLecture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extraSubId || !extraDate || !extraStart || !extraEnd || !activeSemester) return;
    if (extraStart >= extraEnd) {
      showToast('Start time must be before end time.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User session not found');

      const { data, error } = await supabase
        .from('extra_lectures')
        .insert({
          user_id: user.id,
          semester_id: activeSemester.id,
          subject_id: extraSubId,
          date: extraDate,
          start_time: extraStart.includes(':') && extraStart.split(':').length === 2 ? `${extraStart}:00` : extraStart,
          end_time: extraEnd.includes(':') && extraEnd.split(':').length === 2 ? `${extraEnd}:00` : extraEnd,
          reason: extraReason.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      const updated = [...extraLectures, data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setExtraLectures(updated);
      setIsExtraLectureModalOpen(false);
      setExtraDate('');
      setExtraReason('');
      showToast('Extra lecture scheduled.');
      router.refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to save extra lecture', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteExtraLecture = async () => {
    if (!extraLectureToDelete) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('extra_lectures').delete().eq('id', extraLectureToDelete.id);
      if (error) throw error;

      setExtraLectures(extraLectures.filter((s) => s.id !== extraLectureToDelete.id));
      setExtraLectureToDelete(null);
      showToast('Extra lecture cancelled/deleted.');
      router.refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete extra lecture', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const openAddExtraLectureModal = () => {
    if (subjects.length === 0) {
      showToast('Please add subjects first.', 'error');
      return;
    }
    setExtraSubId(subjects[0].id);
    setExtraDate('');
    setExtraStart('09:00');
    setExtraEnd('10:00');
    setExtraReason('');
    setIsExtraLectureModalOpen(true);
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const upcomingSpecialDays = specialDays.filter((s) => s.date >= todayStr);
  const pastSpecialDays = specialDays.filter((s) => s.date < todayStr);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-8 bg-[#EBEBEB] w-48 rounded animate-pulse" />
          <div className="h-8 bg-[#EBEBEB] w-32 rounded animate-pulse" />
        </div>
        <div className="h-96 bg-[#EBEBEB] rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium text-[#111111] tracking-tight">
            Schedule & Timetable
          </h1>
          <p className="text-xs text-[#6B6B6B]">
            Set up repeating slots, schedule extra lectures, or define calendar holidays.
          </p>
        </div>

        {/* Tab Toggle buttons */}
        <div className="flex items-center bg-white border border-[#EBEBEB] rounded-lg p-0.5 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('schedule')}
            className={`text-xs px-3.5 py-1.5 font-medium rounded-md transition-colors ${
              activeTab === 'schedule' ? 'bg-[#5B5BD6]/8 text-[#5B5BD6]' : 'text-[#6B6B6B] hover:text-[#111111]'
            }`}
          >
            Weekly Schedule
          </button>
          <button
            onClick={() => setActiveTab('special_days')}
            className={`text-xs px-3.5 py-1.5 font-medium rounded-md transition-colors ${
              activeTab === 'special_days' ? 'bg-[#5B5BD6]/8 text-[#5B5BD6]' : 'text-[#6B6B6B] hover:text-[#111111]'
            }`}
          >
            Special Days
          </button>
        </div>
      </div>

      {!activeSemester ? (
        <div className="card text-center py-12">
          <Calendar size={32} className="mx-auto text-[#ABABAB] mb-3" />
          <h3 className="text-sm font-medium text-[#111111] mb-1">No Active Semester</h3>
          <p className="text-xs text-[#6B6B6B] max-w-sm mx-auto mb-4">
            Activate a semester in Settings to manage timetable grids and special day configurations.
          </p>
        </div>
      ) : (
        <>
          {/* TAB 1: Weekly Schedule Grid */}
          {activeTab === 'schedule' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Edit Mode Toggle */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-[#6B6B6B]">
                    {editMode ? 'Edit Mode Active (Click cell to edit)' : 'Read-only (Toggle to edit)'}
                  </span>
                </div>
                <button
                  onClick={() => setEditMode(!editMode)}
                  className={`flex items-center gap-1.5 text-xs py-1.5 px-3 rounded-md border transition-colors ${
                    editMode
                      ? 'bg-[#5B5BD6]/8 text-[#5B5BD6] border-[#5B5BD6]/20 font-medium'
                      : 'bg-white text-[#6B6B6B] border-[#EBEBEB] hover:text-[#111111]'
                  }`}
                >
                  {editMode ? 'Disable Editing' : 'Enable Editing'}
                </button>
              </div>

              {subjects.length === 0 ? (
                <div className="card text-center py-8">
                  <p className="text-xs text-[#6B6B6B] mb-3">Add subjects before creating your schedule.</p>
                  <button
                    onClick={() => router.push('/dashboard/subjects')}
                    className="btn-primary text-xs py-2 px-4"
                  >
                    Go to Subjects
                  </button>
                </div>
              ) : (
                /* Grid Table */
                <div className="overflow-x-auto border border-[#EBEBEB] rounded-lg bg-white">
                  <div className="min-w-[650px] grid grid-cols-7 text-center divide-x divide-y divide-[#EBEBEB]">
                    {/* Headers */}
                    <div className="bg-[#FAFAFA] py-2.5 text-xs font-medium text-[#6B6B6B] border-t-0 border-l-0">Time</div>
                    {DAYS.map((day) => (
                      <div key={day.val} className="bg-[#FAFAFA] py-2.5 text-xs font-medium text-[#6B6B6B] border-t-0">
                        {day.label}
                      </div>
                    ))}

                    {/* Hourly Rows (8 AM to 6 PM) */}
                    {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((hour) => {
                      const hourLabel = hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`;
                      return (
                        <div key={hour} className="contents">
                          {/* Left Time Label */}
                          <div className="bg-[#FAFAFA] py-3 text-[11px] font-medium text-[#6B6B6B] flex items-center justify-center border-l-0">
                            {hourLabel}
                          </div>
                          {/* Day Column Cells */}
                          {[1, 2, 3, 4, 5, 6].map((day) => {
                            const formattedStartTime = `${hour.toString().padStart(2, '0')}:00:00`;
                            const activeSlot = slots.find(
                              (s) => s.day_of_week === day && s.start_time === formattedStartTime
                            );
                            const matchedSub = activeSlot
                              ? subjects.find((s) => s.id === activeSlot.subject_id)
                              : null;

                            return (
                              <div
                                key={`${day}-${hour}`}
                                onClick={() => handleCellClick(day, hour)}
                                className={`p-1.5 h-16 flex items-center justify-center transition-colors ${
                                  editMode ? 'cursor-pointer hover:bg-[#FAFAFA]' : ''
                                }`}
                              >
                                {matchedSub ? (
                                  <div
                                    className="w-full h-full rounded-md p-1.5 text-[10px] text-white flex flex-col justify-between items-start text-left truncate overflow-hidden"
                                    style={{ backgroundColor: matchedSub.color }}
                                  >
                                    <div className="flex justify-between items-center w-full">
                                      <span className="font-semibold truncate">{matchedSub.short_code}</span>
                                      {editMode && <Edit2 size={8} className="opacity-70 flex-shrink-0" />}
                                    </div>
                                    <div className="w-full flex justify-between items-end text-[8px] opacity-85 truncate">
                                      <span className="truncate">{activeSlot?.room || ''}</span>
                                      <span className="truncate">{activeSlot?.faculty || ''}</span>
                                    </div>
                                  </div>
                                ) : (
                                  editMode && <span className="text-[10px] text-[#ABABAB] opacity-0 hover:opacity-100">+ Add</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Special Days Management */}
          {activeTab === 'special_days' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-[#111111]">
                  Special Days & Holidays
                </h2>
                <button
                  onClick={() => setIsSpecialDayModalOpen(true)}
                  className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                >
                  <Plus size={14} /> Add Special Day
                </button>
              </div>

              {/* Upcoming Special Days */}
              <div className="card">
                <h3 className="text-xs font-semibold text-[#111111] mb-3">
                  Upcoming Holidays & Alterations
                </h3>
                {upcomingSpecialDays.length === 0 ? (
                  <p className="text-xs text-[#6B6B6B] py-2">
                    No upcoming special days scheduled.
                  </p>
                ) : (
                  <div className="divide-y divide-[#EBEBEB]">
                    {upcomingSpecialDays.map((sd) => (
                      <div key={sd.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[#111111]">{sd.label}</span>
                            <span
                              className={`inline-block px-1.5 py-0.5 text-[9px] font-medium rounded-full ${
                                sd.type === 'holiday'
                                  ? 'bg-[#DC2626]/10 text-[#DC2626]'
                                  : sd.type === 'no_college'
                                  ? 'bg-amber-500/10 text-amber-500'
                                  : 'bg-[#1A9E5F]/10 text-[#1A9E5F]'
                              }`}
                            >
                              {sd.type === 'holiday'
                                ? 'Holiday'
                                : sd.type === 'no_college'
                                ? 'No College'
                                : 'Extra Working'}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#6B6B6B] mt-1 block">
                            {new Date(sd.date).toLocaleDateString(undefined, {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                        <button
                          onClick={() => setSpecialDayToDelete(sd)}
                          className="text-[#6B6B6B] hover:text-[#DC2626] p-1.5 rounded transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Past Special Days */}
              {pastSpecialDays.length > 0 && (
                <div className="card bg-[#FAFAFA] opacity-75">
                  <h3 className="text-xs font-semibold text-[#6B6B6B] mb-3">
                    Past Holidays & Days
                  </h3>
                  <div className="divide-y divide-[#EBEBEB]">
                    {pastSpecialDays.map((sd) => (
                      <div key={sd.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                        <div>
                          <span className="text-xs font-medium text-[#6B6B6B] line-through">{sd.label}</span>
                          <span className="text-[10px] text-[#ABABAB] ml-2 font-medium bg-white px-1.5 py-0.5 rounded border border-[#EBEBEB]">
                            {sd.type.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-[#ABABAB] mt-0.5 block">
                            {new Date(sd.date).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          onClick={() => setSpecialDayToDelete(sd)}
                          className="text-[#ABABAB] hover:text-[#DC2626] p-1 rounded"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* EXTRA LECTURES SECTION */}
          <div className="border-t border-[#EBEBEB] pt-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-medium text-[#111111]">
                  Extra & Rescheduled Lectures
                </h2>
                <p className="text-xs text-[#6B6B6B] mt-0.5">
                  Schedule one-off lectures that fall outside of your normal weekly timetable slots.
                </p>
              </div>
              <button
                onClick={openAddExtraLectureModal}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
              >
                <Plus size={14} /> Schedule Extra Lecture
              </button>
            </div>

            {extraLectures.length === 0 ? (
              <div className="card text-center py-6 text-xs text-[#6B6B6B]">
                No one-off extra lectures scheduled.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {extraLectures.map((el) => {
                  const subject = subjects.find((s) => s.id === el.subject_id);
                  const cleanTime = (time: string) => {
                    const parts = time.split(':');
                    const hr = parseInt(parts[0]);
                    const suffix = hr >= 12 ? 'PM' : 'AM';
                    const hour12 = hr > 12 ? hr - 12 : hr === 0 ? 12 : hr;
                    return `${hour12}:${parts[1]} ${suffix}`;
                  };

                  return (
                    <div
                      key={el.id}
                      className="card relative flex flex-col justify-between p-4 pl-5 overflow-hidden group hover:border-[#ABABAB] transition-colors bg-white"
                    >
                      {/* Left color bar */}
                      <div
                        className="absolute top-0 bottom-0 left-0 w-1.5"
                        style={{ backgroundColor: subject?.color || '#EBEBEB' }}
                      />

                      <div className="flex items-start justify-between min-w-0">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#111111] truncate">
                              {subject?.name || 'Unknown Subject'}
                            </span>
                            <span className="text-[9px] text-[#6B6B6B] font-medium bg-[#FAFAFA] border border-[#EBEBEB] px-1 rounded">
                              Extra
                            </span>
                          </div>
                          
                          <span className="text-[11px] text-[#6B6B6B] mt-2 block font-medium">
                            {new Date(el.date).toLocaleDateString(undefined, {
                              weekday: 'short',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span className="text-[10px] text-[#6B6B6B] mt-0.5 block">
                            {cleanTime(el.start_time)} – {cleanTime(el.end_time)}
                          </span>
                          {el.reason && (
                            <span className="text-[10px] text-[#ABABAB] mt-1.5 block leading-normal italic">
                              "{el.reason}"
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => setExtraLectureToDelete(el)}
                          className="text-[#ABABAB] hover:text-[#DC2626] p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Timetable Slot Create/Edit Modal */}
          <Modal
            isOpen={isSlotModalOpen}
            onClose={() => setIsSlotModalOpen(false)}
            title={editingSlot ? 'Edit Timetable Slot' : 'Add Timetable Slot'}
          >
            <form onSubmit={handleSaveSlot} className="space-y-4">
              <div>
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  Select Subject
                </label>
                <select
                  value={slotSubjectId}
                  onChange={(e) => setSlotSubjectId(e.target.value)}
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
                  <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                    Duration (hours)
                  </label>
                  <select
                    value={slotDuration}
                    onChange={(e) => setSlotDuration(Number(e.target.value))}
                    className="input-field text-sm bg-white"
                    disabled={actionLoading}
                  >
                    <option value={1}>1 hour</option>
                    <option value={2}>2 hours</option>
                    <option value={3}>3 hours</option>
                  </select>
                </div>
                <div>
                  <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                    Room (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. LH 301"
                    value={slotRoom}
                    onChange={(e) => setSlotRoom(e.target.value)}
                    className="input-field text-sm"
                    disabled={actionLoading}
                  />
                </div>
              </div>

              <div>
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  Faculty Name (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Prof. Kumar"
                  value={slotFaculty}
                  onChange={(e) => setSlotFaculty(e.target.value)}
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
                  {editingSlot ? 'Save Changes' : 'Add Slot'}
                </button>
                {editingSlot && (
                  <button
                    type="button"
                    onClick={() => setSlotToDelete(editingSlot)}
                    disabled={actionLoading}
                    className="btn-secondary border-[#DC2626]/20 text-[#DC2626] hover:bg-[#DC2626]/5 hover:border-[#DC2626] text-xs py-2 flex-1"
                  >
                    Delete Slot
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsSlotModalOpen(false)}
                  className="btn-secondary text-xs py-2 flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Modal>

          {/* Delete Slot confirmation */}
          <Modal
            isOpen={slotToDelete !== null}
            onClose={() => setSlotToDelete(null)}
            title="Delete Slot"
          >
            <div className="space-y-4">
              <p className="text-xs text-[#6B6B6B] leading-relaxed">
                Confirm removing this timetable slot. Removing this slot does not delete the subject itself, but classes won't be auto-scheduled here anymore.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteSlot}
                  disabled={actionLoading}
                  className="btn-primary bg-[#DC2626] hover:bg-[#DC2626]/90 border-transparent text-xs py-2 flex-1"
                >
                  Delete Permanently
                </button>
                <button
                  onClick={() => setSlotToDelete(null)}
                  className="btn-secondary text-xs py-2 flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Modal>

          {/* Special Day Creation Modal */}
          <Modal
            isOpen={isSpecialDayModalOpen}
            onClose={() => setIsSpecialDayModalOpen(false)}
            title="Add Special Day / Holiday"
          >
            <form onSubmit={handleSaveSpecialDay} className="space-y-4">
              <div>
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={specialDayDate}
                  onChange={(e) => setSpecialDayDate(e.target.value)}
                  className="input-field text-sm"
                  disabled={actionLoading}
                />
              </div>

              <div>
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  Day Type
                </label>
                <select
                  value={specialDayType}
                  onChange={(e) => setSpecialDayType(e.target.value as any)}
                  className="input-field text-sm bg-white"
                  disabled={actionLoading}
                >
                  <option value="holiday">Holiday (No College + No Classes)</option>
                  <option value="no_college">No College (Individual Reason)</option>
                  <option value="extra_working">Extra Working Day (Loads timetable/classes)</option>
                </select>
              </div>

              <div>
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  Label / Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Independence Day, Sick Leave"
                  value={specialDayLabel}
                  onChange={(e) => setSpecialDayLabel(e.target.value)}
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
                  Record Day
                </button>
                <button
                  type="button"
                  onClick={() => setIsSpecialDayModalOpen(false)}
                  className="btn-secondary text-xs py-2 flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Modal>

          {/* Delete Special Day Confirmation */}
          <Modal
            isOpen={specialDayToDelete !== null}
            onClose={() => setSpecialDayToDelete(null)}
            title="Remove Special Day"
          >
            <div className="space-y-4">
              <p className="text-xs text-[#6B6B6B] leading-relaxed">
                Are you sure you want to remove the special day marker for <span className="font-medium text-[#111111]">"{specialDayToDelete?.label}"</span> on {specialDayToDelete?.date}? Timetable slots for this day will resume calculations.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteSpecialDay}
                  disabled={actionLoading}
                  className="btn-primary bg-[#DC2626] hover:bg-[#DC2626]/90 border-transparent text-xs py-2 flex-1"
                >
                  Confirm Remove
                </button>
                <button
                  onClick={() => setSpecialDayToDelete(null)}
                  className="btn-secondary text-xs py-2 flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Modal>

          {/* Extra Lecture Modal */}
          <Modal
            isOpen={isExtraLectureModalOpen}
            onClose={() => setIsExtraLectureModalOpen(false)}
            title="Schedule Extra Lecture"
          >
            <form onSubmit={handleSaveExtraLecture} className="space-y-4">
              <div>
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  Select Subject
                </label>
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

              <div>
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  Date
                </label>
                <input
                  type="date"
                  required
                  value={extraDate}
                  onChange={(e) => setExtraDate(e.target.value)}
                  className="input-field text-sm"
                  disabled={actionLoading}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                    Start Time
                  </label>
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
                  <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                    End Time
                  </label>
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
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  Reason / Notes (optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Compensatory lecture, Lab exam"
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
                  onClick={() => setIsExtraLectureModalOpen(false)}
                  className="btn-secondary text-xs py-2 flex-1"
                >
                  Cancel
                </button>
              </div>
            </form>
          </Modal>

          {/* Delete Extra Lecture Confirmation */}
          <Modal
            isOpen={extraLectureToDelete !== null}
            onClose={() => setExtraLectureToDelete(null)}
            title="Cancel Extra Lecture"
          >
            <div className="space-y-4">
              <p className="text-xs text-[#6B6B6B] leading-relaxed">
                Confirm removing this one-off extra lecture. This will erase the lecture and any logged attendance records linked to it.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteExtraLecture}
                  disabled={actionLoading}
                  className="btn-primary bg-[#DC2626] hover:bg-[#DC2626]/90 border-transparent text-xs py-2 flex-1"
                >
                  Delete Lecture
                </button>
                <button
                  onClick={() => setExtraLectureToDelete(null)}
                  className="btn-secondary text-xs py-2 flex-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </Modal>
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-3 rounded-lg bg-white border border-[#EBEBEB] max-w-sm flex items-center gap-2.5 animate-in fade-in duration-200">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              toast.type === 'error' ? 'bg-[#DC2626]' : 'bg-[#1A9E5F]'
            }`}
          />
          <span className="text-xs font-medium text-[#111111]">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
