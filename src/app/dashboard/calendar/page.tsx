'use client';

import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Info } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { getMonthCalendarData } from '@/lib/attendance';
import DayDetailSlideOver from '@/components/DayDetailSlideOver';
import type { Semester, Subject } from '@/lib/types';

export default function CalendarPage() {
  const supabase = createSupabaseBrowserClient();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);

  // Navigation Year & Month
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1; // 1-12

  // Calendar Data
  const [calendarData, setCalendarData] = useState<
    Record<
      string,
      {
        status: 'attended' | 'partial' | 'missed' | 'holiday' | 'none';
        lectureCount: number;
        subjectColors: string[];
      }
    >
  >({});

  // SlideOver State
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: semesters } = await supabase.from('semesters').select('*');
      const active = semesters?.find((s) => s.is_active) || semesters?.[0] || null;
      setActiveSemester(active);

      if (active) {
        // Fetch subjects
        const { data: subjectsData } = await supabase
          .from('subjects')
          .select('*')
          .eq('semester_id', active.id);
        setSubjects(subjectsData || []);

        // Fetch calendar mapping
        const calendarMap = await getMonthCalendarData(supabase, year, month, user.id, active.id);
        setCalendarData(calendarMap);
      }
    } catch (error) {
      console.error('Failed to load calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [supabase, currentDate]);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 2, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month, 1));
  };

  // Generate calendar grid array starting on Monday
  const getGridDays = () => {
    const days: { dateStr: string | null; dayNum: number | null; isToday: boolean; isFuture: boolean }[] = [];
    
    // First day of month details
    const firstDay = new Date(year, month - 1, 1);
    const jsDay = firstDay.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const startOffset = jsDay === 0 ? 6 : jsDay - 1; // Mon -> 0, Sun -> 6 padding cells

    const daysInMonth = new Date(year, month, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. Padding days
    for (let i = 0; i < startOffset; i++) {
      days.push({ dateStr: null, dayNum: null, isToday: false, isFuture: false });
    }

    // 2. Active days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
      const isToday = dateStr === todayStr;
      
      const parts = dateStr.split('-').map(Number);
      const cellDate = new Date(parts[0], parts[1] - 1, parts[2]);
      const isFuture = cellDate.getTime() > new Date(todayStr).getTime();

      days.push({
        dateStr,
        dayNum: d,
        isToday,
        isFuture,
      });
    }

    // 3. Keep trailing padding cells to complete final row
    const totalCells = Math.ceil(days.length / 7) * 7;
    const endOffset = totalCells - days.length;
    for (let i = 0; i < endOffset; i++) {
      days.push({ dateStr: null, dayNum: null, isToday: false, isFuture: false });
    }

    return days;
  };

  const formatMonthName = () => {
    return currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'attended':
        return 'bg-[#1A9E5F]'; // Green
      case 'partial':
        return 'bg-[#D97706]'; // Amber
      case 'missed':
        return 'bg-[#DC2626]'; // Red
      case 'holiday':
        return 'bg-[#ABABAB]'; // Gray
      default:
        return 'transparent';
    }
  };

  const handleCellClick = (dateStr: string | null, isFuture: boolean) => {
    if (!dateStr || isFuture) return;
    setSelectedDate(dateStr);
  };

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

  const gridDays = getGridDays();

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Month Navigation Row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-[#111111] tracking-tight">
            Calendar View
          </h1>
          <p className="text-xs text-[#6B6B6B]">
            Navigate monthly records and inspect daily attendance details.
          </p>
        </div>

        {activeSemester && (
          <div className="flex items-center gap-3 bg-white border border-[#EBEBEB] rounded-lg p-0.5">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 rounded-md text-[#6B6B6B] hover:text-[#111111] hover:bg-[#FAFAFA]"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-semibold text-[#111111] min-w-[120px] text-center">
              {formatMonthName()}
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 rounded-md text-[#6B6B6B] hover:text-[#111111] hover:bg-[#FAFAFA]"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>

      {!activeSemester ? (
        <div className="card text-center py-12">
          <CalendarIcon size={32} className="mx-auto text-[#ABABAB] mb-3" />
          <h3 className="text-sm font-medium text-[#111111] mb-1">No Active Semester</h3>
          <p className="text-xs text-[#6B6B6B] max-w-sm mx-auto">
            Please configure your active semester in Settings first.
          </p>
        </div>
      ) : (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Monthly grid */}
          <div className="border border-[#EBEBEB] rounded-xl overflow-hidden bg-white">
            <div className="grid grid-cols-7 divide-x divide-y divide-[#EBEBEB] text-center">
              {/* Day names */}
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                <div key={day} className="bg-[#FAFAFA] py-2 text-xs font-medium text-[#6B6B6B] border-t-0">
                  {day}
                </div>
              ))}

              {/* Day cells */}
              {gridDays.map((cell, index) => {
                const dayData = cell.dateStr ? calendarData[cell.dateStr] : null;
                const showIndicator = dayData && dayData.status !== 'none';
                
                return (
                  <div
                    key={index}
                    onClick={() => handleCellClick(cell.dateStr, cell.isFuture)}
                    className={`h-20 sm:h-[90px] p-2 flex flex-col justify-between items-stretch text-left select-none relative ${
                      cell.dateStr && !cell.isFuture
                        ? 'cursor-pointer hover:bg-[#FAFAFA]/70'
                        : 'bg-[#FAFAFA]/30'
                    } ${cell.isToday ? 'outline-2 outline-indigo-500/20 outline' : ''}`}
                  >
                    {/* Day number */}
                    <div className="flex justify-between items-center">
                      <span
                        className={`text-xs font-semibold ${
                          cell.isToday
                            ? 'w-5 h-5 rounded-full bg-[#5B5BD6] text-white flex items-center justify-center'
                            : cell.isFuture
                            ? 'text-[#ABABAB]'
                            : 'text-[#111111]'
                        }`}
                      >
                        {cell.dayNum}
                      </span>
                    </div>

                    {/* Subject color dots */}
                    {dayData && dayData.subjectColors.length > 0 && (
                      <div className="flex gap-1.5 justify-start pl-0.5">
                        {dayData.subjectColors.map((color, cIdx) => (
                          <span
                            key={cIdx}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    )}

                    {/* Bottom Status indicator dot */}
                    <div className="h-1 flex justify-start pl-0.5">
                      {showIndicator && (
                        <span
                          className={`w-2 h-2 rounded-full ${getStatusColor(dayData.status)}`}
                          title={`Status: ${dayData.status}`}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-2 text-[11px] text-[#6B6B6B] card py-3.5">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1A9E5F]" />
              <span>All Attended</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D97706]" />
              <span>Partial / Unmarked</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#DC2626]" />
              <span>Missed All</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ABABAB]" />
              <span>Holiday / Off</span>
            </div>
          </div>
        </div>
      )}

      {/* Day detail slide-over drawer */}
      {selectedDate && activeSemester && userId && (
        <DayDetailSlideOver
          isOpen={selectedDate !== null}
          onClose={() => setSelectedDate(null)}
          date={selectedDate}
          activeSemester={activeSemester}
          subjects={subjects}
          userId={userId}
          onRefresh={loadData}
        />
      )}
    </div>
  );
}
