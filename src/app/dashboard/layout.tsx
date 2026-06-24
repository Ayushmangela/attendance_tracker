import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase';
import DashboardShell from '@/components/DashboardShell';
import OnboardingWizard from '@/components/OnboardingWizard';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createSupabaseServerClient();

  // Get current user session
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not logged in, redirect to login page (middleware also handles this, but a fallback is good)
  if (!user) {
    redirect('/login');
  }

  // Fetch all semesters for the current user
  const { data: semesters, error } = await supabase
    .from('semesters')
    .select('*')
    .order('created_at', { ascending: false });

  // If there's a problem or no semesters exist, render the Onboarding flow
  if (error || !semesters || semesters.length === 0) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
        <div className="w-full max-w-4xl">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-medium tracking-tight text-[#111111] flex items-center justify-center gap-2">
              <span className="inline-block w-6 h-6 rounded-full bg-[#5B5BD6] flex items-center justify-center text-white text-xs font-semibold">
                A
              </span>
              Welcome to AttendEase
            </h1>
            <p className="text-sm text-[#6B6B6B] mt-2">
              Let's get you set up in a few simple steps.
            </p>
          </div>
          <OnboardingWizard />
        </div>
      </div>
    );
  }

  return (
    <DashboardShell semesters={semesters}>
      {children}
    </DashboardShell>
  );
}
