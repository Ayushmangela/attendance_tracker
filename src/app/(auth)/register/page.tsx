'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const router = useRouter();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Redirect back to callback page to establish cookies
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    // If auto-sign-in is configured and session is established
    if (data?.session) {
      router.push('/dashboard/today');
      router.refresh();
    } else {
      setSuccess('Account created! Please check your email for the confirmation link to complete registration.');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2 className="text-lg font-medium text-[#111111] mb-6">
        Create an account
      </h2>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/20 text-[#DC2626] text-xs">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 rounded-lg bg-[#1A9E5F]/10 border border-[#1A9E5F]/20 text-[#1A9E5F] text-xs">
          {success}
        </div>
      )}

      <form onSubmit={handleRegister} className="space-y-4">
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
          <label className="text-[#6B6B6B] text-xs mb-1.5 block" htmlFor="password">
            Password
          </label>
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

        <div>
          <label className="text-[#6B6B6B] text-xs mb-1.5 block" htmlFor="confirm-password">
            Confirm password
          </label>
          <input
            id="confirm-password"
            type="password"
            required
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-field text-sm"
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          className="btn-primary w-full text-sm py-2.5 mt-2"
          disabled={loading}
        >
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <div className="mt-6 text-center border-t border-[#EBEBEB] pt-4">
        <p className="text-xs text-[#6B6B6B]">
          Already have an account?{' '}
          <Link href="/login" className="text-[#5B5BD6] font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
