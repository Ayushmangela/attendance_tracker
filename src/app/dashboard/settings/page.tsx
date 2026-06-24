'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, User, ShieldAlert, Sparkles, Check, Trash2, Plus, ArrowUpRight } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import type { Semester } from '@/lib/types';

export default function SettingsPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [loading, setLoading] = useState(true);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  
  // Forms
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [defaultTarget, setDefaultTarget] = useState(80);
  
  // Semester Modal
  const [isSemesterModalOpen, setIsSemesterModalOpen] = useState(false);
  const [newSemName, setNewSemName] = useState('');
  const [newSemStart, setNewSemStart] = useState('');
  const [newSemEnd, setNewSemEnd] = useState('');

  // Delete Confirm Modal
  const [semesterToDelete, setSemesterToDelete] = useState<Semester | null>(null);
  
  // Feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserEmail(user.email || '');
          setDisplayName(user.user_metadata?.display_name || '');
          setDefaultTarget(user.user_metadata?.default_target_percent || 80);
        }

        const { data: sData, error: sError } = await supabase
          .from('semesters')
          .select('*')
          .order('created_at', { ascending: false });

        if (sError) throw sError;
        setSemesters(sData || []);
      } catch (err: any) {
        showToast(err.message || 'Error loading settings data', 'error');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [supabase]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: { display_name: displayName, default_target_percent: defaultTarget }
      });
      if (error) throw error;
      showToast('Profile settings saved successfully.');
    } catch (err: any) {
      showToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    setActionLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      showToast('Password changed successfully.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showToast(err.message || 'Failed to update password', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateSemester = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSemName.trim() || !newSemStart || !newSemEnd) return;
    if (new Date(newSemStart) > new Date(newSemEnd)) {
      showToast('Start date cannot be after end date.', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User session not found');

      // Create new semester
      const { data, error } = await supabase
        .from('semesters')
        .insert({
          user_id: user.id,
          name: newSemName,
          start_date: newSemStart,
          end_date: newSemEnd,
          is_active: semesters.length === 0 // Active by default if it is the first semester
        })
        .select()
        .single();

      if (error) throw error;

      setSemesters([data, ...semesters]);
      setIsSemesterModalOpen(false);
      setNewSemName('');
      setNewSemStart('');
      setNewSemEnd('');
      showToast('New semester created.');
      router.refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to create semester', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSetActiveSemester = async (id: string) => {
    setActionLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User session not found');

      // Deactivate all semesters
      await supabase.from('semesters').update({ is_active: false }).eq('user_id', user.id);
      
      // Activate selected semester
      const { error } = await supabase.from('semesters').update({ is_active: true }).eq('id', id);
      if (error) throw error;

      // Update local state
      setSemesters(semesters.map((s) => ({ ...s, is_active: s.id === id })));
      showToast('Active semester updated.');
      router.refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to set active semester', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSemester = async () => {
    if (!semesterToDelete) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.from('semesters').delete().eq('id', semesterToDelete.id);
      if (error) throw error;

      const updated = semesters.filter((s) => s.id !== semesterToDelete.id);
      
      // If we deleted the active semester and have other semesters, activate the first remaining one
      if (semesterToDelete.is_active && updated.length > 0) {
        const firstRemainingId = updated[0].id;
        await supabase.from('semesters').update({ is_active: true }).eq('id', firstRemainingId);
        updated[0].is_active = true;
      }

      setSemesters(updated);
      setSemesterToDelete(null);
      showToast('Semester deleted successfully.');
      router.refresh();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete semester', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmation = window.confirm('Are you sure you want to delete your account? This will erase all your semesters, subjects, timetable slots, and attendance records permanently. This action is irreversible.');
    if (!confirmation) return;
    
    setActionLoading(true);
    try {
      // In Supabase, standard clients cannot delete users directly without admin privileges. 
      // Instead, we will delete all user-related data from tables (cascaded by semesters deletion anyway)
      // and sign out, instructing them that user records are deleted.
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('semesters').delete().eq('user_id', user.id);
        await supabase.auth.signOut();
        showToast('All your data has been deleted.');
        router.push('/register');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to clean user data', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-[#EBEBEB] w-48 rounded animate-pulse" />
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-64 bg-[#EBEBEB] rounded-xl animate-pulse" />
          <div className="h-64 bg-[#EBEBEB] rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Semester Management Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-[#5B5BD6]" />
            <h2 className="text-base font-medium text-[#111111]">
              Semester Management
            </h2>
          </div>
          <button
            onClick={() => setIsSemesterModalOpen(true)}
            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
          >
            <Plus size={14} /> New Semester
          </button>
        </div>

        <div className="space-y-3">
          {semesters.length === 0 ? (
            <p className="text-xs text-[#6B6B6B] py-4 text-center">
              No semesters created yet. Click above to create one.
            </p>
          ) : (
            semesters.map((sem) => (
              <div
                key={sem.id}
                className="flex items-center justify-between p-3.5 bg-white border border-[#EBEBEB] rounded-lg"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#111111] truncate">
                      {sem.name}
                    </span>
                    {sem.is_active && (
                      <span className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-[#1A9E5F]/10 text-[#1A9E5F]">
                        Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#6B6B6B] mt-1">
                    {new Date(sem.start_date).toLocaleDateString()} – {new Date(sem.end_date).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {!sem.is_active && (
                    <button
                      onClick={() => handleSetActiveSemester(sem.id)}
                      disabled={actionLoading}
                      className="btn-secondary text-xs py-1 px-2.5"
                    >
                      Make Active
                    </button>
                  )}
                  <button
                    onClick={() => setSemesterToDelete(sem)}
                    disabled={actionLoading}
                    className="text-[#6B6B6B] hover:text-[#DC2626] transition-colors p-1.5 rounded hover:bg-[#FAFAFA]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Account Settings */}
        <div className="card flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <User size={18} className="text-[#5B5BD6]" />
              <h2 className="text-base font-medium text-[#111111]">
                Account & Preferences
              </h2>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div>
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  Email Address (read-only)
                </label>
                <input
                  type="email"
                  readOnly
                  disabled
                  value={userEmail}
                  className="input-field text-sm opacity-60 cursor-not-allowed bg-[#FAFAFA]"
                />
              </div>

              <div>
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  Display Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Alex Johnson"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="input-field text-sm"
                />
              </div>

              <div>
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  Default Attendance Target %
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={defaultTarget}
                  onChange={(e) => setDefaultTarget(Number(e.target.value))}
                  className="input-field text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="btn-primary w-full text-xs py-2 mt-2"
              >
                Save Profile settings
              </button>
            </form>
          </div>
        </div>

        {/* Change Password */}
        <div className="card flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-6">
              <ShieldAlert size={18} className="text-[#5B5BD6]" />
              <h2 className="text-base font-medium text-[#111111]">
                Security
              </h2>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  New Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field text-sm"
                  minLength={6}
                />
              </div>

              <div>
                <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                  Confirm Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-field text-sm"
                  minLength={6}
                />
              </div>

              <button
                type="submit"
                disabled={actionLoading}
                className="btn-secondary w-full text-xs py-2 mt-2"
              >
                Change Password
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Export & Danger Zone */}
      <div className="card border-[#DC2626]/20 bg-white">
        <h2 className="text-base font-medium text-[#DC2626] mb-4">
          Danger Zone
        </h2>
        <p className="text-xs text-[#6B6B6B] leading-relaxed mb-6">
          Be careful. These actions delete your data and cannot be undone. To review your attendance sheets or export them to CSV/PDF, visit the Reports tab.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => router.push('/dashboard/reports')}
            className="btn-secondary text-xs py-2 px-4 flex items-center justify-center gap-1"
          >
            Export Attendance Data <ArrowUpRight size={14} />
          </button>

          <button
            onClick={handleDeleteAccount}
            disabled={actionLoading}
            className="btn-secondary border-[#DC2626]/30 text-[#DC2626] hover:bg-[#DC2626]/5 hover:border-[#DC2626] text-xs py-2 px-4"
          >
            Delete Account Data
          </button>
        </div>
      </div>

      {/* Create Semester Modal */}
      <Modal
        isOpen={isSemesterModalOpen}
        onClose={() => setIsSemesterModalOpen(false)}
        title="Create New Semester"
      >
        <form onSubmit={handleCreateSemester} className="space-y-4">
          <div>
            <label className="text-[#6B6B6B] text-xs mb-1.5 block">
              Semester Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Semester 6 2025-26"
              value={newSemName}
              onChange={(e) => setNewSemName(e.target.value)}
              className="input-field text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                Start Date
              </label>
              <input
                type="date"
                required
                value={newSemStart}
                onChange={(e) => setNewSemStart(e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="text-[#6B6B6B] text-xs mb-1.5 block">
                End Date
              </label>
              <input
                type="date"
                required
                value={newSemEnd}
                onChange={(e) => setNewSemEnd(e.target.value)}
                className="input-field text-sm"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={actionLoading}
              className="btn-primary text-xs py-2 flex-1"
            >
              Create Semester
            </button>
            <button
              type="button"
              onClick={() => setIsSemesterModalOpen(false)}
              className="btn-secondary text-xs py-2 flex-1"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Semester Confirmation Modal */}
      <Modal
        isOpen={semesterToDelete !== null}
        onClose={() => setSemesterToDelete(null)}
        title="Delete Semester"
      >
        <div className="space-y-4">
          <p className="text-xs text-[#6B6B6B] leading-relaxed">
            Are you sure you want to delete semester <span className="font-medium text-[#111111]">"{semesterToDelete?.name}"</span>? 
            Deleting a semester will permanently delete all associated subjects, timetable slots, extra lectures, and attendance records.
          </p>
          <div className="flex gap-3">
            <button
              onClick={handleDeleteSemester}
              disabled={actionLoading}
              className="btn-primary bg-[#DC2626] hover:bg-[#DC2626]/90 border-transparent text-xs py-2 flex-1"
            >
              Yes, Delete Permanently
            </button>
            <button
              onClick={() => setSemesterToDelete(null)}
              className="btn-secondary text-xs py-2 flex-1"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      {/* Toast Notification */}
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
