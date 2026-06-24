'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutDashboard, AlertCircle, Sparkles, BookOpen, Target, Clock, Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { getSubjectStats, getOverallStats, getHoursBetween } from '@/lib/attendance';
import { DashboardSkeleton } from '@/components/ui/Skeletons';
import type { Semester, Subject } from '@/lib/types';

interface SubjectCardData {
  subject: Subject;
  stats: {
    attendedHours: number;
    missedHours: number;
    cancelledHours: number;
    attendancePercent: number;
    lecturesNeeded: number;
    lecturesSafeToMiss: number;
    status: 'safe' | 'borderline' | 'at_risk';
  };
  sparklineData: number[]; // 4 values representing last 4 weeks %
}

export default function DashboardPage() {
  const supabase = createSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(null);
  const [subjectsData, setSubjectsData] = useState<SubjectCardData[]>([]);
  
  // Overall Stats
  const [overallPercent, setOverallPercent] = useState(100);
  const [atRiskCount, setAtRiskCount] = useState(0);
  const [totalAttended, setTotalAttended] = useState(0);
  const [totalMissed, setTotalMissed] = useState(0);
  const [totalSyllabus, setTotalSyllabus] = useState(0);

  // Calculator State
  const [isCalcExpanded, setIsCalcExpanded] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState('');
  const [sliderVal, setSliderVal] = useState(100);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const getWeekRange = (weeksAgo: number) => {
    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1) - (weeksAgo * 7);
    const last = first + 6;
    
    const monday = new Date(new Date().setDate(first));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(new Date().setDate(last));
    sunday.setHours(23, 59, 59, 999);

    return { monday, sunday };
  };

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: semesters } = await supabase.from('semesters').select('*');
        const active = semesters?.find((s) => s.is_active) || semesters?.[0] || null;
        setActiveSemester(active);

        if (active) {
          // Fetch overall stats
          const oStats = await getOverallStats(supabase, active.id, user.id);
          setOverallPercent(oStats.overallPercent);
          setAtRiskCount(oStats.subjectsAtRisk);

          // Fetch subjects
          const { data: subjectsList } = await supabase
            .from('subjects')
            .select('*')
            .eq('semester_id', active.id)
            .order('created_at', { ascending: true });

          if (subjectsList && subjectsList.length > 0) {
            setSelectedSubId(subjectsList[0].id);

            // Fetch slots & extra lectures for sparklines & stats
            const { data: slots } = await supabase.from('timetable_slots').select('*').eq('semester_id', active.id);
            const { data: extraLectures } = await supabase.from('extra_lectures').select('*').eq('semester_id', active.id);
            
            // Fetch attendance records for user
            const { data: records } = await supabase.from('attendance_records').select('*').eq('user_id', user.id);

            let syllabusSum = 0;
            let attendedSum = 0;
            let missedSum = 0;

            const cards: SubjectCardData[] = [];

            for (const sub of subjectsList) {
              syllabusSum += sub.total_hours;

              // Subject stats
              const stats = await getSubjectStats(supabase, sub.id, active.id);
              attendedSum += stats.attendedHours;
              missedSum += stats.missedHours;

              // Calculate 4-week sparkline percentages
              const sparklineData: number[] = [];
              const subSlots = slots?.filter((s) => s.subject_id === sub.id) || [];
              const subExtras = extraLectures?.filter((e) => e.subject_id === sub.id) || [];
              
              const sIds = subSlots.map(s => s.id);
              const eIds = subExtras.map(e => e.id);

              for (let w = 3; w >= 0; w--) {
                const { monday, sunday } = getWeekRange(w);
                const monStr = monday.toISOString().split('T')[0];
                const sunStr = sunday.toISOString().split('T')[0];

                const weekRecords = records?.filter((r) => 
                  r.date >= monStr && r.date <= sunStr &&
                  ((r.timetable_slot_id && sIds.includes(r.timetable_slot_id)) || 
                   (r.extra_lecture_id && eIds.includes(r.extra_lecture_id)))
                ) || [];

                let wAttended = 0;
                let wHeld = 0;

                weekRecords.forEach((rec) => {
                  let duration = 1;
                  if (rec.timetable_slot_id) {
                    const sl = subSlots.find(s => s.id === rec.timetable_slot_id);
                    if (sl) duration = getHoursBetween(sl.start_time, sl.end_time);
                  } else if (rec.extra_lecture_id) {
                    const el = subExtras.find(e => e.id === rec.extra_lecture_id);
                    if (el) duration = getHoursBetween(el.start_time, el.end_time);
                  }

                  if (rec.status === 'attended') {
                    wAttended += duration;
                    wHeld += duration;
                  } else if (rec.status === 'missed') {
                    wHeld += duration;
                  }
                });

                const wPercent = wHeld > 0 ? (wAttended / wHeld) * 100 : 100;
                sparklineData.push(wPercent);
              }

              cards.push({
                subject: sub,
                stats,
                sparklineData,
              });
            }

            setSubjectsData(cards);
            setTotalAttended(attendedSum);
            setTotalMissed(missedSum);
            setTotalSyllabus(syllabusSum);
          }
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to load dashboard statistics', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, [supabase]);

  // Semester Progress calculations
  const getSemesterProgress = () => {
    if (!activeSemester) return { week: 0, total: 0, percent: 0 };
    const start = new Date(activeSemester.start_date).getTime();
    const end = new Date(activeSemester.end_date).getTime();
    const today = new Date().getTime();

    const totalWeeks = Math.ceil((end - start) / (7 * 24 * 60 * 60 * 1000));
    const currentWeek = Math.min(totalWeeks, Math.max(1, Math.ceil((today - start) / (7 * 24 * 60 * 60 * 1000))));
    const percent = Math.min(100, Math.max(0, Math.round((currentWeek / totalWeeks) * 100)));

    return { week: currentWeek, total: totalWeeks, percent };
  };

  const getStatusColorClass = (status: string) => {
    switch (status) {
      case 'safe':
        return 'text-[#1A9E5F] bg-[#1A9E5F]/10 border-[#1A9E5F]/15';
      case 'borderline':
        return 'text-[#D97706] bg-[#D97706]/10 border-[#D97706]/15';
      default:
        return 'text-[#DC2626] bg-[#DC2626]/10 border-[#DC2626]/15';
    }
  };

  const getStatusHexColor = (status: string) => {
    switch (status) {
      case 'safe':
        return '#1A9E5F';
      case 'borderline':
        return '#D97706';
      default:
        return '#DC2626';
    }
  };

  // What-if Calculator calculations
  const selectedSubData = subjectsData.find((s) => s.subject.id === selectedSubId);
  const remainingHours = selectedSubData
    ? Math.max(0, selectedSubData.subject.total_hours - (selectedSubData.stats.attendedHours + selectedSubData.stats.missedHours))
    : 0;

  const calculateFinalPercent = () => {
    if (!selectedSubData) return 0;
    const finalAttended = selectedSubData.stats.attendedHours + (sliderVal / 100) * remainingHours;
    return Math.round((finalAttended / selectedSubData.subject.total_hours) * 100);
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  const progress = getSemesterProgress();
  const stackedTotal = totalAttended + totalMissed + Math.max(0, totalSyllabus - (totalAttended + totalMissed));

  return (
    <div className="space-y-8 max-w-4xl animate-in fade-in duration-200">
      {/* Semester Progress Bar */}
      {activeSemester ? (
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-xl font-medium text-[#111111]">Dashboard</h1>
            </div>
            <span className="text-xs text-[#6B6B6B] font-medium font-sans">
              Week {progress.week} of {progress.total} — {progress.percent}% through semester
            </span>
          </div>
          <div className="w-full h-2 bg-[#EBEBEB] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#5B5BD6] rounded-full transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      ) : (
        <h1 className="text-xl font-medium text-[#111111]">Dashboard</h1>
      )}

      {/* Grid of Subject Cards */}
      {!activeSemester ? (
        <div className="card text-center py-12 bg-white">
          <LayoutDashboard size={32} className="mx-auto text-[#ABABAB] mb-3" />
          <h3 className="text-sm font-medium text-[#111111] mb-1">No Active Semester</h3>
          <p className="text-xs text-[#6B6B6B] max-w-sm mx-auto">
            Please configure your semester details in Settings first.
          </p>
        </div>
      ) : subjectsData.length === 0 ? (
        <div className="card text-center py-12 bg-white">
          <BookOpen size={32} className="mx-auto text-[#ABABAB] mb-3" />
          <h3 className="text-sm font-medium text-[#111111] mb-1">No Courses Added</h3>
          <p className="text-xs text-[#6B6B6B] max-w-sm mx-auto mb-4">
            Add subjects in the Subjects tab to populate your analytics dashboard.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {subjectsData.map(({ subject, stats, sparklineData }) => {
            const hexColor = getStatusHexColor(stats.status);
            const circ = 2 * Math.PI * 37; // radius 37
            const offset = circ * (1 - stats.attendancePercent / 100);

            return (
              <div key={subject.id} className="card flex flex-col justify-between h-[210px] bg-white">
                <div className="flex justify-between items-start gap-4">
                  {/* Left Side */}
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-[#111111] truncate">{subject.name}</h3>
                    <span className="inline-block text-[10px] text-[#6B6B6B] font-medium bg-[#FAFAFA] border border-[#EBEBEB] px-1.5 py-0.5 rounded mt-1.5">
                      {subject.short_code}
                    </span>
                    
                    {/* Status Badge */}
                    <div className="mt-3">
                      <span className={`inline-block text-[9px] font-semibold px-2 py-0.5 rounded-full border capitalize ${getStatusColorClass(stats.status)}`}>
                        {stats.status.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Center Circular Progress SVG */}
                  <div className="flex-shrink-0">
                    <svg className="w-[80px] h-[80px]" viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="37" fill="none" stroke="#EBEBEB" strokeWidth="5.5" />
                      <circle
                        cx="40"
                        cy="40"
                        r="37"
                        fill="none"
                        stroke={hexColor}
                        strokeWidth="5.5"
                        strokeDasharray={circ}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        transform="rotate(-90 40 40)"
                        className="transition-all duration-300"
                      />
                      <text
                        x="40"
                        y="45"
                        fontFamily="sans-serif"
                        fontWeight="600"
                        fontSize="13"
                        fill="#111111"
                        textAnchor="middle"
                      >
                        {Math.round(stats.attendancePercent)}%
                      </text>
                    </svg>
                  </div>

                  {/* Right Stats Column */}
                  <div className="text-right min-w-[70px]">
                    <span className="text-[10px] text-[#6B6B6B] font-medium block">Logged Class</span>
                    <span className="text-xs font-semibold text-[#111111] mt-0.5 block">
                      {stats.attendedHours} / {subject.total_hours} hrs
                    </span>

                    {stats.attendancePercent < subject.attendance_target_percent ? (
                      <span className="text-[9px] text-[#DC2626] font-medium mt-3 block leading-snug">
                        Need {stats.lecturesNeeded} class{stats.lecturesNeeded > 1 ? 'es' : ''}
                      </span>
                    ) : (
                      <span className="text-[9px] text-[#1A9E5F] font-medium mt-3 block leading-snug">
                        Safe to miss {stats.lecturesSafeToMiss}
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom sparkline */}
                <div className="border-t border-[#EBEBEB] pt-3 mt-4 flex items-center justify-between">
                  <span className="text-[10px] text-[#ABABAB] font-medium">Weekly Trend (last 4 wks)</span>
                  
                  {/* Visual 4-week bar sparkline */}
                  <svg className="w-[100px] h-[26px]" viewBox="0 0 100 26">
                    {sparklineData.map((pct, idx) => {
                      const barWidth = 14;
                      const gap = 8;
                      const x = idx * (barWidth + gap) + 12;
                      const maxBarHeight = 22;
                      const h = Math.max(2, (pct / 100) * maxBarHeight);
                      const y = 26 - h;
                      const isCurrentWeek = idx === 3;
                      const opacity = isCurrentWeek ? 1.0 : 0.45;

                      return (
                        <rect
                          key={idx}
                          x={x}
                          y={y}
                          width={barWidth}
                          height={h}
                          fill={subject.color}
                          opacity={opacity}
                          rx="2"
                        />
                      );
                    })}
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Overall Summary Card */}
      {activeSemester && subjectsData.length > 0 && (
        <div className="card space-y-5 bg-white">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-medium text-[#111111]">Overall Semester Attendance</h3>
            <span className="text-lg font-semibold text-[#111111]">{Math.round(overallPercent)}%</span>
          </div>

          {/* Horizontal Stacked Bar */}
          <div className="w-full h-3 bg-[#EBEBEB] rounded-full overflow-hidden flex">
            {totalAttended > 0 && (
              <div
                className="h-full bg-[#1A9E5F]"
                style={{ width: `${(totalAttended / stackedTotal) * 100}%` }}
                title={`Attended: ${totalAttended} hrs`}
              />
            )}
            {totalMissed > 0 && (
              <div
                className="h-full bg-[#DC2626]"
                style={{ width: `${(totalMissed / stackedTotal) * 100}%` }}
                title={`Missed: ${totalMissed} hrs`}
              />
            )}
            {Math.max(0, totalSyllabus - (totalAttended + totalMissed)) > 0 && (
              <div
                className="h-full bg-[#ABABAB]/25"
                style={{
                  width: `${(Math.max(0, totalSyllabus - (totalAttended + totalMissed)) / stackedTotal) * 100}%`,
                }}
                title={`Remaining: ${Math.max(0, totalSyllabus - (totalAttended + totalMissed))} hrs`}
              />
            )}
          </div>

          {/* Legend counts */}
          <div className="flex items-center gap-6 text-[11px] text-[#6B6B6B] font-medium pt-1 font-sans">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1A9E5F]" />
              <span>Attended: {totalAttended} hrs</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
              <span>Missed: {totalMissed} hrs</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ABABAB]/30" />
              <span>Syllabus Left: {Math.max(0, totalSyllabus - (totalAttended + totalMissed))} hrs</span>
            </div>
          </div>
        </div>
      )}

      {/* Expandable Attendance What-if Calculator */}
      {activeSemester && subjectsData.length > 0 && (
        <div className="card bg-white">
          <button
            onClick={() => setIsCalcExpanded(!isCalcExpanded)}
            className="flex items-center justify-between w-full text-sm font-medium text-[#111111]"
          >
            <div className="flex items-center gap-2">
              <Calculator size={16} className="text-[#5B5BD6]" />
              <span>What-if Calculator</span>
            </div>
            {isCalcExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {isCalcExpanded && (
            <div className="mt-6 pt-5 border-t border-[#EBEBEB] space-y-6 animate-in slide-in-from-top duration-200">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Course selector */}
                <div>
                  <label className="text-[#6B6B6B] text-xs mb-1.5 block">Select Subject</label>
                  <select
                    value={selectedSubId}
                    onChange={(e) => {
                      setSelectedSubId(e.target.value);
                      setSliderVal(100);
                    }}
                    className="input-field text-sm bg-white"
                  >
                    {subjectsData.map(({ subject }) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sub details */}
                {selectedSubData && (
                  <div className="bg-[#FAFAFA] border border-[#EBEBEB] rounded-lg p-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-[#6B6B6B] block">Current Attendance</span>
                      <span className="font-semibold text-[#111111] mt-0.5 block">
                        {Math.round(selectedSubData.stats.attendancePercent)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-[#6B6B6B] block">Target Target %</span>
                      <span className="font-semibold text-[#111111] mt-0.5 block">
                        {selectedSubData.subject.attendance_target_percent}%
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Slider simulation */}
              {selectedSubData && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#6B6B6B] font-medium">If I attend {sliderVal}% of remaining lectures:</span>
                    <span className="text-sm font-semibold text-[#5B5BD6]">
                      Final Attendance: {calculateFinalPercent()}%
                    </span>
                  </div>

                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={sliderVal}
                    onChange={(e) => setSliderVal(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#EBEBEB] rounded-lg appearance-none cursor-pointer accent-[#5B5BD6]"
                  />

                  {/* Calculations warnings */}
                  <div className="grid gap-3 sm:grid-cols-2 pt-2">
                    <div className="bg-white border border-[#EBEBEB] p-3 rounded-lg text-xs">
                      <span className="text-[#6B6B6B] font-medium block">To reach {selectedSubData.subject.attendance_target_percent}%:</span>
                      <span className="font-semibold text-[#111111] mt-1.5 block">
                        {selectedSubData.stats.lecturesNeeded > 0 ? (
                          <>Attend next <span className="text-[#DC2626] font-bold">{selectedSubData.stats.lecturesNeeded}</span> lectures consecutively</>
                        ) : (
                          <span className="text-[#1A9E5F]">You're already there! ✓</span>
                        )}
                      </span>
                    </div>

                    <div className="bg-white border border-[#EBEBEB] p-3 rounded-lg text-xs">
                      <span className="text-[#6B6B6B] font-medium block">Safe to miss:</span>
                      <span className="font-semibold text-[#111111] mt-1.5 block">
                        {selectedSubData.stats.lecturesSafeToMiss > 0 ? (
                          <>Can miss at most <span className="text-[#D97706] font-bold">{selectedSubData.stats.lecturesSafeToMiss}</span> lectures</>
                        ) : (
                          <span className="text-[#DC2626]">No safety margin (Attend classes)</span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
