import React, { useState, useMemo } from 'react';
import { Printer, Download, FileText, RotateCcw, Calendar, CheckCircle2, XCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student, AttendanceRecord, SessionInstance, Group, Teacher } from '../../types';
import { storage } from '../../services/storage';
import { formatArabicDate, getTodayDateString } from '../../utils/arabic';

interface Props {
  parentName: string;
  childrenList: Student[];
  attendanceRecords: AttendanceRecord[];
  sessions: SessionInstance[];
  groups: Group[];
  teachers: Teacher[];
}

type StatusFilter = 'absent' | 'all' | 'present';

export const ParentReportsView: React.FC<Props> = ({
  parentName,
  childrenList,
  attendanceRecords,
  sessions,
  groups,
  teachers
}) => {
  const [selectedChildScope, setSelectedChildScope] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('absent');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  const settings = storage.getSettings();
  const todayStr = getTodayDateString();

  const targetChildren = useMemo(() => {
    if (selectedChildScope === 'all') return childrenList;
    return childrenList.filter(c => c.id === selectedChildScope);
  }, [childrenList, selectedChildScope]);

  const targetChildIds = useMemo(() => new Set(targetChildren.map(c => c.id)), [targetChildren]);

  // Per-child summary stats within selected date range
  const childSummaries = useMemo(() => {
    return targetChildren.map(child => {
      const childRecs = attendanceRecords.filter(a => {
        if (a.studentId !== child.id) return false;
        const ses = sessions.find(s => s.id === a.sessionId);
        const recDate = a.sessionDate || ses?.date || a.recordedAt.substring(0, 10);
        if (dateFrom && recDate < dateFrom) return false;
        if (dateTo && recDate > dateTo) return false;
        return true;
      });
      const total = childRecs.length;
      const present = childRecs.filter(a => a.status === 'present').length;
      const absent = childRecs.filter(a => a.status === 'absent').length;
      const absenceRate = total > 0 ? Math.round((absent / total) * 100) : 0;
      return { child, total, present, absent, absenceRate };
    });
  }, [targetChildren, attendanceRecords, sessions, dateFrom, dateTo]);

  // Detailed records sorted by date descending and within the same day chronologically
  const detailedRows = useMemo(() => {
    return attendanceRecords
      .filter(a => targetChildIds.has(a.studentId))
      .map(a => {
        const student = childrenList.find(c => c.id === a.studentId);
        const ses = sessions.find(s => s.id === a.sessionId);
        const grp = ses ? groups.find(g => g.id === ses.groupId) : null;
        const tch = teachers.find(t => t.id === grp?.teacherId || t.name === a.recordedBy);
        const recDate = a.sessionDate || ses?.date || a.recordedAt.substring(0, 10);
        const timeText = a.recordedAt
          ? new Date(a.recordedAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
          : '';
        const subject = a.subjectName || grp?.subject || tch?.subject || 'حصة دراسية';
        const sessionLabel = a.sessionLabel || grp?.name || '';
        return { a, student, recDate, timeText, subject, sessionLabel };
      })
      .filter(row => {
        if (statusFilter !== 'all' && row.a.status !== statusFilter) return false;
        if (dateFrom && row.recDate < dateFrom) return false;
        if (dateTo && row.recDate > dateTo) return false;
        return true;
      })
      .sort((x, y) => {
        const dateCmp = y.recDate.localeCompare(x.recDate);
        if (dateCmp !== 0) return dateCmp;
        return x.a.recordedAt.localeCompare(y.a.recordedAt);
      });
  }, [attendanceRecords, targetChildIds, childrenList, sessions, groups, teachers, statusFilter, dateFrom, dateTo]);

  const totalSessionsAll = childSummaries.reduce((acc, s) => acc + s.total, 0);
  const totalPresentAll = childSummaries.reduce((acc, s) => acc + s.present, 0);
  const totalAbsentAll = childSummaries.reduce((acc, s) => acc + s.absent, 0);

  const selectedChildObj =
    selectedChildScope === 'all' ? null : childrenList.find(c => c.id === selectedChildScope) || null;

  const handleResetFilters = () => {
    setSelectedChildScope('all');
    setStatusFilter('absent');
    setDateFrom('');
    setDateTo('');
  };

  const handleExportExcel = () => {
    const scopeTitle = selectedChildObj ? selectedChildObj.name : 'كل الأبناء';
    const typeTitle =
      statusFilter === 'absent'
        ? 'تقرير الغياب'
        : statusFilter === 'present'
        ? 'تقرير الحضور'
        : 'تقرير الحضور والغياب';

    const summarySheetData = childSummaries.map(s => ({
      'اسم الطالب': s.child.name,
      'كود الطالب': s.child.code,
      'الصف الدراسي': s.child.grade,
      'الفصل': `فصل ${s.child.classNumber}`,
      'إجمالي الحصص': s.total,
      'حصص الحضور': s.present,
      'حصص الغياب': s.absent,
      'نسبة الغياب': `${s.absenceRate}%`
    }));

    const detailSheetData = detailedRows.map(r => ({
      'اسم الطالب': r.student?.name || '',
      'كود الطالب': r.student?.code || '',
      'الصف والفصل': r.student ? `${r.student.grade} - فصل ${r.student.classNumber}` : '',
      'المادة': r.subject,
      'الحصة': r.sessionLabel || '-',
      'التاريخ': r.recDate,
      'الوقت': r.timeText,
      'الحالة': r.a.status === 'present' ? 'حاضر' : 'غائب',
      'المعلم الراصد': r.a.recordedBy,
      'ملاحظات': r.a.note || ''
    }));

    const wb = XLSX.utils.book_new();
    const wsDetail = XLSX.utils.json_to_sheet(
      detailSheetData.length > 0 ? detailSheetData : [{ 'ملاحظة': 'لا توجد سجلات مطابقة للفلاتر' }]
    );
    const wsSummary = XLSX.utils.json_to_sheet(summarySheetData);
    XLSX.utils.book_append_sheet(wb, wsDetail, typeTitle.substring(0, 30));
    XLSX.utils.book_append_sheet(wb, wsSummary, 'ملخص الأبناء');
    XLSX.writeFile(wb, `NPS_${typeTitle}_${scopeTitle}_${todayStr}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* Controls & Filters Card */}
      <div className="bg-white rounded-3xl p-4 sm:p-6 shadow-sm border border-slate-200 space-y-4 no-print">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#1F4E8C] flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">تقارير غياب وحضور الأبناء</h2>
              <p className="text-xs text-slate-500">استخرج تقرير غياب لكل ابن أو لجميع الأبناء مع إمكانية الطباعة والتصدير</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportExcel}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Download className="w-4 h-4" />
              <span>تصدير Excel</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-2 rounded-xl bg-[#1F4E8C] hover:bg-[#163A6B] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة التقرير</span>
            </button>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-right">
          {/* Child Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">نطاق التقرير (ابن محدد أو كل الأبناء)</label>
            <select
              value={selectedChildScope}
              onChange={(e) => setSelectedChildScope(e.target.value)}
              className="w-full px-3 py-2.5 text-xs font-bold rounded-xl border border-slate-300 bg-white outline-hidden focus:border-[#1F4E8C]"
            >
              <option value="all">كل الأبناء ({childrenList.length})</option>
              {childrenList.map(child => (
                <option key={child.id} value={child.id}>
                  {child.name} — {child.grade} (فصل {child.classNumber})
                </option>
              ))}
            </select>
          </div>

          {/* Status Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">نوع التقرير</label>
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setStatusFilter('absent')}
                className={`py-2 rounded-lg transition ${
                  statusFilter === 'absent' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الغياب فقط
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`py-2 rounded-lg transition ${
                  statusFilter === 'all' ? 'bg-[#1F4E8C] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الحضور والغياب
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('present')}
                className={`py-2 rounded-lg transition ${
                  statusFilter === 'present' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الحضور فقط
              </button>
            </div>
          </div>

          {/* Date From */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">من تاريخ</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-hidden focus:border-[#1F4E8C]"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1.5">إلى تاريخ</label>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-hidden focus:border-[#1F4E8C]"
              />
              <button
                type="button"
                onClick={handleResetFilters}
                title="إعادة ضبط الفلاتر"
                className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-slate-50 transition"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Printable Report Body */}
      <div className="bg-white rounded-3xl p-5 sm:p-7 shadow-sm border border-slate-200 print-page space-y-6 text-right">
        {/* Official School Header */}
        <div className="flex items-center justify-between border-b-2 border-[#1F4E8C]/20 pb-4 gap-3">
          <div className="space-y-1">
            <h3 className="text-lg sm:text-xl font-black text-[#163A6B]">{settings.schoolName}</h3>
            <p className="text-xs text-slate-600 font-bold">
              {statusFilter === 'absent'
                ? 'تقرير غياب الطالب / الأبناء'
                : statusFilter === 'present'
                ? 'تقرير حضور الطالب / الأبناء'
                : 'تقرير الحضور والغياب التفصيلي'}
              {' — '}
              {selectedChildObj ? selectedChildObj.name : `كل الأبناء (${childrenList.length})`}
            </p>
            <p className="text-[11px] text-slate-500">
              ولي الأمر: {parentName} • تاريخ الاستخراج: {formatArabicDate(todayStr)}
              {(dateFrom || dateTo) && (
                <span>
                  {' • '}الفترة: {dateFrom ? formatArabicDate(dateFrom) : 'البداية'} إلى{' '}
                  {dateTo ? formatArabicDate(dateTo) : 'اليوم'}
                </span>
              )}
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#011242] flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
            <img src={settings.logoUrl || '/icons/app-logo.png'} alt="شعار المدرسة" className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Quick Summary KPI Strip */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center">
            <span className="text-[11px] text-slate-500 block mb-1">إجمالي الحصص المرصودة</span>
            <strong className="text-base sm:text-lg font-black text-slate-900">{totalSessionsAll}</strong>
          </div>
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-center">
            <span className="text-[11px] text-emerald-700 block mb-1">إجمالي الحضور</span>
            <strong className="text-base sm:text-lg font-black text-emerald-700">{totalPresentAll}</strong>
          </div>
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-center">
            <span className="text-[11px] text-rose-700 block mb-1">إجمالي الغياب</span>
            <strong className="text-base sm:text-lg font-black text-rose-700">{totalAbsentAll}</strong>
          </div>
        </div>

        {/* Per-Child Summary Table */}
        <div className="space-y-2.5">
          <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#1F4E8C]" />
            <span>ملخص الغياب والحضور لكل ابن</span>
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-100 font-bold text-slate-700">
                <tr>
                  <th className="p-2.5">اسم الابن</th>
                  <th className="p-2.5">الصف والفصل</th>
                  <th className="p-2.5">إجمالي الحصص</th>
                  <th className="p-2.5">الحضور</th>
                  <th className="p-2.5">الغياب</th>
                  <th className="p-2.5">نسبة الغياب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {childSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-slate-400">
                      لا يوجد أبناء مسجلون
                    </td>
                  </tr>
                ) : (
                  childSummaries.map(({ child, total, present, absent, absenceRate }) => (
                    <tr key={child.id} className={absent > 0 ? 'bg-rose-50/30' : ''}>
                      <td className="p-2.5 font-bold text-slate-900">{child.name}</td>
                      <td className="p-2.5 text-slate-600">{child.grade} - فصل {child.classNumber}</td>
                      <td className="p-2.5 font-semibold text-slate-800">{total}</td>
                      <td className="p-2.5 font-bold text-emerald-700">{present}</td>
                      <td className="p-2.5 font-bold text-rose-700">{absent}</td>
                      <td className="p-2.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            absenceRate >= 20
                              ? 'bg-rose-100 text-rose-800'
                              : absenceRate > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {absenceRate}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detailed Absence / Sessions Table */}
        <div className="space-y-2.5">
          <h4 className="font-bold text-sm text-slate-900">
            {statusFilter === 'absent'
              ? `سجل الغياب التفصيلي (${detailedRows.length})`
              : statusFilter === 'present'
              ? `سجل الحضور التفصيلي (${detailedRows.length})`
              : `السجل التفصيلي للحصص (${detailedRows.length})`}
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
              <thead className="bg-slate-100 font-bold text-slate-700">
                <tr>
                  <th className="p-2.5">الطالب</th>
                  <th className="p-2.5">المادة / الحصة</th>
                  <th className="p-2.5">التاريخ والوقت</th>
                  <th className="p-2.5">الحالة</th>
                  <th className="p-2.5">المعلم الراصد</th>
                  <th className="p-2.5">ملاحظة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detailedRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      {statusFilter === 'absent'
                        ? 'لا توجد سجلات غياب خلال الفترة المحددة'
                        : 'لا توجد سجلات مطابقة خلال الفترة المحددة'}
                    </td>
                  </tr>
                ) : (
                  detailedRows.map(({ a, student, recDate, timeText, subject, sessionLabel }) => (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="p-2.5 font-bold text-slate-900">{student?.name || '-'}</td>
                      <td className="p-2.5 text-slate-800">
                        <span className="font-semibold">{subject}</span>
                        {sessionLabel && sessionLabel !== subject && (
                          <span className="block text-[10px] text-slate-500">{sessionLabel}</span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-600 whitespace-nowrap">
                        {formatArabicDate(recDate)}
                        {timeText && <span className="block text-[10px] text-slate-400">{timeText}</span>}
                      </td>
                      <td className="p-2.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                            a.status === 'present'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {a.status === 'present' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          <span>{a.status === 'present' ? 'حاضر' : 'غائب'}</span>
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-600">{a.recordedBy}</td>
                      <td className="p-2.5 text-slate-500">{a.note || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
