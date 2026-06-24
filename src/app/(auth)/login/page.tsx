'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextRedirect = searchParams.get('next') || '/dashboard/today';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createSupabaseBrowserClient();

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    // Redirect to next path or default dashboard today route
    router.push(nextRedirect);
    router.refresh();
  };

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-[#111111] mb-6">
        Sign in to your account
      </h2>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/20 text-[#DC2626] text-xs">
          {error}
        </div>
      )}

      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="text-[#6B6B6B] text-xs mb-1.5 block" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field text-sm"
            disabled={loading}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[#6B6B6B] text-xs block" htmlFor="password">
              Password
            </label>
          </div>
          <input
            id="password"
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field text-sm"
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          className="btn-primary w-full text-sm py-2.5 mt-2"
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <div className="mt-6 text-center border-t border-[#EBEBEB] pt-4">
        <p className="text-xs text-[#6B6B6B]">
          Don't have an account?{' '}
          <Link href="/register" className="text-[#5B5BD6] font-medium hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="card flex items-center justify-center p-8 bg-white border border-[#EBEBEB] rounded-xl">
        <p className="text-xs text-[#6B6B6B] animate-pulse">Loading login form...</p>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
