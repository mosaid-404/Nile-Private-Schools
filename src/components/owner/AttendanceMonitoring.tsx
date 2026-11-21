import React, { useState, useMemo } from 'react';
import {
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  Search,
  Filter,
  Eye,
  Check
} from 'lucide-react';
import { SessionInstance, Group, Teacher, ScheduleSlot, User } from '../../types';
import { storage } from '../../services/storage';
import { formatArabicDate, formatArabicTime, getTodayDateString } from '../../utils/arabic';
import { SessionAttendanceModal } from '../teacher/SessionAttendanceModal';

interface Props {
  currentUser: User;
}

export const AttendanceMonitoring: React.FC<Props> = ({ currentUser }) => {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateString());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'recorded' | 'unrecorded'>('all');
  const [selectedSession, setSelectedSession] = useState<SessionInstance | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const {
    sessions,
    groupById,
    teacherById,
    slotById,
    sessionStatsById,
    recordedCount,
    unrecordedCount,
    filteredSessions
  } = useMemo(() => {
    const groups = storage.getGroups();
    const teachers = storage.getTeachers();
    const slots = storage.getScheduleSlots();
    const sessionsList = storage.getOrCreateSessionsForDate(selectedDate);
    const attendance = storage.getAttendanceRecords();

    const gMap = new Map<string, Group>();
    for (let i = 0; i < groups.length; i++) gMap.set(groups[i].id, groups[i]);

    const tMap = new Map<string, Teacher>();
    for (let i = 0; i < teachers.length; i++) tMap.set(teachers[i].id, teachers[i]);

    const sMap = new Map<string, ScheduleSlot>();
    for (let i = 0; i < slots.length; i++) sMap.set(slots[i].id, slots[i]);

    const sessionIdsSet = new Set<string>(sessionsList.map(s => s.id));
    const statsMap = new Map<string, { present: number; absent: number }>();
    for (let i = 0; i < attendance.length; i++) {
      const rec = attendance[i];
      if (!sessionIdsSet.has(rec.sessionId)) continue;
      let st = statsMap.get(rec.sessionId);
      if (!st) {
        st = { present: 0, absent: 0 };
        statsMap.set(rec.sessionId, st);
      }
      if (rec.status === 'present') st.present++;
      else if (rec.status === 'absent') st.absent++;
    }

    let recCount = 0;
    const q = searchTerm.trim().toLowerCase();
    const filtered: SessionInstance[] = [];
    for (let i = 0; i < sessionsList.length; i++) {
      const s = sessionsList[i];
      if (s.status === 'recorded') recCount++;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'recorded' && s.status === 'recorded') ||
        (statusFilter === 'unrecorded' && s.status !== 'recorded');
      if (!matchesStatus) continue;

      if (!q) {
        filtered.push(s);
        continue;
      }
      const grp = gMap.get(s.groupId);
      const tch = grp ? tMap.get(grp.teacherId) : undefined;
      if (
        (grp && (grp.name.toLowerCase().includes(q) || grp.subject.toLowerCase().includes(q))) ||
        (tch && tch.name.toLowerCase().includes(q))
      ) {
        filtered.push(s);
      }
    }

    return {
      sessions: sessionsList,
      groupById: gMap,
      teacherById: tMap,
      slotById: sMap,
      sessionStatsById: statsMap,
      recordedCount: recCount,
      unrecordedCount: sessionsList.length - recCount,
      filteredSessions: filtered
    };
  }, [selectedDate, searchTerm, statusFilter, refreshTick]);

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">مراقبة ورصد الحضور والغياب</h2>
          <p className="text-xs text-slate-500">
            متابعة دقيقة لحصص اليوم ورصد المعلمين مع إمكانية التعديل بأثر رجعي
          </p>
        </div>

        {/* Date Picker */}
        <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-slate-200">
          <Calendar className="w-4 h-4 text-slate-500 mr-1" />
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs font-mono font-bold text-slate-800 outline-hidden bg-transparent"
          />
        </div>
      </div>

      {/* Live Status Cards (OWN-03) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-bold text-slate-500 block mb-1">إجمالي الحصص المجدولة</span>
          <strong className="text-xl font-black text-slate-900">{sessions.length} حصة</strong>
        </div>

        <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200 shadow-2xs">
          <span className="text-xs font-bold text-emerald-800 block mb-1">حصص تم رصدها</span>
          <strong className="text-xl font-black text-emerald-700">{recordedCount} حصة</strong>
        </div>

        <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200 shadow-2xs col-span-2 sm:col-span-1">
          <span className="text-xs font-bold text-amber-800 block mb-1">حصص بانتظار الرصد</span>
          <strong className="text-xl font-black text-amber-700">{unrecordedCount} حصة</strong>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="bg-white p-3.5 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث بالمجموعة، المادة، أو اسم المعلم..."
            className="w-full px-3 py-2 pr-9 text-xs rounded-xl border border-slate-300 outline-hidden focus:border-[#1F4E8C]"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
        </div>

        <div className="flex gap-1.5 text-xs font-bold">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-xl transition ${
              statusFilter === 'all' ? 'bg-[#1F4E8C] text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            الكل ({sessions.length})
          </button>
          <button
            onClick={() => setStatusFilter('unrecorded')}
            className={`px-3 py-1.5 rounded-xl transition ${
              statusFilter === 'unrecorded' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            لم تُصد ({unrecordedCount})
          </button>
          <button
            onClick={() => setStatusFilter('recorded')}
            className={`px-3 py-1.5 rounded-xl transition ${
              statusFilter === 'recorded' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            تم الرصد ({recordedCount})
          </button>
        </div>
      </div>

      {/* Sessions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSessions.map(session => {
          const grp = groupById.get(session.groupId);
          const tch = grp ? teacherById.get(grp.teacherId) : undefined;
          const slot = slotById.get(session.scheduleSlotId);
          const isRecorded = session.status === 'recorded';

          const stats = sessionStatsById.get(session.id);
          const present = stats?.present || 0;
          const absent = stats?.absent || 0;

          return (
            <div
              key={session.id}
              className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-3 relative overflow-hidden"
            >
              <div
                className={`h-1.5 absolute top-0 left-0 right-0 ${
                  isRecorded ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />

              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#1F4E8C]">
                    {grp?.subject}
                  </span>
                  <h3 className="font-bold text-base text-slate-900 mt-1">{grp?.name}</h3>
                </div>

                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                    isRecorded
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800 animate-pulse'
                  }`}
                >
                  {isRecorded ? 'تم الرصد' : 'لم تُصد'}
                </span>
              </div>

              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>المعلم:</span>
                  <strong className="text-slate-900">{tch?.name}</strong>
                </div>
                <div className="flex justify-between">
                  <span>الوقت:</span>
                  <span className="font-mono">{slot?.startTime ? formatArabicTime(slot.startTime) : ''} - {slot?.endTime ? formatArabicTime(slot.endTime) : ''}</span>
                </div>
                {isRecorded && (
                  <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                    <span className="text-emerald-700">حضور: {present}</span>
                    <span className="text-rose-700">غياب: {absent}</span>
                  </div>
                )}
              </div>

              {/* Action Button: Owner can view and edit retroactively (ATT-11) */}
              <button
                onClick={() => setSelectedSession(session)}
                className="w-full py-2 bg-slate-100 hover:bg-[#1F4E8C] hover:text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{isRecorded ? 'تعديل أو مراجعة الرصد (بأثر رجعي)' : 'رصد الحضور لهذه الحصة'}</span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Session Attendance Modal */}
      {selectedSession && (
        <SessionAttendanceModal
          isOpen={true}
          session={selectedSession}
          currentUser={currentUser}
          onClose={() => setSelectedSession(null)}
          onSaved={() => {
            setSelectedSession(null);
            setRefreshTick(t => t + 1);
          }}
        />
      )}
    </div>
  );
};
