# AttendEase

AttendEase is a clean, minimal college attendance calculator web app built with Next.js 14 (App Router), Tailwind CSS, TypeScript, and Supabase (for database storage and authentication).

---

## Technical Stack
- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS (configured with clean, border-focused minimalist styles)
- **Database & Auth:** Supabase (PostgreSQL with Row Level Security)
- **Language:** TypeScript

---

## Local Development Setup

### 1. Clone the repository and install dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```
Then, populate `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with your credentials from the Supabase settings page under **Project Settings** -> **API**.

### 3. Initialize the Database
1. Go to your [Supabase Dashboard](https://supabase.com).
2. Open the **SQL Editor** in your Supabase project.
3. Paste the contents of `supabase/migrations/20260624000000_init.sql` into the query field and run the query.
   - This creates the 6 required tables: `semesters`, `subjects`, `timetable_slots`, `special_days`, `extra_lectures`, and `attendance_records`.
   - Enables Row Level Security (RLS) on all tables.
   - Adds the required security policies where `user_id = auth.uid()`.
   - Attaches triggers to keep `updated_at` columns updated automatically on modification.

### 4. Enable Email + Password Authentication
1. In the Supabase Dashboard, navigate to **Authentication** -> **Providers**.
2. Ensure that the **Email** provider is enabled.
3. Set up redirect URLs under **Authentication** -> **URL Configuration**. Add `http://localhost:3000/**` to redirect users back locally after email verification signup confirmation.

### 5. Run the Local Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Project Structure
- `/supabase/migrations/` - SQL migration files for local and remote schema setups.
- `/src/lib/types.ts` - TypeScript interfaces representing all PostgreSQL schema tables.
- `/src/lib/supabase.ts` - Client wrappers for Browser (`createSupabaseBrowserClient`), Server Components (`createSupabaseServerClient`), and Middleware (`createSupabaseMiddlewareClient`).
- `/src/middleware.ts` - Route middleware handling login redirects and protecting all dashboard paths under `/dashboard`.
- `/src/app/(auth)/` - Auth layouts, sign-in (`/login`), and signup (`/register`) pages.
- `/src/app/dashboard/today/` - Placeholder dashboard view to verify auth routing.

---

## Deployment Checklist (Vercel)

1. **Commit and Push:**
   Push your changes to your Git repository (GitHub, GitLab, or Bitbucket).
2. **Deploy on Vercel:**
   - Go to [vercel.com](https://vercel.com) and sign in.
   - Click **Add New** -> **Project** and import your repository.
   - In the **Environment Variables** section, add the variables from your `.env.local`:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - Click **Deploy**.
3. **Configure Redirect URLs in Supabase:**
   - Once your deployment completes, copy your Vercel deployment URL (e.g., `https://attendease-example.vercel.app`).
   - In your Supabase Dashboard, go to **Authentication** -> **URL Configuration** -> **Redirect URLs**.
   - Add your production URL with wildcard matching (e.g., `https://attendease-example.vercel.app/**`).
