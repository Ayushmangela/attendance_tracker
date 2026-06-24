import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase';

export async function middleware(request: NextRequest) {
  const { supabase, response } = createSupabaseMiddlewareClient(request);

  // Retrieve user information safely
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();
  const isDashboardRoute = url.pathname.startsWith('/dashboard');
  const isAuthRoute = url.pathname.startsWith('/login') || url.pathname.startsWith('/register');
  const isRootRoute = url.pathname === '/';

  // 1. If not authenticated and trying to access dashboard -> redirect to /login
  if (isDashboardRoute && !user) {
    url.pathname = '/login';
    // Store original destination in query params to redirect back after logging in
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // 2. If authenticated and trying to access landing page, login, or register -> redirect to /dashboard/today
  if (user && (isAuthRoute || isRootRoute)) {
    url.pathname = '/dashboard/today';
    url.search = ''; // Clear any redirection query params
    return NextResponse.redirect(url);
  }

  return response;
}

// Configured to match dashboard, auth pages, and root landing page
export const config = {
  matcher: [
    '/',
    '/login',
    '/register',
    '/dashboard/:path*',
  ],
};
