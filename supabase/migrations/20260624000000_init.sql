-- Create standard updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 1. semesters Table
CREATE TABLE semesters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT start_end_date_check CHECK (start_date <= end_date)
);

-- 2. subjects Table
CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    short_code TEXT NOT NULL,
    total_hours INTEGER NOT NULL CHECK (total_hours >= 0),
    attendance_target_percent INTEGER NOT NULL DEFAULT 80 CHECK (attendance_target_percent BETWEEN 0 AND 100),
    color TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. timetable_slots Table
CREATE TABLE timetable_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 6), -- 1=Monday to 6=Saturday
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    room TEXT,
    faculty TEXT,
    CONSTRAINT timetable_slots_time_check CHECK (start_time < end_time)
);

-- 4. special_days Table
CREATE TABLE special_days (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('holiday', 'no_college', 'extra_working')),
    label TEXT NOT NULL
);

-- 5. extra_lectures Table
CREATE TABLE extra_lectures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    semester_id UUID NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    reason TEXT,
    original_timetable_slot_id UUID REFERENCES timetable_slots(id) ON DELETE SET NULL,
    CONSTRAINT extra_lectures_time_check CHECK (start_time < end_time)
);

-- 6. attendance_records Table
CREATE TABLE attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    timetable_slot_id UUID REFERENCES timetable_slots(id) ON DELETE CASCADE,
    extra_lecture_id UUID REFERENCES extra_lectures(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('attended', 'missed', 'cancelled')),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Enforce that either timetable_slot_id OR extra_lecture_id is set (or at least check constraint logic)
    CONSTRAINT check_slot_or_extra CHECK (
        (timetable_slot_id IS NOT NULL AND extra_lecture_id IS NULL) OR
        (timetable_slot_id IS NULL AND extra_lecture_id IS NOT NULL)
    )
);

-- Enable RLS on all tables
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE timetable_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE special_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE extra_lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can manage their own semesters" ON semesters
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own subjects" ON subjects
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own timetable slots" ON timetable_slots
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own special days" ON special_days
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own extra lectures" ON extra_lectures
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own attendance records" ON attendance_records
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Attach trigger for updated_at on attendance_records
CREATE TRIGGER trigger_update_attendance_records_updated_at
BEFORE UPDATE ON attendance_records
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
