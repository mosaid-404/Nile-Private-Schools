import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Users, CheckCircle2, AlertCircle, ArrowLeft, BookOpen, Search, UserCheck } from 'lucide-react';
import { User, SessionInstance, Group, ScheduleSlot, Student } from '../../types';
import { storage } from '../../services/storage';
import { formatArabicDate, formatArabicTime, getTodayDateString, ARABIC_DAYS } from '../../utils/arabic';
import { SessionAttendanceModal } from './SessionAttendanceModal';

interface Props {
  currentUser: User;
}

export const TeacherDashboard: React.FC<Props> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'quick_class' | 'today' | 'schedule' | 'groups'>('quick_class');
  const [selectedSession, setSelectedSession] = useState<SessionInstance | null>(null);
  const [todaySessions, setTodaySessions] = useState<SessionInstance[]>([]);
  const [teacherGroups, setTeacherGroups] = useState<Group[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Quick class attendance state
  const settings = storage.getSettings();
  const [selectedGrade, setSelectedGrade] = useState<string>(settings.grades[0] || '');
  const [selectedClassNumber, setSelectedClassNumber] = useState<number>(1);
  const [quickRecords, setQuickRecords] = useState<Record<string, 'present' | 'absent'>>({});
  const [quickSavedInfo, setQuickSavedInfo] = useState<{ present: number; absent: number; notified: number } | null>(null);

  const todayStr = getTodayDateString();

  const loadData = () => {
    // Find teacher record
    const teachers = storage.getTeachers();
    const teacher = teachers.find(t => t.userId === currentUser.id || t.id === currentUser.relatedId);
    const teacherId = teacher?.id || currentUser.relatedId || '';

    // Groups belonging to this teacher
    const groups = storage.getGroups().filter(g => g.teacherId === teacherId);
    setTeacherGroups(groups);

    // Today's sessions for these groups
    const sessions = storage.getOrCreateSessionsForDate(todayStr);
    const mySessions = sessions.filter(s => groups.some(g => g.id === s.groupId));
    setTodaySessions(mySessions);

    // Schedule slots
    const slots = storage.getScheduleSlots().filter(s => groups.some(g => g.id === s.groupId));
    setScheduleSlots(slots);

    // Students
    setAllStudents(storage.getStudents());
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const getGroupInfo = (groupId: string) => {
    return teacherGroups.find(g => g.id === groupId);
  };

  const getSlotInfo = (slotId: string) => {
    return scheduleSlots.find(s => s.id === slotId);
  };

  const currentTeacher = storage.getTeachers().find(
    t => t.userId === currentUser.id || t.id === currentUser.relatedId
  );

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6">
      {/* Teacher Welcome Header */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xl shadow-xs shrink-0">
            <UserCheck className="w-7 h-7" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-[#163A6B]">
                مرحباً بك، {currentUser.displayName}
              </h1>
              {currentTeacher?.subject && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                  تخصص: {currentTeacher.subject}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {formatArabicDate(todayStr)} • رصد الحضور ومتابعة المجموعات
            </p>
          </div>
        </div>

        {/* Quick Nav Tabs (ATT-02) */}
        <div className="grid grid-cols-2 sm:flex items-center bg-slate-100 p-1.5 rounded-2xl text-xs font-bold gap-1 w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('quick_class')}
            className={`px-2 sm:px-4 py-2.5 sm:py-2 rounded-xl transition-all text-center ${
              activeTab === 'quick_class'
                ? 'bg-[#1F4E8C] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            رصد حضور فصل
          </button>
          <button
            onClick={() => setActiveTab('today')}
            className={`px-2 sm:px-4 py-2.5 sm:py-2 rounded-xl transition-all text-center ${
              activeTab === 'today'
                ? 'bg-[#1F4E8C] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            حصص اليوم ({todaySessions.length})
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`px-2 sm:px-4 py-2.5 sm:py-2 rounded-xl transition-all text-center ${
              activeTab === 'schedule'
                ? 'bg-[#1F4E8C] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            الجدول
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-2 sm:px-4 py-2.5 sm:py-2 rounded-xl transition-all text-center ${
              activeTab === 'groups'
                ? 'bg-[#1F4E8C] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            مجموعاتي ({teacherGroups.length})
          </button>
        </div>
      </div>

      {/* Tab 0: Quick Class Attendance (Select Grade + Class -> Mark Present/Absent -> Confirm) */}
      {activeTab === 'quick_class' && (() => {
        const classStudents = allStudents.filter(
          s => s.status === 'active' && s.grade === selectedGrade && s.classNumber === selectedClassNumber
        );
        const availableClasses = Array.from(
          new Set(
            allStudents
              .filter(s => s.status === 'active' && s.grade === selectedGrade)
              .map(s => s.classNumber)
          )
        ).sort((a, b) => a - b);
        const classOptions = availableClasses.length > 0 ? availableClasses : [1, 2, 3, 4];

        const presentCount = classStudents.filter(s => (quickRecords[s.id] || 'present') === 'present').length;
        const absentCount = classStudents.filter(s => quickRecords[s.id] === 'absent').length;

        const handleConfirmQuickAttendance = () => {
          if (classStudents.length === 0) return;
          const sessionId = `quick_${todayStr}_${selectedGrade}_${selectedClassNumber}`;
          const finalItems = classStudents.map(s => ({
            studentId: s.id,
            status: (quickRecords[s.id] === 'absent' ? 'absent' : 'present') as 'present' | 'absent'
          }));
          const res = storage.recordAttendance(sessionId, finalItems, currentUser.displayName);
          setQuickSavedInfo({
            present: presentCount,
            absent: absentCount,
            notified: res.notifiedCount
          });
          loadData();
        };

        return (
          <div className="space-y-4">
            {/* Grade & Class Selector */}
            <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#1F4E8C]" />
                  <span>اختيار الصف والفصل لرصد الحضور</span>
                </h2>
                <span className="text-xs font-bold text-[#1F4E8C] bg-blue-50 px-3 py-1 rounded-full">
                  {classStudents.length} طالب
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">الصف الدراسي</label>
                  <select
                    value={selectedGrade}
                    onChange={(e) => {
                      setSelectedGrade(e.target.value);
                      setQuickRecords({});
                      setQuickSavedInfo(null);
                    }}
                    className="w-full px-3.5 py-2.5 text-sm font-bold rounded-xl border border-slate-300 bg-white outline-hidden focus:border-[#1F4E8C]"
                  >
                    {settings.grades.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">الفصل</label>
                  <div className="flex flex-wrap gap-2">
                    {classOptions.map(num => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => {
                          setSelectedClassNumber(num);
                          setQuickRecords({});
                          setQuickSavedInfo(null);
                        }}
                        className={`flex-1 min-w-[60px] py-2.5 px-3 rounded-xl text-xs font-bold border transition ${
                          selectedClassNumber === num
                            ? 'bg-[#1F4E8C] text-white border-[#1F4E8C] shadow-xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        فصل {num}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Success Banner */}
            {quickSavedInfo && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
                  <div className="text-xs sm:text-sm">
                    <strong className="text-emerald-900 block">تم تأكيد وحفظ حضور الفصل بنجاح!</strong>
                    <span className="text-emerald-700">
                      حاضر: {quickSavedInfo.present} • غائب: {quickSavedInfo.absent}
                      {quickSavedInfo.notified > 0 && ` • تم إرسال ${quickSavedInfo.notified} إشعار غياب لأولياء الأمور`}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Students List */}
            {classStudents.length === 0 ? (
              <div className="bg-white rounded-3xl p-10 text-center border border-slate-200">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="font-bold text-slate-800 text-base">لا يوجد طلاب مسجلون في هذا الفصل</h3>
                <p className="text-xs text-slate-500 mt-1">اختر صفاً أو فصلاً آخر لعرض قائمة الطلاب.</p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="text-xs font-bold text-slate-600">
                    الحضور: <span className="text-emerald-700">{presentCount}</span> • الغياب: <span className="text-rose-700">{absentCount}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const allPres: Record<string, 'present' | 'absent'> = {};
                      classStudents.forEach(s => { allPres[s.id] = 'present'; });
                      setQuickRecords(allPres);
                      setQuickSavedInfo(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold transition"
                  >
                    تحديد الكل حاضر
                  </button>
                </div>

                <div className="space-y-2.5">
                  {classStudents.map((student, idx) => {
                    const status = quickRecords[student.id] || 'present';
                    const isAbsent = status === 'absent';
                    return (
                      <div
                        key={student.id}
                        className={`p-3 sm:p-4 rounded-2xl border flex items-center justify-between gap-3 transition ${
                          isAbsent ? 'bg-rose-50/70 border-rose-200' : 'bg-slate-50/60 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-7 h-7 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-slate-900 truncate">{student.name}</h4>
                            <span className="text-[11px] text-slate-500 font-mono">{student.code}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setQuickRecords(prev => ({ ...prev, [student.id]: 'present' }));
                              setQuickSavedInfo(null);
                            }}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                              !isAbsent
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-emerald-50'
                            }`}
                          >
                            حاضر
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setQuickRecords(prev => ({ ...prev, [student.id]: 'absent' }));
                              setQuickSavedInfo(null);
                            }}
                            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                              isAbsent
                                ? 'bg-rose-600 text-white shadow-xs'
                                : 'bg-white text-slate-600 border border-slate-200 hover:bg-rose-50'
                            }`}
                          >
                            غائب
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleConfirmQuickAttendance}
                  className="w-full py-3.5 px-6 rounded-2xl bg-[#1F4E8C] hover:bg-[#163A6B] text-white font-bold text-sm shadow-lg shadow-blue-900/15 transition flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>تأكيد وحفظ الحضور ({classStudents.length} طالب)</span>
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Tab 1: Today's Sessions (ATT-01, ATT-03) */}
      {activeTab === 'today' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#1F4E8C]" />
              <span>جدول حصص اليوم ورصد الحضور</span>
            </h2>
            <span className="text-xs text-slate-500">
              اضغط على أي حصة لبدء رصد الحضور فوراً
            </span>
          </div>

          {todaySessions.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-200">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="font-bold text-slate-800 text-base">لا توجد حصص مجدولة لك اليوم</h3>
              <p className="text-xs text-slate-500 mt-1">
                يمكنك الاطلاع على جدولك الأسبوعي الكامل من التبويب بالأعلى.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {todaySessions.map((session) => {
                const group = getGroupInfo(session.groupId);
                const slot = getSlotInfo(session.scheduleSlotId);
                const isRecorded = session.status === 'recorded';
                const studentCount = group?.studentIds.length || 0;

                return (
                  <div
                    key={session.id}
                    onClick={() => setSelectedSession(session)}
                    className="bg-white rounded-3xl p-5 border border-slate-200 hover:border-[#1F4E8C] hover:shadow-lg transition-all cursor-pointer relative overflow-hidden group"
                  >
                    {/* Top Status Stripe */}
                    <div
                      className={`h-1.5 absolute top-0 left-0 right-0 ${
                        isRecorded ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                    />

                    {/* Subject & Status */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#1F4E8C]">
                          {group?.subject || 'مادة دراسية'}
                        </span>
                        <h3 className="font-extrabold text-base text-slate-900 mt-1.5 group-hover:text-[#1F4E8C] transition-colors">
                          {group?.name}
                        </h3>
                      </div>

                      {/* Status Badge (ATT-01) */}
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1 shrink-0 ${
                          isRecorded
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse'
                        }`}
                      >
                        {isRecorded ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>تم الرصد</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>لم تُصد</span>
                          </>
                        )}
                      </span>
                    </div>

                    {/* Time & Room */}
                    <div className="space-y-1.5 text-xs text-slate-600 mb-4 bg-slate-50 p-3 rounded-2xl">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-400" />
                        <span>
                          التوقيت: <strong>{slot?.startTime ? formatArabicTime(slot.startTime) : 'غير محدد'}</strong> - <strong>{slot?.endTime ? formatArabicTime(slot.endTime) : ''}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-400" />
                        <span>
                          عدد الطلاب المسجلين: <strong>{studentCount} طالب</strong>
                        </span>
                      </div>
                      {slot?.room && (
                        <div className="text-[11px] text-slate-500 pt-0.5 border-t border-slate-200">
                          القاعة / المعمل: {slot.room}
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Button */}
                    <button
                      type="button"
                      className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors ${
                        isRecorded
                          ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          : 'bg-[#1F4E8C] hover:bg-[#163A6B] text-white shadow-xs'
                      }`}
                    >
                      <span>{isRecorded ? 'مراجعة وتعديل الرصد' : 'ابدأ رصد الحضور الآن'}</span>
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Weekly Schedule (SCH-06, ATT-02) */}
      {activeTab === 'schedule' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">جدولي الأسبوعي</h2>
            <span className="text-xs text-slate-500">مواعيد الحصص الدورية طوال الأسبوع</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ARABIC_DAYS.map((dayName, dayIdx) => {
              const daySlots = scheduleSlots.filter(s => s.dayOfWeek === dayIdx);
              return (
                <div key={dayIdx} className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50">
                  <div className="font-bold text-sm text-[#1F4E8C] pb-2 border-b border-slate-200 flex justify-between">
                    <span>{dayName}</span>
                    <span className="text-xs bg-white px-2 py-0.5 rounded-full border border-slate-200 text-slate-600">
                      {daySlots.length} حصة
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {daySlots.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">لا توجد حصص</p>
                    ) : (
                      daySlots.map(slot => {
                        const grp = getGroupInfo(slot.groupId);
                        return (
                          <div key={slot.id} className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs space-y-1 shadow-2xs">
                            <div className="font-bold text-slate-900">{grp?.name}</div>
                            <div className="text-slate-500 flex justify-between text-[11px]">
                              <span>{formatArabicTime(slot.startTime)} - {formatArabicTime(slot.endTime)}</span>
                              <span>{slot.room || 'فصل اعتيادي'}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab 3: Groups & Student Rosters (ATT-02) */}
      {activeTab === 'groups' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">مجموعاتي وقوائم الطلاب</h2>
              <p className="text-xs text-slate-500">استعراض قوائم الطلاب المسجلين في كل مجموعة</p>
            </div>

            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث عن طالب بالاسم أو الكود..."
                className="px-3 py-2 pr-9 rounded-xl border border-slate-300 text-xs focus:border-[#1F4E8C] outline-hidden w-64"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {teacherGroups.map(grp => {
              const groupStudents = allStudents.filter(s => grp.studentIds.includes(s.id) && s.status === 'active');
              const filteredGroupStudents = groupStudents.filter(s =>
                s.name.includes(searchTerm) || s.code.includes(searchTerm)
              );

              return (
                <div key={grp.id} className="border border-slate-200 rounded-2xl p-4 bg-slate-50/40">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
                    <div>
                      <h3 className="font-bold text-sm text-slate-900">{grp.name}</h3>
                      <span className="text-[11px] text-slate-500">المادة: {grp.subject}</span>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-[#1F4E8C]">
                      {groupStudents.length} طالب
                    </span>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto divide-y divide-slate-100 pr-1">
                    {filteredGroupStudents.map((st, i) => (
                      <div key={st.id} className="pt-1.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span className="font-semibold text-slate-800">{st.name}</span>
                        </div>
                        <span className="font-mono text-[11px] text-slate-400">{st.code}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Session Attendance Modal */}
      {selectedSession && (
        <SessionAttendanceModal
          isOpen={true}
          session={selectedSession}
          currentUser={currentUser}
          onClose={() => setSelectedSession(null)}
          onSaved={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
};
