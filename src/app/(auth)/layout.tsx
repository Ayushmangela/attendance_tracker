import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AttendEase | Auth',
  description: 'Sign in or create your account on AttendEase',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#FAFAFA]">
      <div className="w-full max-w-[400px]">
        {/* Subtle logo/app header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-medium tracking-tight text-[#111111] flex items-center justify-center gap-2">
            <span className="inline-block w-6 h-6 rounded-full bg-[#5B5BD6] flex items-center justify-center text-white text-xs font-semibold">
              A
            </span>
            AttendEase
          </h1>
          <p className="text-sm text-[#6B6B6B] mt-2">
            College Attendance Calculator
          </p>
        </div>

        {/* Auth page content */}
        {children}
      </div>
    </div>
  );
}
