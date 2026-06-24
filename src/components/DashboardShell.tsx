'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Clock, Calendar, LayoutDashboard, BookOpen, CalendarRange, BarChart3, Settings, LogOut, AlertTriangle, X, Menu } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { getSubjectStats } from '@/lib/attendance';
import type { Semester, Subject } from '@/lib/types';

interface DashboardShellProps {
  semesters: Semester[];
  children: React.ReactNode;
}

interface SubjectAlert {
  subjectId: string;
  name: string;
  percent: number;
  needed: number;
  safeToMiss: number;
  status: 'safe' | 'borderline' | 'at_risk';
}

export default function DashboardShell({ semesters, children }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const activeSemester = semesters.find((s) => s.is_active) || semesters[0];

  // Alerts states
  const [alerts, setAlerts] = useState<SubjectAlert[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];

  // Load dismissed alert keys
  useEffect(() => {
    const saved = localStorage.getItem(`dismissed_alerts_${todayStr}`);
    if (saved) {
      setDismissedAlerts(JSON.parse(saved));
    }
  }, []);

  // Fetch subjects and calculate alerts globally
  useEffect(() => {
    if (!activeSemester) return;
    
    async function loadAlerts() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: subjectsData } = await supabase
          .from('subjects')
          .select('*')
          .eq('semester_id', activeSemester.id);
        
        if (!subjectsData) return;

        const calculatedAlerts: SubjectAlert[] = [];
        for (const sub of subjectsData) {
          const sStats = await getSubjectStats(supabase, sub.id, activeSemester.id);
          const target = sub.attendance_target_percent || 80;
          
          if (sStats.attendancePercent < target) {
            calculatedAlerts.push({
              subjectId: sub.id,
              name: sub.name,
              percent: sStats.attendancePercent,
              needed: sStats.lecturesNeeded,
              safeToMiss: 0,
              status: sStats.status,
            });
          } else if (sStats.attendancePercent >= target && sStats.attendancePercent < target + 5) {
            // Above target but close
            calculatedAlerts.push({
              subjectId: sub.id,
              name: sub.name,
              percent: sStats.attendancePercent,
              needed: 0,
              safeToMiss: sStats.lecturesSafeToMiss,
              status: sStats.status,
            });
          }
        }
        setAlerts(calculatedAlerts);
      } catch (err) {
        console.error('Failed to load global alert banners:', err);
      }
    }

    loadAlerts();
  }, [supabase, activeSemester, pathname]); // Re-evaluate alerts when pathname changes

  const dismissAlert = (subjectId: string) => {
    const updated = [...dismissedAlerts, subjectId];
    setDismissedAlerts(updated);
    localStorage.setItem(`dismissed_alerts_${todayStr}`, JSON.stringify(updated));
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const navItems = [
    { label: 'Today', href: '/dashboard/today', icon: Clock },
    { label: 'Calendar', href: '/dashboard/calendar', icon: Calendar },
    { label: 'Dashboard', href: '/dashboard/dashboard', icon: LayoutDashboard },
    { label: 'Subjects', href: '/dashboard/subjects', icon: BookOpen },
    { label: 'Timetable', href: '/dashboard/timetable', icon: CalendarRange },
    { label: 'Reports', href: '/dashboard/reports', icon: BarChart3 },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings },
  ];

  // Derive page title from path
  const getPageTitle = () => {
    const currentItem = navItems.find((item) => pathname === item.href);
    return currentItem ? currentItem.label : 'Dashboard';
  };

  const activeAlerts = alerts.filter((a) => !dismissedAlerts.includes(a.subjectId));

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      {/* Top Bar - Fixed */}
      <header className="fixed top-0 right-0 left-0 md:left-[240px] h-16 bg-white border-b border-[#EBEBEB] z-30 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className="md:hidden p-1.5 -ml-1 text-[#6B6B6B] hover:text-[#111111] rounded-md hover:bg-[#FAFAFA] transition-colors"
            aria-label="Open mobile menu"
          >
            <Menu size={20} />
          </button>
          <h2 className="text-sm font-medium text-[#111111]">{getPageTitle()}</h2>
        </div>
        
        <div className="flex items-center gap-3">
          {activeSemester && (
            <span className="hidden sm:inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-[#5B5BD6]/8 text-[#5B5BD6] border border-[#5B5BD6]/10">
              {activeSemester.name}
            </span>
          )}
          
          <Link
            href="/dashboard/today"
            className="btn-primary text-[11px] sm:text-xs py-1.5 px-3 rounded-md"
          >
            Mark today
          </Link>
        </div>
      </header>

      {/* Mobile Drawer Navigation */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop with fade-in animation effect */}
          <div
            className="fixed inset-0 bg-[#111111]/30 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Drawer Panel with slide-in animation */}
          <div className="fixed inset-y-0 left-0 w-[280px] bg-white border-r border-[#EBEBEB] flex flex-col justify-between p-6 shadow-xl animate-in slide-in-from-left duration-200">
            <div className="space-y-6">
              {/* Header inside drawer */}
              <div className="flex items-center justify-between">
                <h1 className="text-base font-medium tracking-tight text-[#111111] flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#5B5BD6] flex items-center justify-center text-white text-[10px] font-semibold">
                    A
                  </span>
                  AttendEase
                </h1>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-md text-[#6B6B6B] hover:text-[#111111] hover:bg-[#FAFAFA]"
                  aria-label="Close mobile menu"
                >
                  <X size={16} />
                </button>
              </div>

              {activeSemester && (
                <div className="px-3 py-2 rounded-lg bg-[#FAFAFA] border border-[#EBEBEB]">
                  <span className="text-[10px] text-[#6B6B6B] font-medium block">Active Semester</span>
                  <span className="text-xs font-semibold text-[#111111] mt-0.5 block truncate">
                    {activeSemester.name}
                  </span>
                </div>
              )}

              {/* Nav Items */}
              <nav className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-md transition-colors ${
                        isActive
                          ? 'text-[#5B5BD6] bg-[#5B5BD6]/8'
                          : 'text-[#6B6B6B] hover:text-[#111111] hover:bg-[#FAFAFA]'
                      }`}
                    >
                      <Icon size={16} className={isActive ? 'text-[#5B5BD6]' : 'text-[#6B6B6B]'} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Bottom Actions inside drawer */}
            <button
              onClick={() => {
                setIsMobileMenuOpen(false);
                handleSignOut();
              }}
              className="flex items-center gap-3 px-3 py-2.5 text-xs font-medium text-[#6B6B6B] hover:text-[#DC2626] rounded-md transition-colors hover:bg-[#DC2626]/5"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-1 pt-16">
        {/* Left Sidebar - Desktop only */}
        <aside className="hidden md:flex fixed top-0 bottom-0 left-0 w-[240px] bg-white border-r border-[#EBEBEB] z-40 flex-col justify-between p-6">
          <div className="space-y-6">
            <div>
              <h1 className="text-base font-medium tracking-tight text-[#111111] flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#5B5BD6] flex items-center justify-center text-white text-[10px] font-semibold">
                  A
                </span>
                AttendEase
              </h1>
              {activeSemester && (
                <p className="text-[11px] text-[#6B6B6B] mt-1.5 font-medium truncate">
                  {activeSemester.name}
                </p>
              )}
            </div>

            <nav className="space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-md transition-colors ${
                      isActive
                        ? 'text-[#5B5BD6] bg-[#5B5BD6]/8'
                        : 'text-[#6B6B6B] hover:text-[#111111] hover:bg-[#FAFAFA]'
                    }`}
                  >
                    <Icon size={16} className={isActive ? 'text-[#5B5BD6]' : 'text-[#6B6B6B]'} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2 text-xs font-medium text-[#6B6B6B] hover:text-[#DC2626] rounded-md transition-colors hover:bg-[#DC2626]/5"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 md:pl-[240px] p-6 pb-24 md:pb-6 min-w-0 flex flex-col gap-6">
          {/* Global Alert Banners */}
          {activeAlerts.length > 0 && (
            <div className="space-y-2">
              {activeAlerts.map((alert) => {
                const bannerClass =
                  alert.status === 'at_risk'
                    ? 'bg-[#DC2626]/8 border-[#DC2626]/20 text-[#DC2626]'
                    : 'bg-[#D97706]/8 border-[#D97706]/20 text-[#D97706]';

                return (
                  <div
                    key={alert.subjectId}
                    className={`p-3 rounded-lg border flex items-center justify-between text-xs transition-opacity duration-200 ${bannerClass}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle size={15} className="flex-shrink-0" />
                      <span className="truncate leading-normal">
                        {alert.status === 'at_risk' ? (
                          <>
                            <span className="font-semibold">{alert.name}</span> is at{' '}
                            {Math.round(alert.percent)}% — attend next {alert.needed} lectures to recover
                          </>
                        ) : (
                          <>
                            <span className="font-semibold">{alert.name}</span> is at{' '}
                            {Math.round(alert.percent)}% — can miss at most {alert.safeToMiss} more lectures
                          </>
                        )}
                      </span>
                    </div>
                    <button
                      onClick={() => dismissAlert(alert.subjectId)}
                      className="text-inherit opacity-75 hover:opacity-100 p-0.5"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Children views */}
          <div className="flex-1">
            {children}
          </div>
        </main>
      </div>

      {/* Bottom Tab Bar - Mobile only */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[#EBEBEB] z-40 flex items-center justify-around px-2">
        {navItems.filter(item => ['Today', 'Calendar', 'Dashboard', 'Timetable', 'Reports'].includes(item.label)).map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 py-1.5 px-2.5 rounded-md transition-colors ${
                isActive ? 'text-[#5B5BD6]' : 'text-[#6B6B6B]'
              }`}
            >
              <Icon size={18} className={isActive ? 'text-[#5B5BD6]' : 'text-[#6B6B6B]'} />
              <span className="text-[9px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
