import React, { useState, useEffect } from 'react';
import { Users, Bell, User, CheckCircle2, XCircle, Calendar, ChevronDown, Clock, Shield, ArrowLeft, AlertCircle } from 'lucide-react';
import { User as UserType, Student, AttendanceRecord, SessionInstance, Group, AppNotification } from '../../types';
import { storage } from '../../services/storage';
import { formatArabicDate, formatArabicTime, getTodayDateString } from '../../utils/arabic';
import { ChangePasswordModal } from '../common/ChangePasswordModal';
import { PWAInstallButton } from '../common/PWAInstallButton';

interface Props {
  currentUser: UserType;
  onLogout: () => void;
  selectedStudentId?: string;
}

export const ParentDashboard: React.FC<Props> = ({
  currentUser,
  onLogout,
  selectedStudentId
}) => {
  const [activeNav, setActiveNav] = useState<'children' | 'notifications' | 'account'>('children');
  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('all');
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);

  const todayStr = getTodayDateString();

  useEffect(() => {
    // Check if user must change password or first login
    if (currentUser.mustChangePassword) {
      setShowWelcomeModal(true);
    }

    // Load parent's children (PAR-04)
    const allStudents = storage.getStudents();
    const myChildren = allStudents.filter(
      s => s.parentId === currentUser.relatedId || s.parentPhone === currentUser.phone
    );
    setChildren(myChildren);

    if (selectedStudentId) {
      setSelectedChildId(selectedStudentId);
    } else if (myChildren.length === 1) {
      setSelectedChildId(myChildren[0].id);
    }
  }, [currentUser, selectedStudentId]);

  // Data helpers
  const attendanceRecords = storage.getAttendanceRecords();
  const sessions = storage.getSessions();
  const groups = storage.getGroups();
  const notifications = storage.getNotifications().filter(
    n => n.recipientPhone === currentUser.phone || n.recipientRole === 'parent'
  );

  // Calculate monthly stats for a child
  const getChildMonthlyStats = (studentId: string) => {
    const studentRecords = attendanceRecords.filter(a => a.studentId === studentId);
    const total = studentRecords.length;
    const present = studentRecords.filter(a => a.status === 'present').length;
    const absent = studentRecords.filter(a => a.status === 'absent').length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 100;

    // Today's status (PRT-01)
    const todaySessions = sessions.filter(s => s.date === todayStr);
    const todayRecord = studentRecords.find(a => todaySessions.some(ts => ts.id === a.sessionId));
    let todayStatus: 'present' | 'absent' | 'none' = 'none';
    if (todayRecord) {
      todayStatus = todayRecord.status === 'present' ? 'present' : 'absent';
    }

    return { total, present, absent, rate, todayStatus };
  };

  const displayedChildren = selectedChildId === 'all'
    ? children
    : children.filter(c => c.id === selectedChildId);

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 pb-24 space-y-6">
      {/* Top Child Selector if multiple children exist (PRT-06) */}
      {children.length > 1 && (
        <div className="bg-white rounded-2xl p-2.5 shadow-xs border border-slate-200 flex items-center justify-between gap-2 overflow-x-auto">
          <span className="text-xs font-bold text-slate-500 shrink-0 pr-2">اختر الابن:</span>
          <div className="flex items-center gap-1.5 flex-1">
            <button
              onClick={() => setSelectedChildId('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                selectedChildId === 'all'
                  ? 'bg-[#1F4E8C] text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              الكل ({children.length})
            </button>
            {children.map(child => (
              <button
                key={child.id}
                onClick={() => setSelectedChildId(child.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                  selectedChildId === child.id
                    ? 'bg-[#1F4E8C] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {child.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Tab 1: Children (أبنائي) */}
      {activeNav === 'children' && (
        <div className="space-y-6">
          {displayedChildren.map(child => {
            const stats = getChildMonthlyStats(child.id);
            const childRecords = attendanceRecords.filter(a => a.studentId === child.id);

            return (
              <div key={child.id} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                {/* Child Header Card (PRT-01) */}
                <div className="bg-gradient-to-l from-slate-50 to-blue-50/40 p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-[#1F4E8C] text-white flex items-center justify-center font-bold text-xl shadow-md shadow-blue-900/10">
                      {child.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">{child.name}</h2>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                          كود: {child.code}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">
                        {child.grade} • فصل {child.classNumber}
                      </p>
                    </div>
                  </div>

                  {/* Today's Status Badge & Rate (PRT-01) */}
                  <div className="flex items-center gap-3">
                    {/* Today's state */}
                    <div className="text-center sm:text-left">
                      <div className="text-[10px] text-slate-400 font-bold mb-0.5">حالة اليوم</div>
                      {stats.todayStatus === 'present' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>حاضر اليوم</span>
                        </span>
                      ) : stats.todayStatus === 'absent' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-xs font-bold animate-pulse">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>غائب اليوم</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                          <span>لا توجد حصص</span>
                        </span>
                      )}
                    </div>

                    {/* Attendance percentage gauge */}
                    <div className="bg-white border border-slate-200 p-2.5 rounded-2xl text-center min-w-[70px] shadow-2xs">
                      <span className="text-xs text-slate-400 block font-semibold">الحضور</span>
                      <strong className={`text-base font-extrabold ${stats.rate >= 85 ? 'text-emerald-600' : stats.rate >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                        {stats.rate}%
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Attendance Log (PRT-02) */}
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#1F4E8C]" />
                      <span>سجل الحضور الزمني للحصص الدراسية</span>
                    </h3>
                    <div className="text-xs text-slate-500">
                      حضور: <strong className="text-emerald-700">{stats.present}</strong> • غياب: <strong className="text-rose-700">{stats.absent}</strong>
                    </div>
                  </div>

                  {childRecords.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8">
                      لم يتم تسجيل حصص أو رصد حضور لهذا الطالب حتى الآن.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {childRecords.map(rec => {
                        const session = sessions.find(s => s.id === rec.sessionId);
                        const grp = session ? groups.find(g => g.id === session.groupId) : null;
                        const isPres = rec.status === 'present';

                        return (
                          <div
                            key={rec.id}
                            className={`p-3.5 rounded-2xl border flex items-center justify-between text-xs transition-colors ${
                              isPres
                                ? 'bg-emerald-50/40 border-emerald-200'
                                : 'bg-rose-50/70 border-rose-300'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
                                  isPres
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-rose-600 text-white animate-pulse'
                                }`}
                              >
                                {isPres ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-900">
                                  {grp?.subject || 'حصة دراسية'} ({grp?.name})
                                </h4>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {session ? formatArabicDate(session.date) : ''} • المعلم: {rec.recordedBy}
                                </p>
                                {rec.note && (
                                  <span className="text-[11px] text-rose-700 mt-1 block">
                                    ملاحظة: {rec.note}
                                  </span>
                                )}
                              </div>
                            </div>

                            <span
                              className={`font-bold px-3 py-1 rounded-full text-xs ${
                                isPres
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {isPres ? 'حاضر' : 'غائب'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Tab 2: Notifications (الإشعارات - PRT-04) */}
      {activeNav === 'notifications' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-bold text-slate-900">الإشعارات والتنبيهات المستلمة</h2>
              <p className="text-xs text-slate-500">سجل الإشعارات الفورية المرسلة لهاتفك</p>
            </div>
            <button
              onClick={() => {
                storage.markAllNotificationsAsRead(currentUser.phone);
                // Trigger refresh
                setChildren([...children]);
              }}
              className="text-xs font-bold text-[#1F4E8C] hover:underline"
            >
              تعيين الكل كمقروء
            </button>
          </div>

          <div className="space-y-3">
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">لا توجد إشعارات سابقة</p>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`p-4 rounded-2xl border text-xs text-right space-y-1 ${
                    n.type === 'absence' ? 'bg-rose-50/60 border-rose-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span className="flex items-center gap-1.5">
                      {n.type === 'absence' && <span className="w-2 h-2 rounded-full bg-rose-600" />}
                      {n.title}
                    </span>
                    <span className="text-[11px] text-slate-400 font-normal">
                      {formatArabicDate(n.createdAt)}
                    </span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">{n.body}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Tab 3: Account (حسابي - PRT-07) */}
      {activeNav === 'account' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-5">
          <div className="flex items-center gap-4 pb-4 border-b border-slate-200">
            <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xl">
              <User className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{currentUser.displayName}</h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">رقم الهاتف: {currentUser.phone}</p>
            </div>
          </div>

          <div className="space-y-3">
            {/* Install PWA Banner */}
            <PWAInstallButton variant="banner" />

            {/* Change Password */}
            <button
              onClick={() => setShowChangePass(true)}
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
              onClick={onLogout}
              className="w-full p-4 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold transition flex items-center justify-center gap-2"
            >
              <span>تسجيل الخروج من الحساب</span>
            </button>
          </div>
        </div>
      )}

      {/* Simplified Mobile Bottom Navigation (PRT-08: Exactly 3 tabs: أبنائي • الإشعارات • حسابي) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 py-2 px-6 shadow-lg no-print">
        <div className="max-w-md mx-auto flex items-center justify-around">
          <button
            onClick={() => setActiveNav('children')}
            className={`flex flex-col items-center gap-1 text-xs font-bold transition-colors ${
              activeNav === 'children' ? 'text-[#1F4E8C]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>أبنائي</span>
          </button>

          <button
            onClick={() => setActiveNav('notifications')}
            className={`flex flex-col items-center gap-1 text-xs font-bold relative transition-colors ${
              activeNav === 'notifications' ? 'text-[#1F4E8C]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Bell className="w-5 h-5" />
            {notifications.some(n => !n.isRead) && (
              <span className="w-2 h-2 rounded-full bg-rose-600 absolute -top-0.5 right-2" />
            )}
            <span>الإشعارات</span>
          </button>

          <button
            onClick={() => setActiveNav('account')}
            className={`flex flex-col items-center gap-1 text-xs font-bold transition-colors ${
              activeNav === 'account' ? 'text-[#1F4E8C]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <User className="w-5 h-5" />
            <span>حسابي</span>
          </button>
        </div>
      </nav>

      {/* Modals */}
      <ChangePasswordModal
        isOpen={showChangePass || showWelcomeModal}
        onClose={() => {
          setShowChangePass(false);
          setShowWelcomeModal(false);
        }}
        user={currentUser}
        onSuccess={() => {}}
        isMandatory={false}
      />
    </div>
  );
};
