import React, { useState, useEffect } from 'react';
import { Users, Bell, CheckCircle2, XCircle, Calendar, Clock, Sparkles, MapPin, BookOpen, Settings, FileText } from 'lucide-react';
import { User as UserType, Student } from '../../types';
import { storage } from '../../services/storage';
import { formatArabicDate, formatArabicTime, getTodayDateString } from '../../utils/arabic';
import { ChangePasswordModal } from '../common/ChangePasswordModal';
import { ParentSettingsContent } from './ParentSettingsModal';
import { ParentReportsView } from './ParentReportsView';

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
  const [activeNav, setActiveNav] = useState<'children' | 'tutoring' | 'reports' | 'notifications' | 'settings'>('children');
  const [children, setChildren] = useState<Student[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string>('all');
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showChangePass, setShowChangePass] = useState(false);
  const [, setSyncTick] = useState(0);

  const todayStr = getTodayDateString();

  const loadParentChildren = () => {
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
    setSyncTick(t => t + 1);
  };

  useEffect(() => {
    if (currentUser.mustChangePassword) {
      setShowWelcomeModal(true);
    }

    loadParentChildren();

    const onCloudSync = () => loadParentChildren();
    window.addEventListener('nps_cloud_sync', onCloudSync);
    return () => window.removeEventListener('nps_cloud_sync', onCloudSync);
  }, [currentUser, selectedStudentId]);

  // Data helpers
  const attendanceRecords = storage.getAttendanceRecords();
  const sessions = storage.getSessions();
  const groups = storage.getGroups();
  const teachers = storage.getTeachers();
  const tutoringGroups = storage.getTutoringGroups();
  const parentPref = storage.getParentNotificationPref(currentUser.relatedId, currentUser.phone);
  const notifications = storage.getNotifications().filter(n => {
    if (!storage.shouldDeliverAttendanceNotif(parentPref, n.type)) return false;
    return n.recipientUserId
      ? n.recipientUserId === currentUser.id
      : n.recipientPhone === currentUser.phone;
  });

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

  const parentTutoringGroups = tutoringGroups
    .filter(tg => tg.studentIds.some(id => displayedChildren.some(c => c.id === id)))
    .sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      return cmp !== 0 ? cmp : b.startTime.localeCompare(a.startTime);
    });

  const upcomingTutoringCount = tutoringGroups.filter(
    tg => tg.date >= todayStr && tg.studentIds.some(id => children.some(c => c.id === id))
  ).length;

  const matchedParent = storage.getParents().find(
    p =>
      p.userId === currentUser.id ||
      p.id === currentUser.relatedId ||
      (currentUser.phone && p.phone === currentUser.phone)
  );
  const resolvedParentName = matchedParent?.displayName || currentUser.displayName || currentUser.username;

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-6 py-6 pb-24 space-y-6">
      {/* Parent Welcome Header */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-xs border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base sm:text-lg font-extrabold text-[#163A6B] leading-snug">
            مرحباً بك، {resolvedParentName}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {formatArabicDate(todayStr)} • متابعة حضور الأبناء والإشعارات
          </p>
        </div>
        <span className="self-start sm:self-center text-[11px] font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/70 shrink-0">
          حساب ولي الأمر
        </span>
      </div>

      {/* Top Child Selector in grid boxes if multiple children exist */}
      {children.length > 1 && activeNav !== 'reports' && (
        <div className="bg-white rounded-2xl p-3 shadow-xs border border-slate-200 space-y-2">
          <span className="text-xs font-bold text-slate-500 block">اختر الابن:</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            <button
              onClick={() => setSelectedChildId('all')}
              className={`p-2.5 rounded-xl text-xs font-bold text-center border transition-all ${
                selectedChildId === 'all'
                  ? 'bg-[#1F4E8C] text-white border-[#1F4E8C] shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              الكل ({children.length})
            </button>
            {children.map(child => (
              <button
                key={child.id}
                onClick={() => setSelectedChildId(child.id)}
                className={`p-2.5 rounded-xl text-xs font-bold text-center border leading-snug transition-all ${
                  selectedChildId === child.id
                    ? 'bg-[#1F4E8C] text-white border-[#1F4E8C] shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
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
            const childRecords = attendanceRecords
              .filter(a => a.studentId === child.id)
              .slice()
              .sort((a, b) => {
                const dateA = a.sessionDate || a.recordedAt.substring(0, 10);
                const dateB = b.sessionDate || b.recordedAt.substring(0, 10);
                const dateCmp = dateB.localeCompare(dateA);
                if (dateCmp !== 0) return dateCmp;
                return a.recordedAt.localeCompare(b.recordedAt);
              });

            return (
              <div key={child.id} className="bg-white rounded-3xl shadow-md shadow-slate-200/60 border border-slate-200/80 overflow-hidden">
                {/* Child Header Card (PRT-01) */}
                <div className="bg-gradient-to-l from-[#1F4E8C] to-[#163A6B] text-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-xs border border-white/20 text-white flex items-center justify-center font-extrabold text-xl shadow-inner shrink-0">
                      {child.name.charAt(0)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg sm:text-xl font-extrabold text-white">{child.name}</h2>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-white/20 text-blue-50">
                          كود: {child.code}
                        </span>
                      </div>
                      <p className="text-xs text-blue-100 mt-1 font-medium">
                        {child.grade} • فصل {child.classNumber}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Quick Summary Strip */}
                <div className="grid grid-cols-3 divide-x divide-x-reverse divide-slate-100 bg-slate-50/70 border-b border-slate-100 text-center py-3">
                  <div>
                    <span className="text-[11px] text-slate-500 block">إجمالي الحصص</span>
                    <strong className="text-sm font-extrabold text-slate-800">{stats.total}</strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-emerald-700 block">حصص الحضور</span>
                    <strong className="text-sm font-extrabold text-emerald-700">{stats.present}</strong>
                  </div>
                  <div>
                    <span className="text-[11px] text-rose-700 block">حصص الغياب</span>
                    <strong className="text-sm font-extrabold text-rose-700">{stats.absent}</strong>
                  </div>
                </div>

                {/* Attendance Log (PRT-02) */}
                <div className="p-4 sm:p-5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#1F4E8C]" />
                      <span>سجل الحضور الزمني للحصص الدراسية</span>
                    </h3>
                    {childRecords.length > 0 && (
                      <span className="text-[11px] font-bold text-slate-500">
                        {childRecords.length} حصة مسجلة
                      </span>
                    )}
                  </div>

                  {childRecords.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-8 bg-slate-50 rounded-2xl">
                      لم يتم تسجيل حصص أو رصد حضور لهذا الطالب حتى الآن.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {childRecords.map((rec, idx) => {
                        const session = sessions.find(s => s.id === rec.sessionId);
                        const grp = session ? groups.find(g => g.id === session.groupId) : null;
                        const tch = teachers.find(t => t.id === grp?.teacherId || t.name === rec.recordedBy);
                        const isPres = rec.status === 'present';
                        const subjectTitle = rec.subjectName || grp?.subject || tch?.subject || 'حصة دراسية';
                        const sessionSubLabel = rec.sessionLabel || grp?.name;
                        const displayDate = rec.sessionDate || session?.date || rec.recordedAt;
                        const displayTime = rec.recordedAt
                          ? new Date(rec.recordedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
                          : '';

                        return (
                          <div
                            key={rec.id}
                            className={`p-3.5 rounded-2xl border flex items-center justify-between gap-2 text-xs transition-colors ${
                              isPres
                                ? 'bg-emerald-50/40 border-emerald-200'
                                : 'bg-rose-50/70 border-rose-300'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                                  isPres
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-rose-600 text-white'
                                }`}
                              >
                                {isPres ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600">
                                    #{idx + 1}
                                  </span>
                                  <h4 className="font-bold text-slate-900">
                                    {subjectTitle} {sessionSubLabel && sessionSubLabel !== subjectTitle ? `(${sessionSubLabel})` : ''}
                                  </h4>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  {formatArabicDate(displayDate)}
                                  {displayTime ? ` • ${displayTime}` : ''} • المعلم: {rec.recordedBy}
                                  {tch?.subject && !subjectTitle.includes(tch.subject) ? ` (${tch.subject})` : ''}
                                </p>
                                {rec.note && (
                                  <span className="text-[11px] text-rose-700 mt-1 block">
                                    ملاحظة: {rec.note}
                                  </span>
                                )}
                              </div>
                            </div>

                            <span
                              className={`font-bold px-3 py-1 rounded-full text-xs shrink-0 ${
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

      {/* Main Tab 2: Tutoring Groups (مجموعات التقوية والفصول الخاصة - قسم منفصل) */}
      {activeNav === 'tutoring' && (
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900">مجموعات التقوية والفصول الإضافية</h2>
                <p className="text-xs text-slate-500">مواعيد مجموعات التقوية المحددة لأبنائك باليوم والوقت والمعلم</p>
              </div>
            </div>
            <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              {parentTutoringGroups.length} مجموعة
            </span>
          </div>

          {parentTutoringGroups.length === 0 ? (
            <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700 text-sm">لا توجد مجموعات تقوية مسجلة لأبنائك حالياً</p>
              <p className="text-xs text-slate-500">سيصلك إشعار فوري فور إضافة أي مجموعة تقوية جديدة.</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              {parentTutoringGroups.map(tg => {
                const tch = teachers.find(t => t.id === tg.teacherId);
                const enrolledKids = displayedChildren.filter(c => tg.studentIds.includes(c.id));
                const isToday = tg.date === todayStr;
                const isUpcoming = tg.date > todayStr;

                return (
                  <div
                    key={tg.id}
                    className={`p-4 sm:p-5 rounded-2xl border space-y-3 transition ${
                      isToday
                        ? 'bg-amber-50/50 border-amber-300 shadow-xs'
                        : isUpcoming
                        ? 'bg-blue-50/30 border-blue-200'
                        : 'bg-slate-50/60 border-slate-200'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                            {tg.subject}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                              isToday
                                ? 'bg-emerald-600 text-white'
                                : isUpcoming
                                ? 'bg-[#1F4E8C] text-white'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {isToday ? 'اليوم' : isUpcoming ? 'قادم' : 'موعد سابق'}
                          </span>
                        </div>
                        <h3 className="font-extrabold text-base text-slate-900 mt-1.5">{tg.title}</h3>
                      </div>

                      <div className="text-left text-xs font-bold text-[#1F4E8C] bg-white px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-amber-600" />
                        <span>{formatArabicDate(tg.date)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs bg-white p-3.5 rounded-xl border border-slate-200 text-slate-700">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-[#1F4E8C] shrink-0" />
                        <span>
                          الوقت:{' '}
                          <strong className="text-slate-900 font-mono">
                            {formatArabicTime(tg.startTime)} - {formatArabicTime(tg.endTime)}
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          المعلم:{' '}
                          <strong className="text-slate-900">
                            {tch ? `${tch.name} (${tch.subject})` : 'غير محدد'}
                          </strong>
                        </span>
                      </div>

                      {tg.room && (
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>
                            المكان / القاعة: <strong className="text-slate-900">{tg.room}</strong>
                          </span>
                        </div>
                      )}

                      {tg.notes && (
                        <div className="sm:col-span-2 pt-1.5 border-t border-slate-100 text-[11px] text-slate-600">
                          <strong>ملاحظات الإدارة:</strong> {tg.notes}
                        </div>
                      )}
                    </div>

                    {/* Enrolled Children Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-bold text-slate-500">الأبناء المسجلون:</span>
                      {enrolledKids.map(kid => (
                        <span
                          key={kid.id}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-white border border-slate-200 text-slate-800"
                        >
                          {kid.name} ({kid.grade} - {kid.classNumber})
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main Tab 3: Notifications (الإشعارات - PRT-04) */}
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
                setSyncTick(t => t + 1);
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
                    n.type === 'absence'
                      ? 'bg-rose-50/60 border-rose-200'
                      : n.type === 'presence'
                      ? 'bg-emerald-50/60 border-emerald-200'
                      : n.type === 'departure'
                      ? 'bg-indigo-50/60 border-indigo-200'
                      : n.type === 'tutoring'
                      ? 'bg-amber-50/60 border-amber-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold text-slate-900">
                    <span className="flex items-center gap-1.5">
                      {n.type === 'absence' && <span className="w-2 h-2 rounded-full bg-rose-600" />}
                      {n.type === 'presence' && <span className="w-2 h-2 rounded-full bg-emerald-600" />}
                      {n.type === 'departure' && <span className="w-2 h-2 rounded-full bg-indigo-600" />}
                      {n.type === 'tutoring' && <span className="w-2 h-2 rounded-full bg-amber-600" />}
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

      {/* Main Tab 3: Reports (التقارير - غياب كل ابن أو كل الأبناء) */}
      {activeNav === 'reports' && (
        <ParentReportsView
          parentName={resolvedParentName}
          childrenList={children}
          attendanceRecords={attendanceRecords}
          sessions={sessions}
          groups={groups}
          teachers={teachers}
        />
      )}

      {/* Main Tab 4: Settings (الإعدادات - ترس الإعدادات) */}
      {activeNav === 'settings' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200">
          <ParentSettingsContent
            currentUser={currentUser}
            onOpenChangePassword={() => setShowChangePass(true)}
            onLogout={onLogout}
          />
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 py-2 px-2 shadow-lg no-print">
        <div className="max-w-xl mx-auto flex items-center justify-around">
          <button
            onClick={() => setActiveNav('children')}
            className={`flex flex-col items-center gap-1 text-[11px] font-bold transition-colors ${
              activeNav === 'children' ? 'text-[#1F4E8C]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>أبنائي</span>
          </button>

          <button
            onClick={() => setActiveNav('reports')}
            className={`flex flex-col items-center gap-1 text-[11px] font-bold transition-colors ${
              activeNav === 'reports' ? 'text-[#1F4E8C]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span>التقارير</span>
          </button>

          <button
            onClick={() => setActiveNav('tutoring')}
            className={`flex flex-col items-center gap-1 text-[11px] font-bold relative transition-colors ${
              activeNav === 'tutoring' ? 'text-amber-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Sparkles className="w-5 h-5" />
            {upcomingTutoringCount > 0 && (
              <span className="min-w-[16px] h-4 px-1 rounded-full bg-amber-600 text-white text-[9px] font-extrabold flex items-center justify-center absolute -top-1 right-0">
                {upcomingTutoringCount}
              </span>
            )}
            <span>التقوية</span>
          </button>

          <button
            onClick={() => setActiveNav('notifications')}
            className={`flex flex-col items-center gap-1 text-[11px] font-bold relative transition-colors ${
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
            onClick={() => setActiveNav('settings')}
            className={`flex flex-col items-center gap-1 text-[11px] font-bold transition-colors ${
              activeNav === 'settings' ? 'text-[#1F4E8C]' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span>الإعدادات</span>
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
