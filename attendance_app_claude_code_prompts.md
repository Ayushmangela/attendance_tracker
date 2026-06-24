# AttendEase — Claude Code Prompt Sequence

Run these 4 prompts in order inside Claude Code.
Each prompt builds on the previous one. Do not skip steps.

---

## PROMPT 1 — Project scaffolding, auth, and database schema

```
Build a college attendance calculator web app called "AttendEase" using the following stack:
- Next.js 14 with App Router
- Tailwind CSS
- Supabase (Postgres database + authentication)
- TypeScript

The app will be deployed on Vercel. Set up the full project structure now.

### Auth
- Use Supabase Auth with email + password login
- Add a /login and /register page with clean, minimal forms
- Protect all app routes under /dashboard using middleware
- After login, redirect to /dashboard/today

### Supabase database schema
Create the following tables. All tables include a user_id column linked to auth.users with Row Level Security (RLS) enabled.

1. semesters
   - id (uuid, primary key)
   - user_id (uuid, references auth.users)
   - name (text) — e.g. "Semester 6 2025-26"
   - start_date (date)
   - end_date (date)
   - is_active (boolean, default true)
   - created_at (timestamptz)

2. subjects
   - id (uuid, primary key)
   - user_id (uuid)
   - semester_id (uuid, references semesters)
   - name (text)
   - short_code (text) — e.g. "ML", "CVT"
   - total_hours (integer)
   - attendance_target_percent (integer, default 80)
   - color (text) — hex color for UI
   - created_at (timestamptz)

3. timetable_slots
   - id (uuid, primary key)
   - user_id (uuid)
   - semester_id (uuid, references semesters)
   - subject_id (uuid, references subjects)
   - day_of_week (integer) — 1=Monday through 6=Saturday
   - start_time (time)
   - end_time (time)
   - room (text, nullable)
   - faculty (text, nullable)

4. special_days
   - id (uuid, primary key)
   - user_id (uuid)
   - semester_id (uuid, references semesters)
   - date (date)
   - type (text) — values: 'holiday', 'no_college', 'extra_working'
   - label (text)

5. extra_lectures
   - id (uuid, primary key)
   - user_id (uuid)
   - semester_id (uuid, references semesters)
   - subject_id (uuid, references subjects)
   - date (date)
   - start_time (time)
   - end_time (time)
   - reason (text, nullable)
   - original_timetable_slot_id (uuid, nullable)

6. attendance_records
   - id (uuid, primary key)
   - user_id (uuid)
   - date (date)
   - timetable_slot_id (uuid, nullable, references timetable_slots)
   - extra_lecture_id (uuid, nullable, references extra_lectures)
   - status (text) — values: 'attended', 'missed', 'cancelled'
   - note (text, nullable)
   - created_at (timestamptz)
   - updated_at (timestamptz)

### RLS policies
For every table: SELECT, INSERT, UPDATE, DELETE only where user_id = auth.uid().

### Output
- Full Next.js 14 App Router project structure
- /lib/supabase.ts with browser and server Supabase client helpers
- /lib/types.ts with TypeScript types for all tables
- SQL migration file for all tables and RLS policies
- Working /login and /register pages
- Middleware protecting /dashboard routes
- README with setup instructions
```

---

## PROMPT 2 — Design system, app shell, and setup screens

```
Continue building AttendEase. Auth, schema, and project structure are already in place.

Now build the full app shell and setup screens.

### Design direction
Design a fresh, minimalist UI. The goal is something that feels like a well-crafted productivity app — clean, spacious, and confident. Follow these principles precisely:

**Palette**
- Background: #FAFAFA (off-white, not pure white)
- Surface (cards): #FFFFFF with a 1px solid #EBEBEB border
- Primary accent: #5B5BD6 (soft indigo — used for active states, primary buttons, progress fills)
- Success: #1A9E5F
- Warning: #D97706
- Danger: #DC2626
- Text primary: #111111
- Text secondary: #6B6B6B
- Text muted: #ABABAB

**Typography**
- Font: Geist Sans (import from https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap — if unavailable, fall back to Inter)
- Base size: 14px, line-height 1.6
- Headings: 500 weight, never bold/700
- Data numbers (percentages, counts): 600 weight, slightly larger
- Never use uppercase labels

**Components**
- Border radius: 10px for cards, 8px for buttons and inputs, 6px for badges
- Buttons: filled (#5B5BD6 bg, white text) for primary, outlined (1px #EBEBEB, #111111 text) for secondary
- Input fields: 1px solid #EBEBEB border, #FAFAFA background, focus ring #5B5BD6 at 2px
- Cards: white background, 1px solid #EBEBEB, 10px radius, 20px internal padding
- No drop shadows anywhere — use borders only
- Status badges: small pill, 6px radius, colored background at 12% opacity, matching text
  - Safe: green bg/text, Borderline: amber bg/text, At risk: red bg/text
- Spacing: 8px base unit. Use 8, 12, 16, 20, 24, 32, 48px throughout. Never arbitrary values.

**Motion**
- Subtle transitions only: 150ms ease for hovers, 200ms ease for modals/slide-overs
- No decorative animations

### App shell
Create a persistent left sidebar layout for all /dashboard routes:

Sidebar (240px wide, #FFFFFF, right border 1px #EBEBEB):
- App name "AttendEase" at top in 500 weight
- Active semester name in muted text below it
- Navigation items (icon + label): Today, Calendar, Dashboard, Subjects, Timetable, Reports, Settings
- Active item: #5B5BD6 text, light indigo bg pill (#5B5BD6 at 8% opacity)
- Inactive: #6B6B6B text, hover: #111111 text

Use Lucide React for all icons.

On mobile (< 768px): sidebar collapses, show a bottom tab bar with Today, Calendar, Dashboard, Timetable.

Top bar (on all dashboard pages): page title on left, active semester chip + "Mark today" button on right (only show "Mark today" if today has unmarked lectures).

### Onboarding (first-time users)
If user has no semesters, show a 3-step wizard before the main app:

Step 1 — Semester setup
  - Semester name input
  - Start date and end date pickers
  - Clean step indicator at top (1 of 3)

Step 2 — Add subjects
  - Subject name, short code (auto-generated, editable), total hours, target % (default 80)
  - Color swatch picker: 8 preset colors (indigo, teal, rose, amber, green, violet, sky, orange)
  - "Add another subject" link below the form
  - At least one subject required to proceed

Step 3 — Set up timetable
  - Weekly grid (Mon–Sat columns, 8AM–6PM rows)
  - Click any cell to assign a subject + time to that slot
  - Filled cells show subject name in the subject's color
  - "Skip for now" option

### Settings screen (/dashboard/settings)
Sections:
- Semester management: list all semesters, create new, set active, archive
- Account: display name, email (read-only), change password
- Attendance defaults: global target % setting
- Data: export all data (link to reports), danger zone (delete account)

### Subjects screen (/dashboard/subjects)
- Grid of subject cards (2 columns on desktop, 1 on mobile)
- Each card: left color bar in subject color, subject name, short code, total hours, target %, current attendance % (calculated live)
- Edit (pencil icon) and delete (trash icon) on hover
- "Add subject" button top right — opens a right slide-over panel
- Delete confirmation modal: warns about losing attendance records

### Timetable screen (/dashboard/timetable)
Two tabs: "Weekly schedule" and "Special days"

Weekly schedule tab:
- Visual weekly grid with colored subject blocks
- "Edit" toggle mode: click blocks to edit/delete, click empty cells to add a slot
- Each slot shows: subject name, time, room (if set)

Special days tab:
- List of upcoming special days (holidays, no-college days)
- "Add special day" button: date picker, type selector (Holiday / No college / Extra working day), label input
- Past special days shown in a muted section below

Extra lectures section (on timetable screen, below the grid):
- List of one-off lectures added for specific dates
- "Add extra lecture" button: subject, date, time, optional reason/note
```

---

## PROMPT 3 — Attendance marking, calendar, and daily view

```
Continue building AttendEase. The shell, design system, setup flows, and timetable screens are done.

Now build the attendance marking experience and calendar.

### Today screen (/dashboard/today)

1. Date header
   - Large: "Monday, 23 June" in 500 weight
   - Small muted: "Week 12 of Semester 6"

2. Alert banners (show above schedule if any subject is below 80%)
   - One banner per at-risk subject, dismissible with an X
   - Red: "[Subject] is at X% — attend next N lectures to recover"
   - Amber: "[Subject] is at X% — can miss at most N more lectures"
   - Calculation logic:
     - lectures_needed = ceil((target_percent * total_hours / 100 - attended_hours) / (1 - target_percent / 100))
     - lectures_safe_to_miss = floor((attended_hours - target_percent / 100 * total_lectures_so_far) / (target_percent / 100))
   - Dismissed banners come back the next day (use localStorage with date key)

3. Today's schedule
   - List of all lectures today: timetable_slots for today's day_of_week + any extra_lectures for today's date
   - Each lecture row:
     - Left: colored subject bar (4px wide, subject color)
     - Subject name + short code
     - Time range (e.g. "9:00 – 10:00 AM")
     - Room / faculty in muted text
     - Right: three action buttons
       - ✓ Attended (fills green on click)
       - ✗ Missed (fills red on click)
       - ↩ Reschedule (opens modal)
     - If already marked: show filled status button, others outlined, small "Edit" link
   - Empty state: "No lectures today" with a small illustration placeholder

4. Reschedule modal
   - "Moving [Subject] lecture to a new date"
   - Date picker for new date
   - Optional new time picker
   - On confirm: creates extra_lecture on new date, marks original as 'cancelled'
   - On cancel: no change

5. If today is a holiday or no-college day:
   - Show a simple card: "[Holiday label] — No classes today" with a small calendar icon

6. Bottom stats row — 4 small metric cards in a row:
   - Overall %
   - Subjects at risk
   - This week: scheduled count
   - This week: attended count

### Calendar screen (/dashboard/calendar)

- Full monthly calendar grid starting Monday
- Each day cell (approx 80px tall):
  - Day number
  - Row of up to 3 small colored dots (one per subject with a lecture that day)
  - A bottom indicator: green dot (all attended), amber dot (partial), red dot (missed all), gray (holiday/no college), nothing (no classes)
- Today: indigo border on the cell
- Future days: slightly muted
- Click any day (past or today): opens a day detail slide-over from the right
- Month navigation: left/right arrows, month+year label centered
- Mini legend below calendar

### Day detail slide-over
- Slides in from right, 400px wide, overlay with backdrop
- Header: full date, close button
- Same lecture list as Today screen with the same mark-attended/missed/reschedule actions
- "Add extra lecture" button at the bottom for any day
- If it's a holiday: show holiday label with an option to remove it
- If no timetable: "No classes scheduled — add an extra lecture if needed"

### Data layer (/lib/attendance.ts)
Create these helper functions:

- getSubjectStats(subjectId, semesterId)
  Returns: { totalHours, attendedHours, missedHours, cancelledHours, attendancePercent, lecturesNeeded, lecturesSafeToMiss, status: 'safe' | 'borderline' | 'at_risk' }
  Status thresholds: safe ≥ 80%, borderline 65–79%, at_risk < 65%

- getDaySchedule(date, userId, semesterId)
  Returns all lectures for a date (regular + extra) with their attendance record if it exists.
  Returns { type: 'holiday', label } if the date is marked as a special day.

- getMonthCalendarData(year, month, userId, semesterId)
  Returns an object keyed by date string with { status, lectureCount, subjectColors[] }

- markAttendance(params: { date, slotId?, extraLectureId?, status, note? })
  Upserts an attendance_record. Validates that exactly one of slotId or extraLectureId is provided.

- getOverallStats(semesterId, userId)
  Returns: { overallPercent, subjectsAtRisk, totalScheduled, totalAttended, totalMissed }
```

---

## PROMPT 4 — Dashboard, reports, target calculator, and export

```
Continue building AttendEase. Auth, timetable, and attendance marking are all working.

Now build the analytics, reports, target calculator, and export features.

### Subject dashboard (/dashboard/dashboard)

Page header: "Dashboard" with a semester progress bar below it (e.g. "Week 12 of 20 — 60% through semester")

Per-subject cards (2-column grid on desktop):
Each card contains:
- Left: subject name, short code in muted text, status badge (Safe / Borderline / At risk)
- Center: circular SVG progress ring
  - Build this as a pure SVG arc. Ring is 80px diameter, 6px stroke.
  - Background ring: #EBEBEB
  - Progress arc: colored by status (green/amber/red)
  - Percentage number centered inside the ring, 600 weight
- Right: stat column
  - "X / Y hrs" (attended / total)
  - "Need N more lectures" or "Safe to miss N" in small muted text
- Bottom: a small 4-week bar sparkline (4 bars, each bar = weekly attendance % for that subject)
  - Build this with inline SVG, no chart library
  - Bars colored by the subject color at 60% opacity, current week at full opacity

Overall summary card (below subject cards, full width):
- Total overall attendance %
- A horizontal stacked bar: green (attended) + red (missed) + gray (remaining hours)
- Counts: attended hours, missed hours, remaining hours

### Attendance target calculator (expandable section on /dashboard/dashboard)

A card with the heading "What-if calculator":
- Subject selector dropdown
- Shows: current %, target %, attended hrs, total hrs
- Two result cards:
  1. "To reach 80%" — N consecutive lectures needed (or "You're already there! ✓")
  2. "Safe to miss" — N more lectures before dropping below 80%
- Slider: "If I attend X% of remaining lectures..."
  - Default: 100%
  - Slide to any %
  - Shows: "Your final attendance will be X%"
  - Logic: final_percent = (attended_hours + slider_value/100 * remaining_hours) / total_hours * 100
- All values update live as subject or slider changes

### Weekly reports (/dashboard/reports)

Two tabs: "This week" and "This semester"

This week tab:
- Week navigator: "< Jun 16–22 >" arrows
- Summary row: 4 metric cards (Scheduled, Attended, Missed, Weekly %)
- Per-subject table:
  Columns: Subject | Scheduled | Attended | Missed | Weekly %
  Row background: subtle green tint if 100%, subtle red tint if 0%, white otherwise
- Insights section: 2–3 auto-generated plain-English observations
  Examples: "You missed all CVT lectures this week — at 71%, 4 below your 80% target"
  Examples: "Perfect week for ML — keep it up"
  Generate these from the data: compare weekly % to overall %, flag subjects that had zero attendance
- Action banner at top if any subject is below 80%: red bordered card listing at-risk subjects

This semester tab:
- Same table layout but aggregated from semester start to today
- Add a trend column: ↑ improving (last 2 weeks avg > overall avg) or ↓ declining

### Export
Add an "Export" button on the reports screen. A small dropdown appears with two options:

1. Export CSV
   - Columns: Date, Day, Subject, Start Time, End Time, Status, Notes
   - One row per lecture record
   - Trigger browser download with filename: "AttendEase_[SemesterName]_[today's date].csv"
   - Build this with vanilla JS (no library needed): construct CSV string, use Blob + URL.createObjectURL

2. Export PDF
   - Use the jsPDF library (import from CDN or npm)
   - Layout:
     - Header: "AttendEase — Attendance Report"
     - Subtitle: semester name, date range, generated date
     - Summary table: subject name | total hrs | attended | missed | %
     - Day-by-day log table for the selected date range
   - Filename: "AttendEase_Report_[date].pdf"

### In-app notifications (no browser push — purely visual)

1. Top-of-page alert banner system (already started in Prompt 3 — extend it here):
   - On every /dashboard page, check subjects below 80%
   - Show dismissible banners, one per at-risk subject
   - Store dismissals in localStorage with a date key so they re-appear the next day
   - Banners appear just below the top bar, above the page content

2. "Mark today" reminder:
   - If it is past 5PM and today has unmarked lectures, show a persistent amber banner on the Today screen:
     "You have X unmarked lectures today — mark them before the day ends"

### Final polish
Apply these to the entire app:

- Loading states: use skeleton screens (gray animated placeholder blocks) for all data-fetching areas — not spinners
- Empty states: every list/grid has a proper empty state with an icon and a clear action prompt
- Error handling: all Supabase errors show a toast notification (bottom-right, auto-dismisses after 4s)
- Confirmation modals: any destructive action (delete subject, delete semester, clear records) requires typing the name or clicking a red confirm button in a modal
- Responsive: fully functional on 375px mobile width
- Page titles: format as "Today | AttendEase", "Calendar | AttendEase", etc.
- Favicon: use a simple SVG favicon — a small circle with "A" in indigo

End of app. After building, output:
- Final folder structure
- List of all environment variables required
- Step-by-step Vercel deployment instructions including: GitHub push, Vercel import, env var setup, Supabase auth redirect URL configuration
```

---

## Environment variables

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Get both from: Supabase → Project Settings → API

---

## Deployment checklist

1. Run all 4 prompts in Claude Code, verifying each works before proceeding
2. Push the final project to a GitHub repo
3. Go to vercel.com → Add New Project → Import the repo
4. Add both env vars in Vercel's Environment Variables settings
5. Deploy
6. Copy your Vercel deployment URL
7. Go to Supabase → Authentication → URL Configuration
8. Add the Vercel URL to "Redirect URLs" (e.g. https://your-app.vercel.app/**)
9. Done
