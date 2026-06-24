'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Plus, Pencil, Trash2, Calendar, Target, Clock } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import SlideOver from '@/components/ui/SlideOver';
import Modal from '@/components/ui/Modal';
import type { Subject, Semester } from '@/lib/types';

const COLOR_PRESETS = [
  { name: 'Indigo', hex: '#5B5BD6' },
  { name: 'Teal', hex: '#0D9488' },
  { name: 'Rose', hex: '#E11D48' },
  { name: 'Amber', hex: '#D97706' },
  { name: 'Green', hex: '#1A9E5F' },
  { name: 'Violet', hex: '#7C3AED' },
  { name: 'Sky', hex: '#0284C7' },
  { name: 'Orange', hex: '#EA580C' },
];

export default function SubjectsPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [loading, setLoading] = useState(true);
  const [activeSemester, setActiveSemester] = useState<Semester | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  // Form State (used for both Add and Edit)
  const [isSlideOverOpen, setIsSlideOverOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [subName, setSubName] = useState('');
  const [subCode, setSubCode] = useState('');
  const [subHours, setSubHours] = useState(40);
  const [subTarget, setSubTarget] = useState(80);
  const [subColor, setSubColor] = useState(COLOR_PRESETS[0].hex);

  // Delete State
  const [subjectToDelete, setSubjectToDelete] = useState<Subject | null>(null);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    async function loadData() {
      try {
        // 1. Fetch active semester
        const { data: semesters, error: semError } = await supabase
          .from('semesters')
          .select('*');

        if (semError) throw semError;
        
        const active = semesters?.find((s) => s.is_active) || semesters?.[0] || null;
        setActiveSemester(active);

        if (active) {
          // 2. Fetch subjects for the active semester
          const { data: subjectsData, error: subError } = await supabase
            .from('subjects')
            .select('*')
            .eq('semester_id', active.id)
            .order('created_at', { ascending: true });

          if (subError) throw subError;
          setSubjects(subjectsData || []);
        }
      } catch (err: any) {
        showToast(err.message || 'Failed to load subjects', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [supabase]);

  const handleSubjectNameChange = (val: string) => {
    setSubName(val);
    if (!editingSubject && val.trim()) {
      const words = val.trim().split(/\s+/);
      const code = words
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 4);
      setSubCode(code);
    }
  };

  const openAddSlideOver = () => {
    setEditingSubject(null);
    setSubName('');
    setSubCode('');
    setSubHours(40);
    setSubTarget(80);
    setSubColor(COLOR_PRESETS[subjects.length % COLOR_PRESETS.length].hex);
    setIsSlideOverOpen(true);
  };

  const openEditSlideOver = (subject: Subject) => {
    setEditingSubject(subject);
    setSubName(subject.name);
    setSubCode(subject.short_code);
    setSubHours(subject.total_hours);
    setSubTarget(subject.attendance_target_percent);
    setSubColor(subject.color);
    setIsSlideOverOpen(true);
  };

  const handleSaveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subName.trim() || !subCode.trim() || !activeSemester) return;

    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User session not found');

      if (editingSubject) {
        // UPDATE
        const { data, error } = await supabase
          .from('subjects')
          .update({
            name: subName,
            short_code: subCode,
            total_hours: subHours,
            attendance_target_percent: subTarget,
            color: subColor,
          })
          .eq('id', editingSubject.id)
          .select()
          .single();

        if (error) throw error;

        setSubjects(subjects.map((s) => (s.id === editingSubject.id ? data : s)));
        showToast('Subject updated successfully.');
      } else {
        // CREATE
        const { data, error } = await supabase
          .from('subjects')
          .insert({
            user_id: user.id,
            semester_id: activeSemester.id,
            name: subName,
            short_code: subCode,
            total_hours: subHours,
            attendance_target_percent: subTarget,
            color: subColor,
          })
          .select()
          .single();

        if (error) throw error;

        setSubjects([...subjects, data]);
        showToast('Subject added successfully.');
      }

      setIsSlideOverOpen(false);
      router.refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to save subject', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSubject = async () => {
    if (!subjectToDelete) return;

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('subjects')
        .delete()
        .eq('id', subjectToDelete.id);

      if (error) throw error;

      setSubjects(subjects.filter((s) => s.id !== subjectToDelete.id));
      setSubjectToDelete(null);
      showToast('Subject deleted successfully.');
      router.refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete subject', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-8 bg-[#EBEBEB] w-48 rounded animate-pulse" />
          <div className="h-8 bg-[#EBEBEB] w-32 rounded animate-pulse" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-36 bg-[#EBEBEB] rounded-xl animate-pulse" />
          <div className="h-36 bg-[#EBEBEB] rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-lg font-medium text-[#111111] tracking-tight">
            Subjects
          </h1>
          <p className="text-xs text-[#6B6B6B]">
            Manage your courses for the current active semester.
          </p>
        </div>
        
        {activeSemester && (
          <button
            onClick={openAddSlideOver}
            className="btn-primary text-xs py-2 px-3 flex items-center gap-1"
          >
            <Plus size={14} /> Add Subject
          </button>
        )}
      </div>

      {!activeSemester ? (
        <div className="card text-center py-12">
          <Calendar size={32} className="mx-auto text-[#ABABAB] mb-3" />
          <h3 className="text-sm font-medium text-[#111111] mb-1">No Active Semester</h3>
          <p className="text-xs text-[#6B6B6B] max-w-sm mx-auto mb-4">
            You must have an active semester to manage subjects. Go to Settings to create or activate a semester.
          </p>
        </div>
      ) : subjects.length === 0 ? (
        <div className="card text-center py-12">
          <BookOpen size={32} className="mx-auto text-[#ABABAB] mb-3" />
          <h3 className="text-sm font-medium text-[#111111] mb-1">No Subjects Added</h3>
          <p className="text-xs text-[#6B6B6B] max-w-sm mx-auto mb-4">
            Add subjects to start building your weekly timetable and logging attendance records.
          </p>
          <button
            onClick={openAddSlideOver}
            className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
          >
            <Plus size={14} /> Add Your First Subject
          </button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {subjects.map((subject) => (
            <div
              key={subject.id}
              className="card relative flex flex-col justify-between overflow-hidden group hover:border-[#ABABAB] transition-colors"
            >
              {/* Left Color Indicator Bar */}
              <div
                className="absolute top-0 bottom-0 left-0 w-1.5"
                style={{ backgroundColor: subject.color }}
              />

              <div className="pl-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-[#111111] leading-snug">
                      {subject.name}
                    </h3>
                    <span className="inline-block px-1.5 py-0.5 text-[10px] text-[#6B6B6B] font-medium bg-[#FAFAFA] border border-[#EBEBEB] rounded mt-1.5">
                      {subject.short_code}
                    </span>
                  </div>

                  {/* Actions visible on card hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEditSlideOver(subject)}
                      className="text-[#6B6B6B] hover:text-[#5B5BD6] p-1.5 rounded hover:bg-[#FAFAFA] transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setSubjectToDelete(subject)}
                      className="text-[#6B6B6B] hover:text-[#DC2626] p-1.5 rounded hover:bg-[#FAFAFA] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Details / Stats row */}
                <div className="grid grid-cols-3 gap-2 mt-6 pt-4 border-t border-[#EBEBEB]">
                  <div>
                    <span className="text-[10px] text-[#6B6B6B] block">Attendance</span>
                    <span className="text-sm font-semibold text-[#111111] mt-0.5 block">0%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#6B6B6B] block flex items-center gap-0.5">
                      <Target size={10} /> Target
                    </span>
                    <span className="text-sm font-semibold text-[#111111] mt-0.5 block">
                      {subject.attendance_target_percent}%
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#6B6B6B] block flex items-center gap-0.5">
                      <Clock size={10} /> Syllabus
                    </span>
                    <span className="text-sm font-semibold text-[#111111] mt-0.5 block">
                      {subject.total_hours} hrs
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit SlideOver Form */}
      <SlideOver
        isOpen={isSlideOverOpen}
        onClose={() => setIsSlideOverOpen(false)}
        title={editingSubject ? 'Edit Subject' : 'Add New Subject'}
      >
        <form onSubmit={handleSaveSubject} className="space-y-5">
          <div>
            <label className="text-[#6B6B6B] text-xs mb-1.5 block">
              Subject Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Computer Networks"
              value={subName}
              onChange={(e) => handleSubjectNameChange(e.target.value)}
              className="input-field text-sm"
              disabled={actionLoading}
            />
          </div>

          <div>
            <label className="text-[#6B6B6B] text-xs mb-1.5 block">
              Short Code
            </label>
            <input
              type="text"
              required
              placeholder="e.g. CN"
              value={subCode}
              onChange={(e) => setSubCode(e.target.value.toUpperCase())}
              className="input-field text-sm"
              disabled={actionLoading}
            />
          </div>

          <div>
            <label className="text-[#6B6B6B] text-xs mb-1.5 block">
              Total Syllabus Hours
            </label>
            <input
              type="number"
              min={1}
              required
              value={subHours}
              onChange={(e) => setSubHours(Number(e.target.value))}
              className="input-field text-sm"
              disabled={actionLoading}
            />
          </div>

          <div>
            <label className="text-[#6B6B6B] text-xs mb-1.5 block">
              Attendance Target %
            </label>
            <input
              type="number"
              min={0}
              max={100}
              required
              value={subTarget}
              onChange={(e) => setSubTarget(Number(e.target.value))}
              className="input-field text-sm"
              disabled={actionLoading}
            />
          </div>

          {/* Color Presets */}
          <div>
            <label className="text-[#6B6B6B] text-xs mb-2.5 block">
              Theme Color
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color.hex}
                  type="button"
                  onClick={() => setSubColor(color.hex)}
                  className={`w-6 h-6 rounded-full border flex items-center justify-center transition-transform ${
                    subColor === color.hex ? 'scale-110 border-[#111111]' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color.hex }}
                  disabled={actionLoading}
                >
                  {subColor === color.hex && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-[#EBEBEB]">
            <button
              type="submit"
              disabled={actionLoading}
              className="btn-primary text-xs py-2 flex-1"
            >
              {editingSubject ? 'Save Changes' : 'Add Course'}
            </button>
            <button
              type="button"
              onClick={() => setIsSlideOverOpen(false)}
              className="btn-secondary text-xs py-2 flex-1"
            >
              Cancel
            </button>
          </div>
        </form>
      </SlideOver>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={subjectToDelete !== null}
        onClose={() => setSubjectToDelete(null)}
        title="Delete Subject"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#6B6B6B] leading-relaxed">
            Are you sure you want to delete <span className="font-medium text-[#111111]">"{subjectToDelete?.name}"</span>? 
            Deleting this course will permanently remove all its associated timetable slots, extra lectures, and attendance logging histories. This is permanent.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleDeleteSubject}
              disabled={actionLoading}
              className="btn-primary bg-[#DC2626] hover:bg-[#DC2626]/90 border-transparent text-xs py-2 flex-1"
            >
              Confirm Delete
            </button>
            <button
              onClick={() => setSubjectToDelete(null)}
              className="btn-secondary text-xs py-2 flex-1"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 p-3 rounded-lg bg-white border border-[#EBEBEB] max-w-sm flex items-center gap-2.5 animate-in fade-in duration-200">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              toast.type === 'error' ? 'bg-[#DC2626]' : 'bg-[#1A9E5F]'
            }`}
          />
          <span className="text-xs font-medium text-[#111111]">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
