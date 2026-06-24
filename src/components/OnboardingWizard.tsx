'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, ChevronRight, ChevronLeft, Check, Calendar, BookOpen, Clock } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase';

// 8 Preset Colors from the style guide
const COLOR_PRESETS = [
  { name: 'Indigo', hex: '#5B5BD6' },
  { name: 'Teal', hex: '#0D9488' },
  { name: 'Rose', hex: '#E11D48' },
  { name: 'Amber', hex: '#D97706' },
  { name: 'Green', hex: '#1A9E5F' },
  { name: 'Violet', hex: '#7C3AED' },
  { name: 'Sky', hex: '#0284C7' },
  { name: 'Orange', hex: '#EA580C' },
];

interface OnboardingSubject {
  tempId: string;
  name: string;
  shortCode: string;
  totalHours: number;
  targetPercent: number;
  color: string;
}

interface OnboardingSlot {
  dayOfWeek: number; // 1-6
  startTime: string; // "HH:MM:SS"
  endTime: string;   // "HH:MM:SS"
  subjectTempId: string;
  room?: string;
  faculty?: string;
}

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 State: Semester
  const [semesterName, setSemesterName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Step 2 State: Subjects
  const [subjects, setSubjects] = useState<OnboardingSubject[]>([]);
  const [subName, setSubName] = useState('');
  const [subCode, setSubCode] = useState('');
  const [subHours, setSubHours] = useState(40);
  const [subTarget, setSubTarget] = useState(80);
  const [subColor, setSubColor] = useState(COLOR_PRESETS[0].hex);

  // Step 3 State: Timetable Slots
  const [timetableSlots, setTimetableSlots] = useState<OnboardingSlot[]>([]);
  const [selectedCell, setSelectedCell] = useState<{ day: number; hour: number } | null>(null);
  const [selectedCellSubjectId, setSelectedCellSubjectId] = useState('');
  const [cellRoom, setCellRoom] = useState('');
  const [cellFaculty, setCellFaculty] = useState('');
  const [cellDuration, setCellDuration] = useState(1); // Hours

  // Auto-generate subject code on subject name change
  const handleSubjectNameChange = (val: string) => {
    setSubName(val);
    if (val.trim()) {
      const words = val.trim().split(/\s+/);
      const code = words
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 4);
      setSubCode(code);
    } else {
      setSubCode('');
    }
  };

  const addSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim() || !subCode.trim()) return;

    const newSub: OnboardingSubject = {
      tempId: Math.random().toString(36).substring(2, 9),
      name: subName,
      shortCode: subCode,
      totalHours: Number(subHours),
      targetPercent: Number(subTarget),
      color: subColor,
    };

    setSubjects([...subjects, newSub]);
    setSubName('');
    setSubCode('');
    setSubHours(40);
    setSubTarget(80);
    // Cycle default colors
    const nextColorIndex = (subjects.length + 1) % COLOR_PRESETS.length;
    setSubColor(COLOR_PRESETS[nextColorIndex].hex);
  };

  const removeSubject = (tempId: string) => {
    setSubjects(subjects.filter((s) => s.tempId !== tempId));
    // Also remove timetable slots linked to this subject
    setTimetableSlots(timetableSlots.filter((slot) => slot.subjectTempId !== tempId));
  };

  const handleCellClick = (day: number, hour: number) => {
    if (subjects.length === 0) return;
    
    // Check if slot already exists in this day + start time
    const formattedStartTime = `${hour.toString().padStart(2, '0')}:00:00`;
    const existingIndex = timetableSlots.findIndex(
      (s) => s.dayOfWeek === day && s.startTime === formattedStartTime
    );

    if (existingIndex > -1) {
      // Remove slot
      setTimetableSlots(timetableSlots.filter((_, idx) => idx !== existingIndex));
    } else {
      // Open selector
      setSelectedCell({ day, hour });
      setSelectedCellSubjectId(subjects[0].tempId);
      setCellRoom('');
      setCellFaculty('');
      setCellDuration(1);
    }
  };

  const saveCellSlot = () => {
    if (!selectedCell || !selectedCellSubjectId) return;

    const { day, hour } = selectedCell;
    const startTimeStr = `${hour.toString().padStart(2, '0')}:00:00`;
    const endTimeStr = `${(hour + cellDuration).toString().padStart(2, '0')}:00:00`;

    const newSlot: OnboardingSlot = {
      dayOfWeek: day,
      startTime: startTimeStr,
      endTime: endTimeStr,
      subjectTempId: selectedCellSubjectId,
      room: cellRoom.trim() || undefined,
      faculty: cellFaculty.trim() || undefined,
    };

    setTimetableSlots([...timetableSlots, newSlot]);
    setSelectedCell(null);
  };

  const finishOnboarding = async () => {
    setError(null);
    setLoading(true);

    const supabase = createSupabaseBrowserClient();
    
    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setError('You must be signed in to perform this action.');
      setLoading(false);
      return;
    }

    try {
      // 1. Save Semester
      const { data: semesterData, error: semError } = await supabase
        .from('semesters')
        .insert({
          user_id: user.id,
          name: semesterName,
          start_date: startDate,
          end_date: endDate,
          is_active: true,
        })
        .select()
        .single();

      if (semError) throw semError;
      const semesterId = semesterData.id;

      // 2. Save Subjects and track IDs map
      const tempToDbIdMap: Record<string, string> = {};
      
      for (const sub of subjects) {
        const { data: subData, error: subError } = await supabase
          .from('subjects')
          .insert({
            user_id: user.id,
            semester_id: semesterId,
            name: sub.name,
            short_code: sub.shortCode,
            total_hours: sub.totalHours,
            attendance_target_percent: sub.targetPercent,
            color: sub.color,
          })
          .select()
          .single();

        if (subError) throw subError;
        tempToDbIdMap[sub.tempId] = subData.id;
      }

      // 3. Save Timetable Slots (if any)
      if (timetableSlots.length > 0) {
        const slotsToInsert = timetableSlots.map((slot) => ({
          user_id: user.id,
          semester_id: semesterId,
          subject_id: tempToDbIdMap[slot.subjectTempId],
          day_of_week: slot.dayOfWeek,
          start_time: slot.startTime,
          end_time: slot.endTime,
          room: slot.room || null,
          faculty: slot.faculty || null,
        }));

        const { error: slotsError } = await supabase
          .from('timetable_slots')
          .insert(slotsToInsert);

        if (slotsError) throw slotsError;
      }

      // Refresh layout to exit onboarding flow
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to complete onboarding. Please try again.');
      setLoading(false);
    }
  };

  const nextStep = () => {
    setError(null);
    if (step === 1) {
      if (!semesterName.trim() || !startDate || !endDate) {
        setError('Please fill in all semester details.');
        return;
      }
      if (new Date(startDate) > new Date(endDate)) {
        setError('Start date cannot be after end date.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (subjects.length === 0) {
        setError('Please add at least one subject to proceed.');
        return;
      }
      setStep(3);
    }
  };

  const prevStep = () => {
    setError(null);
    setStep(step - 1);
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-8">
      {/* Visual Stepper */}
      <div className="flex items-center justify-between px-6 mb-8 max-w-md mx-auto">
        {[1, 2, 3].map((num) => (
          <div key={num} className="flex items-center flex-1 last:flex-initial">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-xs border transition-colors ${
                step >= num
                  ? 'bg-[#5B5BD6] text-white border-[#5B5BD6]'
                  : 'bg-white text-[#6B6B6B] border-[#EBEBEB]'
              }`}
            >
              {step > num ? <Check size={14} /> : num}
            </div>
            {num < 3 && (
              <div
                className={`h-[1px] flex-1 mx-4 transition-colors ${
                  step > num ? 'bg-[#5B5BD6]' : 'bg-[#EBEBEB]'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      <div className="card max-w-2xl mx-auto">
        {error && (
          <div className="mb-6 p-3 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/20 text-[#DC2626] text-xs">
            {error}
          </div>
        )}

        {/* STEP 1: Semester Setup */}
        {step === 1 && (
          <div>
            <div className="flex items-center gap-2 mb-6">
              <Calendar className="text-[#5B5BD6]" size={20} />
              <h2 className="text-base font-medium text-[#111111]">
                Step 1: Set up your Semester
              </h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  Semester Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Semester 6 2025-26"
                  value={semesterName}
                  onChange={(e) => setSemesterName(e.target.value)}
                  className="input-field text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="input-field text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Add Subjects */}
        {step === 2 && (
          <div>
            <div className="flex items-center gap-2 mb-6">
              <BookOpen className="text-[#5B5BD6]" size={20} />
              <h2 className="text-base font-medium text-[#111111]">
                Step 2: Add your Academic Subjects
              </h2>
            </div>

            {/* Added list */}
            {subjects.length > 0 && (
              <div className="mb-6 p-4 rounded-lg bg-[#FAFAFA] border border-[#EBEBEB] space-y-2">
                <p className="text-xs text-[#6B6B6B] font-medium mb-2">Added Subjects ({subjects.length})</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {subjects.map((sub) => (
                    <div
                      key={sub.tempId}
                      className="flex items-center justify-between p-2.5 bg-white border border-[#EBEBEB] rounded-lg text-sm"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: sub.color }}
                        />
                        <span className="font-medium truncate text-[#111111]">
                          {sub.name}
                        </span>
                        <span className="text-xs text-[#6B6B6B] flex-shrink-0 bg-[#FAFAFA] px-1.5 py-0.5 rounded border border-[#EBEBEB]">
                          {sub.shortCode}
                        </span>
                      </div>
                      <button
                        onClick={() => removeSubject(sub.tempId)}
                        className="text-[#6B6B6B] hover:text-[#DC2626] transition-colors p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={addSubject} className="space-y-4 pt-2 border-t border-[#EBEBEB]">
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                    Subject Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Machine Learning"
                    value={subName}
                    onChange={(e) => handleSubjectNameChange(e.target.value)}
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                    Short Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., ML"
                    value={subCode}
                    onChange={(e) => setSubCode(e.target.value.toUpperCase())}
                    className="input-field text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                    Total Syllabus Hours
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={subHours}
                    onChange={(e) => setSubHours(Number(e.target.value))}
                    className="input-field text-sm"
                  />
                </div>
                <div>
                  <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                    Target Attendance %
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={subTarget}
                    onChange={(e) => setSubTarget(Number(e.target.value))}
                    className="input-field text-sm"
                  />
                </div>
              </div>

              {/* Color Swatch Picker */}
              <div>
                <label className="text-[#6B6B6B] text-xs mb-2 block">
                  Select Theme Color
                </label>
                <div className="flex flex-wrap gap-2.5">
                  {COLOR_PRESETS.map((color) => (
                    <button
                      key={color.hex}
                      type="button"
                      onClick={() => setSubColor(color.hex)}
                      className={`w-6 h-6 rounded-full border flex items-center justify-center transition-transform ${
                        subColor === color.hex ? 'scale-110 border-[#111111]' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color.hex }}
                    >
                      {subColor === color.hex && (
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="btn-secondary w-full text-xs py-2 mt-2 flex items-center justify-center gap-1.5"
              >
                <Plus size={14} /> Add Subject
              </button>
            </form>
          </div>
        )}

        {/* STEP 3: Setup Timetable Grid */}
        {step === 3 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="text-[#5B5BD6]" size={20} />
                <h2 className="text-base font-medium text-[#111111]">
                  Step 3: Define your Weekly Timetable
                </h2>
              </div>
              <button
                onClick={finishOnboarding}
                disabled={loading}
                className="text-xs text-[#6B6B6B] hover:text-[#111111] transition-colors"
              >
                Skip for now
              </button>
            </div>
            <p className="text-xs text-[#6B6B6B] mb-6">
              Click on the cells to paint your regular slots. Click again to delete.
            </p>

            {/* Visual Grid Container */}
            <div className="overflow-x-auto border border-[#EBEBEB] rounded-lg bg-white mb-6">
              <div className="min-w-[600px] grid grid-cols-7 text-center divide-x divide-y divide-[#EBEBEB]">
                {/* Headers */}
                <div className="bg-[#FAFAFA] py-2 text-xs font-medium text-[#6B6B6B] border-t-0 border-l-0">Time</div>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, i) => (
                  <div key={day} className="bg-[#FAFAFA] py-2 text-xs font-medium text-[#6B6B6B] border-t-0">
                    {day}
                  </div>
                ))}

                {/* Grid Cells */}
                {[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map((hour) => {
                  const hourLabel = hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`;
                  return (
                    <div key={hour} className="contents">
                      {/* Time Label */}
                      <div className="bg-[#FAFAFA] py-3 text-[11px] font-medium text-[#6B6B6B] flex items-center justify-center border-l-0">
                        {hourLabel}
                      </div>
                      {/* Day cells */}
                      {[1, 2, 3, 4, 5, 6].map((day) => {
                        const formattedStartTime = `${hour.toString().padStart(2, '0')}:00:00`;
                        const activeSlot = timetableSlots.find(
                          (s) => s.dayOfWeek === day && s.startTime === formattedStartTime
                        );
                        const matchedSub = activeSlot
                          ? subjects.find((s) => s.tempId === activeSlot.subjectTempId)
                          : null;

                        return (
                          <div
                            key={`${day}-${hour}`}
                            onClick={() => handleCellClick(day, hour)}
                            className="p-1 h-14 flex items-center justify-center cursor-pointer transition-colors hover:bg-[#FAFAFA]"
                          >
                            {matchedSub ? (
                              <div
                                className="w-full h-full rounded p-1 text-[10px] text-white flex flex-col justify-between items-start text-left truncate overflow-hidden transition-opacity hover:opacity-90"
                                style={{ backgroundColor: matchedSub.color }}
                              >
                                <span className="font-medium truncate block w-full">{matchedSub.shortCode}</span>
                                {activeSlot?.room && (
                                  <span className="text-[8px] opacity-80 block truncate w-full">{activeSlot.room}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[10px] text-[#ABABAB] opacity-0 hover:opacity-100">+ Add</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Custom Slot Creator Modal */}
            {selectedCell && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[1px]">
                <div className="w-full max-w-sm bg-white border border-[#EBEBEB] rounded-[10px] p-5">
                  <h3 className="text-sm font-medium text-[#111111] mb-4">
                    Add lecture to{' '}
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][selectedCell.day - 1]} at{' '}
                    {selectedCell.hour > 12 ? `${selectedCell.hour - 12}:00 PM` : `${selectedCell.hour}:00 AM`}
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                        Select Subject
                      </label>
                      <select
                        value={selectedCellSubjectId}
                        onChange={(e) => setSelectedCellSubjectId(e.target.value)}
                        className="input-field text-sm bg-white"
                      >
                        {subjects.map((sub) => (
                          <option key={sub.tempId} value={sub.tempId}>
                            {sub.name} ({sub.shortCode})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                          Duration (hrs)
                        </label>
                        <select
                          value={cellDuration}
                          onChange={(e) => setCellDuration(Number(e.target.value))}
                          className="input-field text-sm bg-white"
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
                          placeholder="e.g. LH 202"
                          value={cellRoom}
                          onChange={(e) => setCellRoom(e.target.value)}
                          className="input-field text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                        Faculty Name (optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Dr. Roy"
                        value={cellFaculty}
                        onChange={(e) => setCellFaculty(e.target.value)}
                        className="input-field text-sm"
                      />
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={saveCellSlot}
                        className="btn-primary text-xs py-2 flex-1"
                      >
                        Add to Schedule
                      </button>
                      <button
                        onClick={() => setSelectedCell(null)}
                        className="btn-secondary text-xs py-2 flex-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center mt-8 pt-4 border-t border-[#EBEBEB]">
          {step > 1 ? (
            <button
              onClick={prevStep}
              className="btn-secondary text-xs py-2 px-4 flex items-center gap-1.5"
              disabled={loading}
            >
              <ChevronLeft size={14} /> Back
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={nextStep}
              className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
            >
              Next <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={finishOnboarding}
              disabled={loading}
              className="btn-primary text-xs py-2 px-6 flex items-center gap-1.5"
            >
              {loading ? 'Completing setup...' : 'Complete setup'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
