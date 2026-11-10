import React, { useState, useEffect } from 'react';
import { Check, X, Search, CheckCheck, AlertCircle, ArrowRight, Clock, Users, WifiOff } from 'lucide-react';
import { SessionInstance, Student, Group, AttendanceRecord, User } from '../../types';
import { storage } from '../../services/storage';
import { formatArabicDate, formatArabicTime } from '../../utils/arabic';
import { usePWA } from '../../hooks/usePWA';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  session: SessionInstance;
  currentUser: User;
  onSaved: () => void;
}

export const SessionAttendanceModal: React.FC<Props> = ({
  isOpen,
  onClose,
  session,
  currentUser,
  onSaved
}) => {
  const { isOnline, refreshOfflineQueueCount } = usePWA();
  const [students, setStudents] = useState<Student[]>([]);
  const [group, setGroup] = useState<Group | null>(null);
  const [records, setRecords] = useState<Record<string, { status: 'present' | 'absent' | 'unset'; note?: string }>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyAbsent, setShowOnlyAbsent] = useState(false);
  const [confirmUnsetModal, setConfirmUnsetModal] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ absentCount: number; notifiedCount: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const groups = storage.getGroups();
    const grp = groups.find(g => g.id === session.groupId) || null;
    setGroup(grp);

    const allStudents = storage.getStudents();
    const groupStudents = allStudents.filter(s => grp?.studentIds.includes(s.id) && s.status === 'active');
    
    // Sort alphabetically by Arabic name (ATT-04)
    groupStudents.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    setStudents(groupStudents);

    // Load existing records if previously recorded
    const existingAttendance = storage.getAttendanceRecords().filter(a => a.sessionId === session.id);
    const initialRecords: Record<string, { status: 'present' | 'absent' | 'unset'; note?: string }> = {};

    for (const student of groupStudents) {
      const match = existingAttendance.find(a => a.studentId === student.id);
      if (match) {
        initialRecords[student.id] = { status: match.status, note: match.note };
      } else {
        initialRecords[student.id] = { status: 'unset', note: '' };
      }
    }
    setRecords(initialRecords);
    setSuccessInfo(null);
  }, [isOpen, session]);

  if (!isOpen) return null;

  // Counters (ATT-06)
  const totalCount = students.length;
  const presentCount = Object.values(records).filter(r => r.status === 'present').length;
  const absentCount = Object.values(records).filter(r => r.status === 'absent').length;
  const unsetCount = totalCount - (presentCount + absentCount);

  // Set individual status
  const handleSetStatus = (studentId: string, status: 'present' | 'absent') => {
    setRecords(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status: prev[studentId]?.status === status ? 'unset' : status
      }
    }));
  };

  // Set note for absent student (ATT-10)
  const handleSetNote = (studentId: string, note: string) => {
    setRecords(prev => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        note
      }
    }));
  };

  // Mark all present in 1 click (ATT-05)
  const handleMarkAllPresent = () => {
    const updated: Record<string, { status: 'present' | 'absent' | 'unset'; note?: string }> = {};
    for (const s of students) {
      updated[s.id] = {
        status: 'present',
        note: ''
      };
    }
    setRecords(updated);
  };

  // Save handler
  const handleSaveClick = () => {
    if (unsetCount > 0) {
      setConfirmUnsetModal(true);
      return;
    }
    performSave();
  };

  const performSave = () => {
    // Fill unsets with present if confirmed
    const finalItems = students.map(s => {
      const current = records[s.id];
      const status: 'present' | 'absent' = current?.status === 'absent' ? 'absent' : 'present';
      return {
        studentId: s.id,
        status,
        note: current?.note
      };
    });

    if (isOnline) {
      const result = storage.recordAttendance(session.id, finalItems, currentUser.displayName);
      setSuccessInfo(result);
      onSaved();
    } else {
      // Offline queueing (ATT-15, SW-07)
      storage.queueOfflineAttendance({
        sessionId: session.id,
        records: finalItems,
        teacherId: currentUser.id,
        teacherName: currentUser.displayName
      });
      refreshOfflineQueueCount();
      setSuccessInfo({ absentCount, notifiedCount: 0 });
      onSaved();
    }
    setConfirmUnsetModal(false);
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.includes(searchTerm) || s.code.includes(searchTerm);
    const matchesAbsent = showOnlyAbsent ? records[s.id]?.status === 'absent' : true;
    return matchesSearch && matchesAbsent;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="bg-[#1F4E8C] text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-white transition-colors"
              title="رجوع"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg">رصد حضور الحصة</h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/20 font-semibold">
                  {group?.subject}
                </span>
              </div>
              <p className="text-xs text-blue-100 mt-0.5">
                {group?.name} • {formatArabicDate(session.date)}
              </p>
            </div>
          </div>

          {!isOnline && (
            <span className="flex items-center gap-1.5 text-xs bg-amber-500 text-white px-2.5 py-1 rounded-full font-bold shadow-xs">
              <WifiOff className="w-3.5 h-3.5" />
              <span>دون اتصال</span>
            </span>
          )}
        </div>

        {/* Live Counters & Quick Actions (ATT-05, ATT-06) */}
        <div className="bg-slate-50 p-3 sm:px-5 border-b border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            {/* Live Counters */}
            <div className="flex items-center gap-2 text-xs font-bold">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200">
                <Check className="w-3.5 h-3.5" />
                <span>حاضر: {presentCount}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-800 border border-rose-200">
                <X className="w-3.5 h-3.5" />
                <span>غائب: {absentCount}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-200 text-slate-700">
                <span>غير محدد: {unsetCount}</span>
              </div>
            </div>

            {/* Quick Mark All Present Button (ATT-05) */}
            <button
              onClick={handleMarkAllPresent}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1F4E8C] hover:bg-[#163A6B] text-white text-xs font-bold shadow-xs transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              <span>تحديد الكل حاضر بضغطة واحدة</span>
            </button>
          </div>

          {/* Search & Filter Bar (ATT-07) */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث سريع بالاسم أو كود الطالب..."
                className="w-full px-3 py-2 pr-9 rounded-xl border border-slate-300 text-xs focus:border-[#1F4E8C] outline-hidden"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>

            <button
              onClick={() => setShowOnlyAbsent(!showOnlyAbsent)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                showOnlyAbsent
                  ? 'bg-rose-600 text-white border-rose-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              الغائبون فقط ({absentCount})
            </button>
          </div>
        </div>

        {/* Success Alert Banner (ATT-09) */}
        {successInfo && (
          <div className="p-3 px-5 bg-emerald-50 border-b border-emerald-200 text-emerald-900 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 font-bold" />
              <span>
                تم حفظ رصد الحضور بنجاح!
                {isOnline
                  ? ` تم إرسال إشعار فوري لـ ${successInfo.notifiedCount} من أولياء أمور الغائبين.`
                  : ' سيتم إرسال إشعارات الغياب تلقائياً فور عودة اتصال الإنترنت.'}
              </span>
            </div>
            <button
              onClick={() => onClose()}
              className="px-3 py-1 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 text-xs"
            >
              تم
            </button>
          </div>
        )}

        {/* Students List (ATT-04: large cards, >=48px targets) */}
        <div className="p-3 sm:p-5 overflow-y-auto space-y-2.5 flex-1 divide-y divide-slate-100">
          {filteredStudents.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">لا يوجد طلاب مطابقين للبحث</p>
            </div>
          ) : (
            filteredStudents.map((student, idx) => {
              const current = records[student.id] || { status: 'unset' };
              const isPresent = current.status === 'present';
              const isAbsent = current.status === 'absent';

              return (
                <div
                  key={student.id}
                  className={`pt-2.5 pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-2xl p-2.5 transition-all ${
                    isPresent
                      ? 'bg-emerald-50/50 border border-emerald-200/60'
                      : isAbsent
                      ? 'bg-rose-50/50 border border-rose-200/60'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  {/* Student Details */}
                  <div className="flex items-center gap-3">
                    <span className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900">{student.name}</h4>
                      <p className="text-[11px] text-slate-500">
                        كود: <span className="font-mono font-semibold">{student.code}</span> • {student.grade} - فصل {student.classNumber}
                      </p>
                    </div>
                  </div>

                  {/* Attendance Action Buttons (>=48px touch friendly) */}
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {/* Absent Button */}
                    <button
                      type="button"
                      onClick={() => handleSetStatus(student.id, 'absent')}
                      className={`min-h-[48px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isAbsent
                          ? 'bg-rose-600 text-white shadow-md shadow-rose-600/20'
                          : 'bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-700'
                      }`}
                    >
                      <X className="w-4 h-4 font-bold" />
                      <span>غائب</span>
                    </button>

                    {/* Present Button */}
                    <button
                      type="button"
                      onClick={() => handleSetStatus(student.id, 'present')}
                      className={`min-h-[48px] px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                        isPresent
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                          : 'bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700'
                      }`}
                    >
                      <Check className="w-4 h-4 font-bold" />
                      <span>حاضر</span>
                    </button>
                  </div>

                  {/* Note Field shown when Absent (ATT-10) */}
                  {isAbsent && (
                    <div className="w-full sm:w-auto sm:basis-full pt-1.5">
                      <input
                        type="text"
                        value={current.note || ''}
                        onChange={(e) => handleSetNote(student.id, e.target.value)}
                        placeholder="سبب الغياب أو ملاحظة (مثال: استأذن مسبقاً)..."
                        className="w-full px-3 py-1.5 text-xs rounded-lg border border-rose-200 bg-white text-slate-700 placeholder:text-rose-300 outline-hidden"
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Action Footer (ATT-08) */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500 hidden sm:block">
            <span>إجمالي الطلاب: </span>
            <strong className="text-slate-800">{totalCount}</strong>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="py-3 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 font-semibold text-xs text-slate-700 transition"
            >
              إلغاء
            </button>

            <button
              onClick={handleSaveClick}
              className="flex-1 sm:flex-none min-h-[48px] py-3 px-8 rounded-xl bg-[#1F4E8C] hover:bg-[#163A6B] active:scale-98 text-white font-bold text-sm shadow-md shadow-blue-900/15 transition-all flex items-center justify-center gap-2"
            >
              <CheckCheck className="w-4 h-4" />
              <span>حفظ وإرسال التنبيهات</span>
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation modal for unset students (ATT-08) */}
      {confirmUnsetModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-right shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-900 text-center">
              تأكيد حفظ الحضور
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed text-center">
              يوجد <strong className="text-amber-700">{unsetCount} طالب</strong> لم تحدد حالتهم بعد.
              <br />
              هل تريد احتساب غير المحـددين <strong className="text-emerald-700">حاضرين تلقائياً</strong> وإتمام الحفظ؟
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={performSave}
                className="flex-1 py-2.5 bg-[#1F4E8C] text-white rounded-xl text-xs font-bold hover:bg-[#163A6B]"
              >
                نعم، احسبهم حاضرين واحفظ
              </button>
              <button
                onClick={() => setConfirmUnsetModal(false)}
                className="py-2.5 px-4 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-200"
              >
                العودة للتحديد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
