'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart3, ChevronLeft, ChevronRight, ChevronDown, Download, AlertTriangle, ArrowUp, ArrowDown, HelpCircle, Check, Info } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { getSubjectStats, getOverallStats, getHoursBetween, getDayOfWeekFromDate } from '@/lib/attendance';
import { ReportsSkeleton } from '@/components/ui/Skeletons';
import type { Semester, Subject, AttendanceRecord, TimetableSlot, ExtraLecture } from '@/lib/types';
import { jsPDF } from 'jspdf';

interface SubjectReportData {
  subject: Subject;
  scheduledHours: number;
  attendedHours: number;
  missedHours: number;
  cancelledHours: number;
  weeklyPercent: number;
  semesterPercent: number;
  trend: 'improving' | 'declining' | 'stable';
}

export default function ReportsPage() {
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [activeTab, setActiveTab] = useState<'week' | 'semester'>('week');
  
  // Week navigation (offset 0 = this week, 1 = last week, etc.)
  const [weekOffset, setWeekOffset] = useState(0);
  const [weekRangeText, setWeekRangeText] = useState('');
  const [mondayStr, setMondayStr] = useState('');
  const [sundayStr, setSundayStr] = useState('');

  // Loaded reports data
  const [reportsData, setReportsData] = useState<SubjectReportData[]>([]);
  const [weeklyScheduledTotal, setWeeklyScheduledTotal] = useState(0);
  const [weeklyAttendedTotal, setWeeklyAttendedTotal] = useState(0);
  const [weeklyMissedTotal, setWeeklyMissedTotal] = useState(0);
  const [weeklyOverallPercent, setWeeklyOverallPercent] = useState(100);

  // Insights
  const [insights, setInsights] = useState<string[]>([]);
  
  // Export Dropdown Toggle
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Calculate start/end dates based on weekOffset
  useEffect(() => {
    const curr = new Date();
    const first = curr.getDate() - curr.getDay() + (curr.getDay() === 0 ? -6 : 1) - (weekOffset * 7);
    const last = first + 6;

    const mon = new Date(new Date().setDate(first));
    const sun = new Date(new Date().setDate(last));

    setMondayStr(mon.toISOString().split('T')[0]);
    setSundayStr(sun.toISOString().split('T')[0]);

    // Format Jun 16-22
    const monLabel = mon.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const sunLabel = sun.toLocaleDateString(undefined, { day: 'numeric' });
    setWeekRangeText(`${monLabel} – ${sunLabel}`);
  }, [weekOffset]);

  const loadReports = async () => {
    if (!mondayStr || !activeSemester) return;
    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch subjects
      const { data: subjectsList } = await supabase
        .from('subjects')
        .select('*')
        .eq('semester_id', activeSemester.id);
      
      const subs = subjectsList || [];
      setSubjects(subs);

      // Fetch slots and extra lectures
      const { data: slots } = await supabase.from('timetable_slots').select('*').eq('semester_id', activeSemester.id);
      const { data: extras } = await supabase.from('extra_lectures').select('*').eq('semester_id', activeSemester.id);

      // Fetch records for current week range
      const { data: weekRecords } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', mondayStr)
        .lte('date', sundayStr);

      // Fetch records for previous week range (to calculate 2-week trends)
      const prevMon = new Date(new Date(mondayStr).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const prevSun = new Date(new Date(sundayStr).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      const { data: prevWeekRecords } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', prevMon)
        .lte('date', prevSun);

      // Fetch all semester attendance records
      const { data: semRecords } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('user_id', user.id);

      let totalWeekScheduled = 0;
      let totalWeekAttended = 0;
      let totalWeekMissed = 0;

      const items: SubjectReportData[] = [];
      const generatedInsights: string[] = [];

      for (const sub of subs) {
        const subSlots = slots?.filter((s) => s.subject_id === sub.id) || [];
        const subExtras = extras?.filter((e) => e.subject_id === sub.id) || [];
        const sIds = subSlots.map(s => s.id);
        const eIds = subExtras.map(e => e.id);

        // 1. Calculate stats for This Week
        let wScheduled = 0;
        let wAttended = 0;
        let wMissed = 0;
        let wCancelled = 0;

        weekRecords?.forEach((rec) => {
          const isMatch = (rec.timetable_slot_id && sIds.includes(rec.timetable_slot_id)) ||
                          (rec.extra_lecture_id && eIds.includes(rec.extra_lecture_id));
          if (!isMatch) return;

          let duration = 1;
          if (rec.timetable_slot_id) {
            const sl = subSlots.find(s => s.id === rec.timetable_slot_id);
            if (sl) duration = getHoursBetween(sl.start_time, sl.end_time);
          } else if (rec.extra_lecture_id) {
            const el = subExtras.find(e => e.id === rec.extra_lecture_id);
            if (el) duration = getHoursBetween(el.start_time, el.end_time);
          }

          if (rec.status === 'attended') {
            wScheduled += duration;
            wAttended += duration;
          } else if (rec.status === 'missed') {
            wScheduled += duration;
            wMissed += duration;
          } else if (rec.status === 'cancelled') {
            wCancelled += duration;
          }
        });

        const weeklyPercent = wScheduled > 0 ? (wAttended / wScheduled) * 100 : 100;

        totalWeekScheduled += wScheduled;
        totalWeekAttended += wAttended;
        totalWeekMissed += wMissed;

        // 2. Fetch overall stats from database
        const semStats = await getSubjectStats(supabase, sub.id, activeSemester.id);

        // 3. Calculate Trend (last 2 weeks average vs overall average)
        // Last week + this week records
        let twoWeeksAtt = 0;
        let twoWeeksHeld = 0;

        // Add this week
        twoWeeksAtt += wAttended;
        twoWeeksHeld += wScheduled;

        // Add last week
        prevWeekRecords?.forEach((rec) => {
          const isMatch = (rec.timetable_slot_id && sIds.includes(rec.timetable_slot_id)) ||
                          (rec.extra_lecture_id && eIds.includes(rec.extra_lecture_id));
          if (!isMatch) return;

          let duration = 1;
          if (rec.timetable_slot_id) {
            const sl = subSlots.find(s => s.id === rec.timetable_slot_id);
            if (sl) duration = getHoursBetween(sl.start_time, sl.end_time);
          } else if (rec.extra_lecture_id) {
            const el = subExtras.find(e => e.id === rec.extra_lecture_id);
            if (el) duration = getHoursBetween(el.start_time, el.end_time);
          }

          if (rec.status === 'attended') {
            twoWeeksAtt += duration;
            twoWeeksHeld += duration;
          } else if (rec.status === 'missed') {
            twoWeeksHeld += duration;
          }
        });

        const lastTwoWeeksAvg = twoWeeksHeld > 0 ? (twoWeeksAtt / twoWeeksHeld) * 100 : 100;
        
        let trend: 'improving' | 'declining' | 'stable' = 'stable';
        if (lastTwoWeeksAvg > semStats.attendancePercent + 1) {
          trend = 'improving';
        } else if (lastTwoWeeksAvg < semStats.attendancePercent - 1) {
          trend = 'declining';
        }

        items.push({
          subject: sub,
          scheduledHours: wScheduled,
          attendedHours: wAttended,
          missedHours: wMissed,
          cancelledHours: wCancelled,
          weeklyPercent,
          semesterPercent: semStats.attendancePercent,
          trend,
        });

        // 4. Generate plain-English observations
        const target = sub.attendance_target_percent || 80;
        if (wScheduled > 0) {
          if (wAttended === 0) {
            generatedInsights.push(`You missed all ${sub.name} lectures this week — at ${Math.round(weeklyPercent)}%, which is below your ${target}% target.`);
          } else if (wAttended === wScheduled) {
            generatedInsights.push(`Perfect week for ${sub.name} — you attended all scheduled hours! Keep it up.`);
          } else if (weeklyPercent < target) {
            generatedInsights.push(`Attendance for ${sub.name} fell to ${Math.round(weeklyPercent)}% this week, below the target of ${target}%.`);
          }
        }
      }

      setReportsData(items);
      setWeeklyScheduledTotal(totalWeekScheduled);
      setWeeklyAttendedTotal(totalWeekAttended);
      setWeeklyMissedTotal(totalWeekMissed);
      setWeeklyOverallPercent(totalWeekScheduled > 0 ? (totalWeekAttended / totalWeekScheduled) * 100 : 100);

      if (generatedInsights.length === 0) {
        generatedInsights.push('No major alterations recorded this week. Continue logging attendance!');
      }
      setInsights(generatedInsights.slice(0, 3)); // Max 3 insights
    } catch (error: any) {
      showToast(error.message || 'Failed to load report data', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function loadActiveSemester() {
      const { data: semesters } = await supabase.from('semesters').select('*');
      const active = semesters?.find((s) => s.is_active) || semesters?.[0] || null;
      setActiveSemester(active);
    }
    loadActiveSemester();
  }, [supabase]);

  useEffect(() => {
    loadReports();
  }, [supabase, mondayStr, activeSemester]);

  const handlePrevWeek = () => {
    setWeekOffset(weekOffset + 1);
  };

  const handleNextWeek = () => {
    setWeekOffset(Math.max(0, weekOffset - 1));
  };

  // CSV Export DML
  const handleExportCSV = async () => {
    setIsExportOpen(false);
    setActionLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const todayStr = new Date().toISOString().split('T')[0];
      if (!user || !activeSemester) return;

      // Fetch all timetable slots + extra lectures + attendance records
      const { data: slots } = await supabase.from('timetable_slots').select('*').eq('semester_id', activeSemester.id);
      const { data: extras } = await supabase.from('extra_lectures').select('*').eq('semester_id', activeSemester.id);
      const { data: records } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      const slotIds = slots?.map(s => s.id) || [];
      const extraIds = extras?.map(e => e.id) || [];

      // Filter matched records
      const matched = records?.filter((r) => 
        (r.timetable_slot_id && slotIds.includes(r.timetable_slot_id)) ||
        (r.extra_lecture_id && extraIds.includes(r.extra_lecture_id))
      ) || [];

      if (matched.length === 0) {
        showToast('No logged attendance records found to export.', 'error');
        setActionLoading(false);
        return;
      }

      // Build CSV String
      let csvContent = 'Date,Day,Subject,Start Time,End Time,Status,Notes\n';

      matched.forEach((rec) => {
        let subName = 'Unknown';
        let startTime = 'N/A';
        let endTime = 'N/A';

        if (rec.timetable_slot_id) {
          const slot = slots?.find(s => s.id === rec.timetable_slot_id);
          const sub = subjects.find(s => s.id === slot?.subject_id);
          subName = sub?.name || 'Unknown';
          startTime = slot?.start_time || 'N/A';
          endTime = slot?.end_time || 'N/A';
        } else if (rec.extra_lecture_id) {
          const el = extras?.find(e => e.id === rec.extra_lecture_id);
          const sub = subjects.find(s => s.id === el?.subject_id);
          subName = sub?.name || 'Unknown';
          startTime = el?.start_time || 'N/A';
          endTime = el?.end_time || 'N/A';
        }

        const jsDay = getDayOfWeekFromDate(rec.date);
        const dayLabel = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][jsDay - 1] || 'N/A';
        const noteText = rec.note ? `"${rec.note.replace(/"/g, '""')}"` : '';

        csvContent += `${rec.date},${dayLabel},"${subName}",${startTime},${endTime},${rec.status},${noteText}\n`;
      });

      // Trigger file download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `AttendEase_${activeSemester.name.replace(/\s+/g, '_')}_${todayStr}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast('CSV report exported.');
    } catch (error: any) {
      showToast(error.message || 'CSV Export failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // PDF Export DML (using jsPDF)
  const handleExportPDF = async () => {
    setIsExportOpen(false);
    setActionLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const todayStr = new Date().toISOString().split('T')[0];
      if (!user || !activeSemester) return;

      const { data: slots } = await supabase.from('timetable_slots').select('*').eq('semester_id', activeSemester.id);
      const { data: extras } = await supabase.from('extra_lectures').select('*').eq('semester_id', activeSemester.id);
      const { data: records } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      const slotIds = slots?.map(s => s.id) || [];
      const extraIds = extras?.map(e => e.id) || [];

      // Filter matched
      const matched = records?.filter((r) => 
        (r.timetable_slot_id && slotIds.includes(r.timetable_slot_id)) ||
        (r.extra_lecture_id && extraIds.includes(r.extra_lecture_id))
      ) || [];

      // Create PDF
      const doc = new jsPDF();
      doc.setFont('Helvetica', 'normal');
      
      // Header Banner
      doc.setFontSize(22);
      doc.setTextColor(91, 91, 214); // Indigo
      doc.text('AttendEase', 14, 20);
      
      doc.setFontSize(14);
      doc.setTextColor(17, 17, 17);
      doc.text('Attendance Summary Report', 14, 28);
      
      // Info details
      doc.setFontSize(9);
      doc.setTextColor(107, 107, 107);
      doc.text(`Semester: ${activeSemester.name}`, 14, 38);
      doc.text(`Date Range: ${activeSemester.start_date} to ${activeSemester.end_date}`, 14, 44);
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 50);

      // Section: Subject Table
      doc.setFontSize(11);
      doc.setTextColor(17, 17, 17);
      doc.text('Subject Wise Aggregate', 14, 62);

      doc.setFontSize(9);
      doc.setTextColor(107, 107, 107);
      let y = 70;
      doc.text('Subject', 14, y);
      doc.text('Total Hours', 70, y);
      doc.text('Attended Hours', 110, y);
      doc.text('Missed Hours', 150, y);
      doc.text('% Attend', 180, y);

      doc.setDrawColor(235, 235, 235);
      doc.line(14, y + 2, 196, y + 2);
      y += 8;

      doc.setTextColor(17, 17, 17);
      reportsData.forEach((row) => {
        doc.text(row.subject.name, 14, y);
        doc.text(`${row.subject.total_hours} hrs`, 70, y);
        doc.text(`${row.attendedHours} hrs`, 110, y);
        doc.text(`${row.missedHours} hrs`, 150, y);
        doc.text(`${Math.round(row.semesterPercent)}%`, 180, y);
        y += 8;
      });

      // Section: Detail Logs
      if (matched.length > 0) {
        doc.addPage();
        
        doc.setFontSize(14);
        doc.setTextColor(17, 17, 17);
        doc.text('Attendance Logs List', 14, 20);
        
        doc.setFontSize(9);
        doc.setTextColor(107, 107, 107);
        y = 28;
        doc.text('Date', 14, y);
        doc.text('Day', 36, y);
        doc.text('Subject', 60, y);
        doc.text('Status', 130, y);
        doc.text('Notes / Reasons', 155, y);

        doc.line(14, y + 2, 196, y + 2);
        y += 8;

        doc.setTextColor(17, 17, 17);
        matched.slice(0, 25).forEach((rec) => { // Limit to first 25 for page space bounds
          let sName = 'Unknown';
          if (rec.timetable_slot_id) {
            const slot = slots?.find(s => s.id === rec.timetable_slot_id);
            sName = subjects.find(s => s.id === slot?.subject_id)?.name || 'Unknown';
          } else if (rec.extra_lecture_id) {
            const el = extras?.find(e => e.id === rec.extra_lecture_id);
            sName = subjects.find(s => s.id === el?.subject_id)?.name || 'Unknown';
          }

          const jsDay = getDayOfWeekFromDate(rec.date);
          const dayLabel = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][jsDay - 1] || 'N/A';

          doc.text(rec.date, 14, y);
          doc.text(dayLabel, 36, y);
          doc.text(sName.slice(0, 30), 60, y);
          doc.text(rec.status, 130, y);
          doc.text((rec.note || '').slice(0, 20), 155, y);
          y += 7;
        });

        if (matched.length > 25) {
          doc.setFontSize(8);
          doc.setTextColor(150);
          doc.text(`... and ${matched.length - 25} more records truncated. Download CSV for the full audit log.`, 14, y + 4);
        }
      }

      doc.save(`AttendEase_Report_${todayStr}.pdf`);
      showToast('PDF report exported successfully.');
    } catch (error: any) {
      showToast(error.message || 'PDF Export failed', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return <ReportsSkeleton />;
  }

  const atRiskReportItems = reportsData.filter((r) => r.semesterPercent < (r.subject.attendance_target_percent || 80));

  return (
    <div className="space-y-6 max-w-4xl animate-in fade-in duration-200">
      {/* Top Header & Export Controls */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-medium text-[#111111]">Attendance Reports</h1>
          <p className="text-xs text-[#6B6B6B]">
            Analyze semester trends, review weekly summaries, and export data.
          </p>
        </div>

        {activeSemester && (
          <div className="relative">
            <button
              onClick={() => setIsExportOpen(!isExportOpen)}
              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
              disabled={actionLoading}
            >
              <Download size={14} /> Export <ChevronDown size={12} />
            </button>

            {isExportOpen && (
              <div className="absolute right-0 mt-1.5 w-36 bg-white border border-[#EBEBEB] rounded-lg shadow-sm z-30 py-1">
                <button
                  onClick={handleExportCSV}
                  className="w-full text-left px-3 py-1.5 text-xs text-[#111111] hover:bg-[#FAFAFA]"
                >
                  Export CSV
                </button>
                <button
                  onClick={handleExportPDF}
                  className="w-full text-left px-3 py-1.5 text-xs text-[#111111] hover:bg-[#FAFAFA]"
                >
                  Export PDF
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {!activeSemester ? (
        <div className="card text-center py-12 bg-white">
          <BarChart3 size={32} className="mx-auto text-[#ABABAB] mb-3" />
          <h3 className="text-sm font-medium text-[#111111] mb-1">No Active Semester</h3>
          <p className="text-xs text-[#6B6B6B] max-w-sm mx-auto">
            Please configure your active semester in Settings first.
          </p>
        </div>
      ) : (
        <>
          {/* Action Warning banner */}
          {activeTab === 'week' && atRiskReportItems.length > 0 && (
            <div className="p-3.5 rounded-lg border border-[#DC2626]/20 bg-[#DC2626]/5 text-[#DC2626] text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="flex-shrink-0" />
              <span>
                At-risk alert: You have {atRiskReportItems.length} course{atRiskReportItems.length > 1 ? 's' : ''} currently below target.
              </span>
            </div>
          )}

          {/* Tabs Section */}
          <div className="flex border-b border-[#EBEBEB] p-0.5 self-start">
            <button
              onClick={() => setActiveTab('week')}
              className={`text-xs px-4 py-2 font-medium border-b-2 -mb-0.5 transition-colors ${
                activeTab === 'week'
                  ? 'border-[#5B5BD6] text-[#5B5BD6]'
                  : 'border-transparent text-[#6B6B6B] hover:text-[#111111]'
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setActiveTab('semester')}
              className={`text-xs px-4 py-2 font-medium border-b-2 -mb-0.5 transition-colors ${
                activeTab === 'semester'
                  ? 'border-[#5B5BD6] text-[#5B5BD6]'
                  : 'border-transparent text-[#6B6B6B] hover:text-[#111111]'
              }`}
            >
              This Semester
            </button>
          </div>

          {/* TAB 1: This Week */}
          {activeTab === 'week' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Week Navigator */}
              <div className="flex items-center justify-between bg-white border border-[#EBEBEB] p-2.5 rounded-lg">
                <span className="text-xs text-[#6B6B6B]">Selected Week:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrevWeek}
                    className="p-1 rounded hover:bg-[#FAFAFA] text-[#6B6B6B] hover:text-[#111111]"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span className="text-xs font-semibold text-[#111111] min-w-[120px] text-center">
                    {weekRangeText}
                  </span>
                  <button
                    onClick={handleNextWeek}
                    className="p-1 rounded hover:bg-[#FAFAFA] text-[#6B6B6B] hover:text-[#111111] disabled:opacity-40"
                    disabled={weekOffset === 0}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {/* Weekly summary counts */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card p-3 flex flex-col justify-between bg-white">
                  <span className="text-[10px] text-[#6B6B6B] font-medium block">Weekly Scheduled</span>
                  <span className="text-base font-semibold text-[#111111] mt-1.5 block">
                    {weeklyScheduledTotal} hrs
                  </span>
                </div>
                <div className="card p-3 flex flex-col justify-between bg-white">
                  <span className="text-[10px] text-[#6B6B6B] font-medium block">Weekly Attended</span>
                  <span className="text-base font-semibold text-[#111111] mt-1.5 block">
                    {weeklyAttendedTotal} hrs
                  </span>
                </div>
                <div className="card p-3 flex flex-col justify-between bg-white">
                  <span className="text-[10px] text-[#6B6B6B] font-medium block">Weekly Missed</span>
                  <span className="text-base font-semibold text-[#111111] mt-1.5 block">
                    {weeklyMissedTotal} hrs
                  </span>
                </div>
                <div className="card p-3 flex flex-col justify-between bg-white">
                  <span className="text-[10px] text-[#6B6B6B] font-medium block">Weekly Average</span>
                  <span className="text-base font-semibold text-[#111111] mt-1.5 block">
                    {Math.round(weeklyOverallPercent)}%
                  </span>
                </div>
              </div>

              {/* Weekly Subjects Table */}
              <div className="card overflow-x-auto bg-white p-0">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAFAFA] border-b border-[#EBEBEB] text-[#6B6B6B]">
                      <th className="p-3 font-semibold">Subject</th>
                      <th className="p-3 font-semibold">Scheduled Hours</th>
                      <th className="p-3 font-semibold">Attended</th>
                      <th className="p-3 font-semibold">Missed</th>
                      <th className="p-3 font-semibold text-right">Weekly %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBEBEB]">
                    {reportsData.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-[#ABABAB]">
                          No records logged for this week.
                        </td>
                      </tr>
                    ) : (
                      reportsData.map((row) => {
                        const bgClass =
                          row.scheduledHours > 0
                            ? row.weeklyPercent === 100
                              ? 'bg-[#1A9E5F]/3'
                              : row.weeklyPercent === 0
                              ? 'bg-[#DC2626]/3'
                              : 'bg-white'
                            : 'bg-[#FAFAFA]/50';

                        return (
                          <tr key={row.subject.id} className={`${bgClass} transition-colors`}>
                            <td className="p-3 font-medium text-[#111111]">{row.subject.name}</td>
                            <td className="p-3">{row.scheduledHours} hrs</td>
                            <td className="p-3 text-[#1A9E5F] font-medium">+{row.attendedHours} hrs</td>
                            <td className="p-3 text-[#DC2626] font-medium">-{row.missedHours} hrs</td>
                            <td className="p-3 text-right font-semibold text-[#111111]">
                              {row.scheduledHours > 0 ? `${Math.round(row.weeklyPercent)}%` : 'No class'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Insights */}
              <div className="card bg-white">
                <h3 className="text-xs font-semibold text-[#111111] uppercase tracking-wider mb-3">
                  Observations & Insights
                </h3>
                <ul className="space-y-2 text-xs text-[#6B6B6B]">
                  {insights.map((ins, index) => (
                    <li key={index} className="flex items-start gap-2 leading-relaxed">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#5B5BD6] mt-1.5 flex-shrink-0" />
                      <span>{ins}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* TAB 2: This Semester */}
          {activeTab === 'semester' && (
            <div className="card overflow-x-auto bg-white p-0 animate-in fade-in duration-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#FAFAFA] border-b border-[#EBEBEB] text-[#6B6B6B]">
                    <th className="p-3 font-semibold">Subject</th>
                    <th className="p-3 font-semibold">Syllabus Hours</th>
                    <th className="p-3 font-semibold">Attended</th>
                    <th className="p-3 font-semibold">Missed</th>
                    <th className="p-3 font-semibold">Target %</th>
                    <th className="p-3 font-semibold">Trend</th>
                    <th className="p-3 font-semibold text-right">Overall %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBEBEB]">
                  {reportsData.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-[#ABABAB]">
                        No course data found.
                      </td>
                    </tr>
                  ) : (
                    reportsData.map((row) => {
                      const isAtRisk = row.semesterPercent < (row.subject.attendance_target_percent || 80);

                      return (
                        <tr key={row.subject.id} className="bg-white hover:bg-[#FAFAFA]/40 transition-colors">
                          <td className="p-3 font-medium text-[#111111]">{row.subject.name}</td>
                          <td className="p-3">{row.subject.total_hours} hrs</td>
                          <td className="p-3 text-[#1A9E5F] font-medium">{row.attendedHours} hrs</td>
                          <td className="p-3 text-[#DC2626] font-medium">{row.missedHours} hrs</td>
                          <td className="p-3 font-medium">{row.subject.attendance_target_percent}%</td>
                          
                          {/* Trend indicator */}
                          <td className="p-3">
                            {row.trend === 'improving' ? (
                              <span className="flex items-center gap-0.5 text-[#1A9E5F] font-medium">
                                <ArrowUp size={12} /> improving
                              </span>
                            ) : row.trend === 'declining' ? (
                              <span className="flex items-center gap-0.5 text-[#DC2626] font-medium">
                                <ArrowDown size={12} /> declining
                              </span>
                            ) : (
                              <span className="text-[#6B6B6B] font-medium">— stable</span>
                            )}
                          </td>

                          <td className={`p-3 text-right font-semibold ${isAtRisk ? 'text-[#DC2626]' : 'text-[#1A9E5F]'}`}>
                            {Math.round(row.semesterPercent)}%
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
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
