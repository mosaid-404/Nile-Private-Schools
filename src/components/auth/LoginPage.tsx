import React, { useState } from 'react';
import { Eye, EyeOff, Lock, User as UserIcon, AlertCircle, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react';
import { User } from '../../types';
import { storage } from '../../services/storage';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { PWAInstallModal } from '../common/PWAInstallModal';

interface Props {
  onLoginSuccess: (user: User) => void;
}

export const LoginPage: React.FC<Props> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lockMinutes, setLockMinutes] = useState(0);
  const [showInstallModal, setShowInstallModal] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedUser = username.trim();
    if (!trimmedUser || !password) {
      setErrorMsg('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }

    // Check lockout (AUTH-07)
    const lockCheck = storage.checkLoginLockout(trimmedUser);
    if (lockCheck.isLocked) {
      setIsLocked(true);
      setLockMinutes(lockCheck.remainingMinutes || 15);
      setErrorMsg(`الحساب مغلق مؤقتاً لمدة ${lockCheck.remainingMinutes} دقيقة بسبب تكرار المحاولات الخاطئة.`);
      return;
    }

    const users = storage.getUsers();
    // Case-insensitive match on username or phone
    const user = users.find(u => u.username.toLowerCase() === trimmedUser.toLowerCase() || (u.phone && u.phone === trimmedUser));

    if (!user || user.passwordHash !== password) {
      const failResult = storage.registerFailedLogin(trimmedUser);
      if (failResult.isLockedNow) {
        setIsLocked(true);
        setLockMinutes(failResult.remainingMinutes || 15);
        setErrorMsg('تم إغلاق الحساب مؤقتاً لمدة 15 دقيقة بعد 5 محاولات فاشلة متتالية.');
      } else {
        // AUTH-06: Don't reveal which input was wrong
        setErrorMsg('اسم المستخدم أو كلمة المرور غير صحيحة.');
      }
      return;
    }

    if (user.status === 'disabled') {
      setErrorMsg('الحساب معطّل، راجع إدارة المدرسة.');
      return;
    }

    // Successful login!
    storage.clearFailedLogin(trimmedUser);
    user.lastLogin = new Date().toISOString();
    storage.saveUsers(users);
    storage.setCurrentUser(user);

    storage.logAudit(
      user.id,
      user.displayName,
      'تسجيل الدخول',
      'User',
      user.id,
      `تسجيل دخول ناجح بصلاحية: ${user.role}`
    );

    onLoginSuccess(user);
  };

  // Quick preset helper for rapid testing
  const selectDemoUser = (userRole: 'owner' | 'teacher' | 'parent') => {
    const users = storage.getUsers();
    const demo = users.find(u => u.role === userRole);
    if (demo) {
      setUsername(demo.username);
      setPassword(demo.passwordHash);
      setErrorMsg('');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#1F4E8C]/10 via-[#F4F6F8] to-white flex flex-col justify-center items-center p-4">
      {/* Top Brand Banner */}
      <div className="w-full max-w-md mx-auto mb-6 text-center">
        <div className="inline-flex p-3 rounded-3xl bg-white shadow-xl shadow-blue-900/10 border border-slate-100 mb-3 overflow-hidden">
          <img src={storage.getSettings().logoUrl || '/icons/icon.svg'} alt="شعار المدرسة" className="w-16 h-16 object-contain" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#163A6B]">
          {storage.getSettings().schoolName}
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 mt-1 font-medium">
          نظام إدارة المدارس والحصص ورصد الغياب والإشعارات (NPS)
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-slate-200/60 border border-slate-100 overflow-hidden">
        {/* Card Header */}
        <div className="bg-[#1F4E8C] px-6 py-4 text-white flex items-center justify-between">
          <div>
            <h2 className="font-bold text-base sm:text-lg">تسجيل الدخول الموحد</h2>
            <p className="text-xs text-blue-100">أدخل بيانات حسابك للمتابعة</p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-white/10 text-xs font-bold text-blue-100">
            PWA
          </span>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-right">
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs sm:text-sm text-rose-700 flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isLocked && (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600" />
              <span>تم تجميد تسجيل الدخول مؤقتاً لمدة {lockMinutes} دقيقة لحماية الحساب.</span>
            </div>
          )}

          {/* Username */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              اسم المستخدم أو رقم الهاتف
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="مثال: admin أو T001 أو 01012345678"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:border-[#1F4E8C] focus:ring-2 focus:ring-[#1F4E8C]/20 outline-hidden transition pr-3 pl-10"
                required
              />
              <UserIcon className="w-5 h-5 text-slate-400 absolute left-3 top-3" />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              كلمة المرور
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور"
                className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:border-[#1F4E8C] focus:ring-2 focus:ring-[#1F4E8C]/20 outline-hidden transition pr-3 pl-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-3 text-slate-400 hover:text-slate-600"
                title={showPassword ? 'إخفاء' : 'إظهار'}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded text-[#1F4E8C] focus:ring-[#1F4E8C]"
              />
              <span>تذكرني على هذا الجهاز</span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-3.5 px-6 rounded-xl bg-[#1F4E8C] hover:bg-[#163A6B] active:scale-[0.98] text-white font-bold text-base shadow-lg shadow-blue-900/15 transition-all cursor-pointer"
          >
            تسجيل الدخول
          </button>

          {/* PWA Install Button on Login Page (AUTH-01, INS-01) */}
          <button
            type="button"
            onClick={() => setShowInstallModal(true)}
            className="w-full py-2.5 px-4 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100/70 text-[#1F4E8C] font-semibold text-xs transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-[#1F4E8C]" />
            <span>تثبيت التطبيق على هاتفك (بدون متجر)</span>
          </button>

          {/* Guidance Note: No self-registration & forgotten password (AUTH-02) */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              عند نسيان كلمة المرور أو لإنشاء حساب جديد، يرجى مراجعة إدارة المدرسة لإعادة تعيينها.
            </p>
          </div>
        </form>

      </div>

      {/* PWA Modal */}
      <PWAInstallModal isOpen={showInstallModal} onClose={() => setShowInstallModal(false)} />
    </div>
  );
};
