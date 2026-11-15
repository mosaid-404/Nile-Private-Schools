import React, { useState } from 'react';
import { Settings, Bell, Shield, LogOut, CheckCircle2, X, Check } from 'lucide-react';
import { User, AttendanceNotificationPreference } from '../../types';
import { storage } from '../../services/storage';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { MobilePushBanner } from '../common/MobilePushBanner';

interface ContentProps {
  currentUser: User;
  onOpenChangePassword: () => void;
  onLogout: () => void;
  showProfileHeader?: boolean;
  showPWABanner?: boolean;
}

export const ParentSettingsContent: React.FC<ContentProps> = ({
  currentUser,
  onOpenChangePassword,
  onLogout,
  showProfileHeader = true,
  showPWABanner = true
}) => {
  const [pref, setPref] = useState<AttendanceNotificationPreference>(() =>
    storage.getParentNotificationPref(currentUser.relatedId, currentUser.phone)
  );
  const [savedToast, setSavedToast] = useState(false);

  const handleSelectPref = (nextPref: AttendanceNotificationPreference) => {
    setPref(nextPref);
    storage.setParentNotificationPref(currentUser, nextPref);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2500);
  };

  const options: {
    id: AttendanceNotificationPreference;
    title: string;
    desc: string;
  }[] = [
    {
      id: 'presence_only',
      title: 'إشعارات الحضور فقط',
      desc: 'يصل إشعار عند تسجيل حضور الطالب فقط دون إشعارات الغياب أو الانصراف'
    },
    {
      id: 'absence_only',
      title: 'إشعارات الانصراف / الغياب فقط',
      desc: 'يصل إشعار عند تسجيل انصراف أو غياب الطالب فقط دون إشعارات الحضور'
    },
    {
      id: 'both',
      title: 'الحضور والانصراف / الغياب معاً',
      desc: 'يصل إشعار عند تسجيل الحضور وكذلك عند الغياب أو الانصراف'
    }
  ];

  const matchedParent = storage.getParents().find(
    p =>
      p.userId === currentUser.id ||
      p.id === currentUser.relatedId ||
      (currentUser.phone && p.phone === currentUser.phone)
  );
  const resolvedName = matchedParent?.displayName || currentUser.displayName || currentUser.username;

  return (
    <div className="space-y-4">
      {showProfileHeader && (
        <div className="flex items-center gap-3.5 pb-4 border-b border-slate-200">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1F4E8C] flex items-center justify-center shrink-0 border border-blue-100">
            <Settings className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug">{resolvedName}</h2>
            <p className="text-xs text-slate-500 font-mono mt-0.5">رقم الهاتف: {currentUser.phone}</p>
          </div>
        </div>
      )}

      {/* Attendance & Departure Notification Preference */}
      <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#1F4E8C] shrink-0" />
            <h3 className="text-xs sm:text-sm font-extrabold text-slate-900">
              تفضيلات إشعارات الحضور والانصراف / الغياب
            </h3>
          </div>
          {savedToast && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تم الحفظ</span>
            </span>
          )}
        </div>

        <div className="space-y-2">
          {options.map(opt => {
            const isSelected = pref === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelectPref(opt.id)}
                className={`w-full p-3 rounded-xl border text-right flex items-start justify-between gap-3 transition-all ${
                  isSelected
                    ? 'bg-white border-[#1F4E8C] ring-2 ring-[#1F4E8C]/15 shadow-2xs'
                    : 'bg-white/70 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="space-y-0.5">
                  <span
                    className={`block text-xs font-extrabold ${
                      isSelected ? 'text-[#1F4E8C]' : 'text-slate-800'
                    }`}
                  >
                    {opt.title}
                  </span>
                  <span className="block text-[11px] text-slate-500 leading-relaxed">
                    {opt.desc}
                  </span>
                </div>

                <span
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition ${
                    isSelected
                      ? 'bg-[#1F4E8C] border-[#1F4E8C] text-white'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5" />}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <MobilePushBanner currentUser={currentUser} variant="settings" />

      {showPWABanner && <PWAInstallButton variant="banner" />}

      {/* Change Password */}
      <button
        type="button"
        onClick={onOpenChangePassword}
        className="w-full p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 flex items-center justify-between text-xs font-bold text-slate-800 transition"
      >
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-[#1F4E8C]" />
          <div className="text-right">
            <span className="block">تغيير كلمة المرور</span>
            <span className="text-[10px] text-slate-400 font-normal">حدّث كلمة مرور حسابك في أي وقت</span>
          </div>
        </div>
        <span>تعديل ←</span>
      </button>

      {/* Logout */}
      <button
        type="button"
        onClick={onLogout}
        className="w-full p-4 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition flex items-center justify-center gap-2"
      >
        <LogOut className="w-4 h-4" />
        <span>تسجيل الخروج من الحساب</span>
      </button>
    </div>
  );
};

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onOpenChangePassword: () => void;
  onLogout: () => void;
}

export const ParentSettingsModal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onOpenChangePassword,
  onLogout
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-[#1F4E8C] text-white p-4 px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/10">
              <Settings className="w-5 h-5 text-blue-100" />
            </div>
            <div>
              <h3 className="font-bold text-base">الإعدادات</h3>
              <p className="text-[11px] text-blue-100">التحكم بالإشعارات وكلمة المرور والحساب</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto">
          <ParentSettingsContent
            currentUser={currentUser}
            showProfileHeader={false}
            showPWABanner={false}
            onOpenChangePassword={() => {
              onClose();
              onOpenChangePassword();
            }}
            onLogout={() => {
              onClose();
              onLogout();
            }}
          />
        </div>
      </div>
    </div>
  );
};
