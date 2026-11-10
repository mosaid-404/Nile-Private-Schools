import React, { useState } from 'react';
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
import { SessionInstance, Group, Teacher, AttendanceRecord, Student, User } from '../../types';
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

  const groups = storage.getGroups();
  const teachers = storage.getTeachers();
  const slots = storage.getScheduleSlots();
  const sessions = storage.getOrCreateSessionsForDate(selectedDate);
  const attendance = storage.getAttendanceRecords();

  const filteredSessions = sessions.filter(s => {
    const grp = groups.find(g => g.id === s.groupId);
    const tch = teachers.find(t => t.id === grp?.teacherId);
    const matchesSearch =
      (grp && grp.name.includes(searchTerm)) ||
      (grp && grp.subject.includes(searchTerm)) ||
      (tch && tch.name.includes(searchTerm));

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'recorded' && s.status === 'recorded') ||
      (statusFilter === 'unrecorded' && s.status !== 'recorded');

    return matchesSearch && matchesStatus;
  });

  const recordedCount = sessions.filter(s => s.status === 'recorded').length;
  const unrecordedCount = sessions.length - recordedCount;

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
          const grp = groups.find(g => g.id === session.groupId);
          const tch = teachers.find(t => t.id === grp?.teacherId);
          const slot = slots.find(s => s.id === session.scheduleSlotId);
          const isRecorded = session.status === 'recorded';

          // Session attendance stats
          const sessionRecords = attendance.filter(a => a.sessionId === session.id);
          const present = sessionRecords.filter(a => a.status === 'present').length;
          const absent = sessionRecords.filter(a => a.status === 'absent').length;

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
          }}
        />
      )}
    </div>
  );
};
