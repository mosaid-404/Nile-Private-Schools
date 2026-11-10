import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Calendar,
  CheckCircle,
  Clock,
  Megaphone,
  Bell,
  Send,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Shield,
  FileText,
  Settings,
  ChevronLeft,
  AlertCircle,
  Menu,
  X
} from 'lucide-react';
import { User, Student, Teacher, SchoolClass, Group, SessionInstance, AttendanceRecord } from '../../types';
import { storage } from '../../services/storage';
import { formatArabicDate, getTodayDateString } from '../../utils/arabic';
import { StudentManagement } from './StudentManagement';
import { TeacherManagement } from './TeacherManagement';
import { ClassAndScheduleManagement } from './ClassAndScheduleManagement';
import { AttendanceMonitoring } from './AttendanceMonitoring';
import { BroadcastNotificationCenter } from './BroadcastNotificationCenter';
import { ReportsView } from './ReportsView';
import { UserManagement } from './UserManagement';
import { SettingsView } from './SettingsView';

interface Props {
  currentUser: User;
}

export const OwnerDashboard: React.FC<Props> = ({ currentUser }) => {
  const [activeSection, setActiveSection] = useState<
    'dashboard' | 'students' | 'teachers' | 'schedule' | 'attendance' | 'broadcast' | 'reports' | 'users' | 'settings'
  >('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const todayStr = getTodayDateString();

  // Load live data
  const students = storage.getStudents();
  const teachers = storage.getTeachers();
  const parents = storage.getParents();
  const classes = storage.getClasses();
  const groups = storage.getGroups();
  const sessions = storage.getOrCreateSessionsForDate(todayStr);
  const attendance = storage.getAttendanceRecords();
  const invoices = storage.getInvoices();
  const receipts = storage.getReceipts();
  const settings = storage.getSettings();

  // Metrics (OWN-01)
  const activeStudents = students.filter(s => s.status === 'active');
  const activeTeachers = teachers.filter(t => t.status === 'active');

  const todaySessionIds = sessions.map(s => s.id);
  const todayAttendance = attendance.filter(a => todaySessionIds.includes(a.sessionId));
  const todayPresent = todayAttendance.filter(a => a.status === 'present').length;
  const todayAbsent = todayAttendance.filter(a => a.status === 'absent').length;
  const todayTotalAttendance = todayPresent + todayAbsent;
  const todayAttendanceRate = todayTotalAttendance > 0
    ? Math.round((todayPresent / todayTotalAttendance) * 100)
    : 100;

  const currentMonthPrefix = todayStr.substring(0, 7);
  const monthReceipts = receipts.filter(r => r.date.startsWith(currentMonthPrefix) && r.status === 'valid');
  const unrecordedTodaySessions = sessions.filter(s => s.status !== 'recorded');
  const broadcasts = storage.getBroadcasts();

  // Students exceeding absence threshold (OWN-04)
  const chronicAbsentStudents = students.filter(st => {
    const abs = attendance.filter(a => a.studentId === st.id && a.status === 'absent').length;
    return abs >= settings.absenceThreshold;
  });

  // Nav Items
  const navItems = [
    { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
    { id: 'students', label: 'الطلاب', icon: Users, badge: activeStudents.length },
    { id: 'teachers', label: 'المعلمون', icon: GraduationCap, badge: activeTeachers.length },
    { id: 'schedule', label: 'الفصول والجدول', icon: Calendar },
    { id: 'attendance', label: 'الحضور والغياب', icon: CheckCircle, badge: unrecordedTodaySessions.length > 0 ? unrecordedTodaySessions.length : undefined },
    { id: 'broadcast', label: 'إرسال الإشعارات والرسائل', icon: Megaphone, badge: broadcasts.length > 0 ? broadcasts.length : undefined },
    { id: 'reports', label: 'التقارير والإحصائيات', icon: FileText },
    { id: 'users', label: 'المستخدمون والتدقيق', icon: Shield },
    { id: 'settings', label: 'الإعدادات', icon: Settings }
  ];

  const activeNavLabel = navItems.find(item => item.id === activeSection)?.label || 'لوحة التحكم';

  const renderNavButtons = (isMobile = false) => (
    <div className="space-y-1.5">
      {navItems.map(item => {
        const Icon = item.icon;
        const isActive = activeSection === item.id;
        return (
          <button
            key={item.id}
            onClick={() => {
              setActiveSection(item.id as any);
              if (isMobile) setMobileSidebarOpen(false);
            }}
            className={`w-full flex items-center justify-between gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-right ${
              isActive
                ? 'bg-white text-[#1F4E8C] shadow-md'
                : 'text-blue-100 hover:text-white hover:bg-white/10'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#1F4E8C]' : 'text-blue-200'}`} />
              <span className="truncate">{item.label}</span>
            </div>
            {item.badge !== undefined && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                  isActive ? 'bg-[#1F4E8C]/10 text-[#1F4E8C]' : 'bg-white/20 text-white'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6">
      {/* Mobile Sidebar Toggle Bar */}
      <div className="lg:hidden mb-4 flex items-center justify-between bg-[#1F4E8C] text-white p-3 rounded-2xl shadow-sm no-print">
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="flex items-center gap-2 text-xs font-bold bg-white/15 hover:bg-white/25 px-3 py-2 rounded-xl transition"
        >
          <Menu className="w-4 h-4" />
          <span>القائمة</span>
        </button>
        <span className="text-xs font-bold">{activeNavLabel}</span>
      </div>

      {/* Mobile Drawer */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <aside className="relative z-10 w-72 max-w-[85vw] bg-gradient-to-b from-[#1F4E8C] to-[#163A6B] text-white p-4 flex flex-col h-full shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/15">
              <div>
                <h2 className="text-sm font-extrabold">القائمة الرئيسية</h2>
                <p className="text-[11px] text-blue-200">{settings.schoolName}</p>
              </div>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1">{renderNavButtons(true)}</div>
          </aside>
        </div>
      )}

      <div className="flex flex-col lg:flex-row items-start gap-6">
        {/* Desktop Blue Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-gradient-to-b from-[#1F4E8C] to-[#163A6B] text-white rounded-3xl p-4 shadow-lg sticky top-20 no-print">
          <div className="px-2 pb-3 mb-3 border-b border-white/15">
            <p className="text-[11px] font-bold text-blue-200">لوحة الإدارة</p>
            <h2 className="text-sm font-extrabold truncate mt-0.5">{settings.schoolName}</h2>
          </div>
          {renderNavButtons(false)}
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 min-w-0 w-full space-y-6">

      {/* Main Dashboard Section (OWN-01, OWN-02, OWN-03, OWN-04) */}
      {activeSection === 'dashboard' && (
        <div className="space-y-6">
          {/* Welcome Banner */}
          <div className="bg-gradient-to-l from-[#1F4E8C] to-[#163A6B] text-white rounded-3xl p-6 sm:p-8 shadow-md relative overflow-hidden">
            <div className="relative z-10 space-y-2">
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-white/15 text-blue-100">
                لوحة المالك / الإدارة العامة
              </span>
              <h1 className="text-xl sm:text-3xl font-extrabold">
                {settings.schoolName}
              </h1>
              <p className="text-xs sm:text-sm text-blue-100 max-w-xl">
                العام الدراسي {settings.academicYear} • تاريخ اليوم: {formatArabicDate(todayStr)}
              </p>
            </div>
            {/* Background design accents */}
            <div className="absolute left-6 -bottom-6 w-44 h-44 rounded-full bg-white/5 pointer-events-none" />
          </div>

          {/* KPI Indicators Cards (OWN-01) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
            {/* Active Students */}
            <div
              onClick={() => setActiveSection('students')}
              className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs hover:border-[#1F4E8C] transition cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold text-slate-600">الطلاب النشطون</span>
                <Users className="w-4 h-4 text-[#1F4E8C]" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900">
                {activeStudents.length}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">من إجمالي {students.length} طالب</p>
            </div>

            {/* Teachers */}
            <div
              onClick={() => setActiveSection('teachers')}
              className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs hover:border-[#1F4E8C] transition cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold text-slate-600">المعلمون</span>
                <GraduationCap className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-700">
                {activeTeachers.length}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">هيئة التدريس</p>
            </div>

            {/* Today Attendance Rate */}
            <div
              onClick={() => setActiveSection('attendance')}
              className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs hover:border-[#1F4E8C] transition cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold text-slate-600">حضور اليوم</span>
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-700">
                {todayAttendanceRate}%
              </div>
              <p className="text-[10px] text-slate-400 mt-1">{todayPresent} حاضر • {todayAbsent} غائب</p>
            </div>

            {/* Send Quick Broadcast */}
            <div
              onClick={() => setActiveSection('broadcast')}
              className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs hover:border-[#1F4E8C] transition cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold text-slate-600">إرسال إشعار فوري</span>
                <Megaphone className="w-4 h-4 text-[#1F4E8C]" />
              </div>
              <div className="text-base sm:text-lg font-black text-[#1F4E8C]">
                إرسال رسالة
              </div>
              <p className="text-[10px] text-blue-600 font-bold mt-1">تحديد المستلمين والصفوف ←</p>
            </div>

            {/* Total Broadcasts Sent */}
            <div
              onClick={() => setActiveSection('broadcast')}
              className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-2xs hover:border-[#1F4E8C] transition cursor-pointer col-span-2 sm:col-span-1"
            >
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-bold text-slate-600">سجل الإشعارات الصادرة</span>
                <Bell className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-purple-700">
                {broadcasts.length}
              </div>
              <p className="text-[10px] text-slate-400 mt-1">إشعار جماعي مرسل</p>
            </div>
          </div>

          {/* Admin Alerts (OWN-04) */}
          {(chronicAbsentStudents.length > 0 || unrecordedTodaySessions.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Unrecorded Sessions Alert */}
              {unrecordedTodaySessions.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">حصص اليوم بانتظار الرصد</h4>
                      <p className="text-[11px] text-amber-700 mt-0.5">
                        يوجد {unrecordedTodaySessions.length} حصة لم يقم المعلم برصد حضورها بعد.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveSection('attendance')}
                    className="text-xs font-bold text-amber-900 underline shrink-0 mr-2"
                  >
                    متابعة
                  </button>
                </div>
              )}

              {/* Chronic Absence Alert */}
              {chronicAbsentStudents.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-rose-900">تنبيه غياب متكرر</h4>
                      <p className="text-[11px] text-rose-700 mt-0.5">
                        {chronicAbsentStudents.length} طلاب تجاوزوا حد الغياب الشهري ({settings.absenceThreshold} غيابات).
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveSection('reports')}
                    className="text-xs font-bold text-rose-900 underline shrink-0 mr-2"
                  >
                    تقرير
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Today's Sessions Live Monitor (OWN-03) */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-base text-slate-900">مراقبة حصص اليوم وانضباط الرصد</h3>
                <p className="text-xs text-slate-500">متابعة فورية للحصص التي تم رصدها والتي لم تُرصد</p>
              </div>
              <button
                onClick={() => setActiveSection('attendance')}
                className="text-xs font-bold text-[#1F4E8C] hover:underline"
              >
                فتح شاشة المراقبة الكاملة ←
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {sessions.map(s => {
                const grp = groups.find(g => g.id === s.groupId);
                const tch = teachers.find(t => t.id === grp?.teacherId);
                const isRecorded = s.status === 'recorded';

                return (
                  <div
                    key={s.id}
                    className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs"
                  >
                    <div>
                      <strong className="text-slate-900 block">{grp?.name}</strong>
                      <span className="text-slate-500">{grp?.subject} • المعلم: {tch?.name}</span>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isRecorded
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {isRecorded ? 'تم الرصد' : 'لم تُصد'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Render Subsections */}
      {activeSection === 'students' && <StudentManagement />}
      {activeSection === 'teachers' && <TeacherManagement />}
      {activeSection === 'schedule' && <ClassAndScheduleManagement />}
      {activeSection === 'attendance' && <AttendanceMonitoring currentUser={currentUser} />}
      {activeSection === 'broadcast' && <BroadcastNotificationCenter currentUser={currentUser} />}
      {activeSection === 'reports' && <ReportsView />}
      {activeSection === 'users' && <UserManagement />}
      {activeSection === 'settings' && <SettingsView />}
        </div>
      </div>
    </div>
  );
};
