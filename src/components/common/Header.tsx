import React, { useState, useEffect } from 'react';
import { LogOut, Bell, Key, RefreshCw } from 'lucide-react';
import { User } from '../../types';
import { storage } from '../../services/storage';
import { NotificationCenterModal } from './NotificationCenterModal';
import { ChangePasswordModal } from './ChangePasswordModal';
import { PWAInstallButton } from './PWAInstallButton';

interface Props {
  currentUser: User;
  onLogout: () => void;
  onUserUpdated: (user: User) => void;
  onNavigateToStudentAttendance?: (studentId: string) => void;
  onSwitchUser?: (newUser: User) => void;
}

export const Header: React.FC<Props> = ({
  currentUser,
  onLogout,
  onUserUpdated,
  onNavigateToStudentAttendance,
  onSwitchUser
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);
  const [schoolSettings, setSchoolSettings] = useState(() => storage.getSettings());

  useEffect(() => {
    const handleSettingsUpdate = () => {
      setSchoolSettings(storage.getSettings());
    };
    window.addEventListener('nps_settings_updated', handleSettingsUpdate);
    return () => window.removeEventListener('nps_settings_updated', handleSettingsUpdate);
  }, []);

  const notifications = storage.getNotifications();
  const unreadCount = notifications.filter(n => {
    if (currentUser.role === 'owner') return !n.isRead;
    if (currentUser.role === 'parent') return !n.isRead && (n.recipientPhone === currentUser.phone || n.recipientRole === 'parent');
    return !n.isRead && n.recipientRole === currentUser.role;
  }).length;

  const roleLabels: Record<string, { label: string; bg: string; text: string }> = {
    owner: { label: 'المالك / الإدارة', bg: 'bg-indigo-100', text: 'text-indigo-800' },
    teacher: { label: 'معلم', bg: 'bg-emerald-100', text: 'text-emerald-800' },
    parent: { label: 'ولي أمر', bg: 'bg-amber-100', text: 'text-amber-800' }
  };

  const currentRoleInfo = roleLabels[currentUser.role] || roleLabels.owner;
  const allUsers = storage.getUsers().filter(u => u.role !== 'secretary');

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs no-print">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
          {/* School Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#1F4E8C] p-1.5 flex items-center justify-center shadow-xs shrink-0 overflow-hidden">
              <img src={schoolSettings.logoUrl || '/icons/icon.svg'} alt="شعار المدرسة" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold text-[#163A6B] text-sm sm:text-base leading-none truncate">{schoolSettings.schoolName}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-blue-100 text-[#1F4E8C] shrink-0">NPS</span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">نظام إدارة المدارس والحضور والإشعارات</p>
            </div>
          </div>

          {/* Center / Right Actions */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Install Button in Header */}
            <PWAInstallButton variant="secondary" className="hidden md:flex" />

            {/* Notifications Bell - Always visible in top bar */}
            <button
              onClick={() => setShowNotifications(true)}
              className="relative p-2.5 rounded-xl bg-blue-50 text-[#1F4E8C] hover:bg-blue-100 border border-blue-200/70 transition-colors flex items-center gap-1.5"
              title="الإشعارات"
            >
              <Bell className="w-5 h-5" />
              <span className="hidden sm:inline text-xs font-bold">الإشعارات</span>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] flex items-center justify-center px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold shadow-xs">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* User Profile Pill */}
            <div className="flex items-center gap-2 pr-2 border-r border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-800 leading-tight truncate max-w-[140px]">
                  {currentUser.displayName}
                </p>
                <span className={`inline-block text-[10px] font-bold px-1.5 py-0.2 rounded ${currentRoleInfo.bg} ${currentRoleInfo.text}`}>
                  {currentRoleInfo.label}
                  {currentUser.role === 'teacher' && (() => {
                    const tch = storage.getTeachers().find(t => t.userId === currentUser.id || t.id === currentUser.relatedId);
                    return tch?.subject ? ` • ${tch.subject}` : '';
                  })()}
                </span>
              </div>

              {/* Quick switch role dropdown for demonstration */}
              {onSwitchUser && (
                <div className="relative">
                  <button
                    onClick={() => setShowSwitchMenu(!showSwitchMenu)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                    title="تبديل الدور للتجربة"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline text-[11px]">تبديل الدور</span>
                  </button>

                  {showSwitchMenu && (
                    <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 text-right">
                      <p className="px-3 py-1 text-[11px] font-bold text-slate-400 border-b border-slate-100">
                        تسجيل سريع بأي حساب للتجربة:
                      </p>
                      {allUsers.slice(0, 6).map(u => (
                        <button
                          key={u.id}
                          onClick={() => {
                            setShowSwitchMenu(false);
                            onSwitchUser(u);
                          }}
                          className="w-full px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 transition-colors text-right"
                        >
                          <span className="font-semibold text-slate-800 truncate max-w-[150px]">{u.displayName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {roleLabels[u.role]?.label || u.role}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Change Password button */}
              <button
                onClick={() => setShowChangePass(true)}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                title="تغيير كلمة المرور"
              >
                <Key className="w-4 h-4" />
              </button>

              {/* Logout button */}
              <button
                onClick={onLogout}
                className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 transition-colors"
                title="تسجيل الخروج"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Modals */}
      <NotificationCenterModal
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        currentUser={currentUser}
        onSelectStudentAttendance={onNavigateToStudentAttendance}
      />

      <ChangePasswordModal
        isOpen={showChangePass}
        onClose={() => setShowChangePass(false)}
        user={currentUser}
        onSuccess={onUserUpdated}
      />
    </>
  );
};
