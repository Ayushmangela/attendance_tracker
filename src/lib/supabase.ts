import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

// Helper to validate and fallback env variables to prevent Next.js build-time crashes
function getSupabaseCredentials() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  const isValidUrl = url && (url.startsWith('http://') || url.startsWith('https://'));
  
  return {
    url: isValidUrl ? url : 'https://placeholder.supabase.co',
    key: key || 'placeholder-key',
  };
}

// Browser-side client helper
export function createSupabaseBrowserClient() {
  const { url, key } = getSupabaseCredentials();
  return createBrowserClient(url, key);
}

// Server-side (Server Components, Actions, Route Handlers) client helper
export function createSupabaseServerClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createSupabaseServerClient must only be called on the server');
  }

  // Dynamically require next/headers to prevent bundler errors on the client side
  const { cookies } = require('next/headers');
  const cookieStore = cookies();
  const { url, key } = getSupabaseCredentials();

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch (error) {
            // Safe to ignore if called from a Server Component that cannot set cookies
          }
        },
      },
    }
  );
}

// Middleware-specific helper to handle cookies on the request and response
export function createSupabaseMiddlewareClient(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const { url, key } = getSupabaseCredentials();

  const supabase = createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  return { supabase, response };
}
