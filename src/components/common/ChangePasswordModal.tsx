import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, X } from 'lucide-react';
import { User } from '../../types';
import { storage } from '../../services/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onSuccess: (updatedUser: User) => void;
  isMandatory?: boolean;
}

export const ChangePasswordModal: React.FC<Props> = ({
  isOpen,
  onClose,
  user,
  onSuccess,
  isMandatory = false
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  // Password strength calculation
  const getStrength = (pass: string) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 8) score += 1;
    if (/[0-9]/.test(pass) && /[a-zA-Z\u0600-\u06FF]/.test(pass)) score += 1;
    if (/[^a-zA-Z0-9\u0600-\u06FF]/.test(pass)) score += 1;
    return score;
  };

  const strength = getStrength(newPassword);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 خانات على الأقل.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('كلمة المرور وتأكيدها غير متطابقين.');
      return;
    }

    // Update user password
    const users = storage.getUsers();
    const targetUser = users.find(u => u.id === user.id);
    if (!targetUser) {
      setError('حدث خطأ في العثور على الحساب.');
      return;
    }

    targetUser.passwordHash = newPassword;
    targetUser.mustChangePassword = false;
    storage.saveUsers(users);
    storage.setCurrentUser(targetUser);

    storage.logAudit(
      targetUser.id,
      targetUser.displayName,
      'تغيير كلمة المرور',
      'User',
      targetUser.id,
      'تم تغيير كلمة المرور بنجاح'
    );

    setSuccessMsg('تم تغيير كلمة المرور بنجاح!');
    setTimeout(() => {
      onSuccess(targetUser);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100">
        <div className="bg-[#1F4E8C] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10">
              <Lock className="w-5 h-5 text-blue-100" />
            </div>
            <div>
              <h3 className="font-bold text-base">تغيير كلمة المرور</h3>
              <p className="text-xs text-blue-100">{user.displayName}</p>
            </div>
          </div>
          {!isMandatory && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-right">
          {isMandatory && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>إجراء إجباري: يجب تغيير كلمة المرور المبدئية عند تسجيل الدخول لأول مرة.</span>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">كلمة المرور الجديدة</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="6 خانات على الأقل"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#1F4E8C] focus:ring-1 focus:ring-[#1F4E8C] outline-hidden pr-3 pl-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute left-3 top-2.5 text-slate-400 hover:text-slate-600"
              >
                {showPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* Simple strength indicator (AUTH-11) */}
            {newPassword && (
              <div className="mt-2 space-y-1">
                <div className="flex gap-1 h-1.5">
                  <div className={`flex-1 rounded-full ${strength >= 1 ? (strength === 1 ? 'bg-rose-500' : 'bg-emerald-500') : 'bg-slate-200'}`} />
                  <div className={`flex-1 rounded-full ${strength >= 2 ? (strength === 2 ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-slate-200'}`} />
                  <div className={`flex-1 rounded-full ${strength >= 3 ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                  <div className={`flex-1 rounded-full ${strength >= 4 ? 'bg-emerald-600' : 'bg-slate-200'}`} />
                </div>
                <p className="text-[10px] text-slate-500">
                  {strength <= 1 ? 'ضعيفة' : strength === 2 ? 'متوسطة' : strength === 3 ? 'جيدة' : 'قوية جداً'}
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">تأكيد كلمة المرور الجديدة</label>
            <input
              type={showPass ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="أعد إدخال كلمة المرور"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#1F4E8C] focus:ring-1 focus:ring-[#1F4E8C] outline-hidden"
              required
            />
          </div>

          <div className="pt-3 flex gap-2">
            <button
              type="submit"
              className="flex-1 py-2.5 px-4 bg-[#1F4E8C] hover:bg-[#163A6B] text-white rounded-xl font-bold text-sm transition-colors shadow-sm"
            >
              حفظ وتغيير كلمة المرور
            </button>
            {!isMandatory && (
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-sm transition-colors"
              >
                لاحقاً
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
