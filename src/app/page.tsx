import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase';

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect to dashboard immediately if already signed in
  if (user) {
    redirect('/dashboard/today');
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#FAFAFA]">
      <div className="w-full max-w-[500px] text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#5B5BD6] text-white text-xl font-semibold mb-6">
          A
        </div>
        
        <h1 className="text-3xl font-medium tracking-tight text-[#111111] mb-3">
          AttendEase
        </h1>
        
        <p className="text-base text-[#6B6B6B] mb-8 leading-relaxed">
          The minimalist college attendance calculator. Log your timetable, manage holidays, track subjects, and keep your attendance above target with ease.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/login" className="btn-primary px-8 py-2.5 text-sm">
            Sign in
          </Link>
          <Link href="/register" className="btn-secondary px-8 py-2.5 text-sm">
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
