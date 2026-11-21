import React, { useState, useEffect, useMemo } from 'react';
import {
  Printer,
  Download,
  Filter,
  RotateCcw,
  FileCheck2,
  Search
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { storage } from '../../services/storage';
import { formatArabicDate, getTodayDateString } from '../../utils/arabic';
import { Student, SessionInstance, Group, Teacher } from '../../types';
import {
  SearchableVirtualSelect,
  VirtualSelectOption,
  useProgressiveCount
} from '../common/VirtualList';

type ReportType =
  | 'attendance'
  | 'chronic_absence'
  | 'students'
  | 'broadcasts'
  | 'teachers_performance';

type StatusFilter = 'all' | 'absent' | 'present';

export const ReportsView: React.FC = () => {
  const [reportType, setReportType] = useState<ReportType>('attendance');

  // Pre-generation filter states
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('');
  const [classFilter, setClassFilter] = useState<string>('');
  const [parentIdFilter, setParentIdFilter] = useState<string>('');
  const [studentIdFilter, setStudentIdFilter] = useState<string>('');
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [issuedAt, setIssuedAt] = useState<string | null>(null);

  const [syncTick, setSyncTick] = useState(0);
  useEffect(() => {
    const onCloudSync = () => setSyncTick(t => t + 1);
    window.addEventListener('nps_cloud_sync', onCloudSync);
    window.addEventListener('nps_settings_updated', onCloudSync);
    return () => {
      window.removeEventListener('nps_cloud_sync', onCloudSync);
      window.removeEventListener('nps_settings_updated', onCloudSync);
    };
  }, []);

  const students = storage.getStudents();
  const parents = storage.getParents();
  const teachers = storage.getTeachers();
  const classes = storage.getClasses();
  const groups = storage.getGroups();
  const sessions = storage.getSessions();
  const attendance = storage.getAttendanceRecords();
  const broadcasts = storage.getBroadcasts();
  const settings = storage.getSettings();

  const todayStr = getTodayDateString();

  // Pre-build O(1) lookup indices
  const { studentById, sessionById, groupById, teacherById, teacherByName, parentById } = useMemo(() => {
    const sMap = new Map<string, Student>();
    for (let i = 0; i < students.length; i++) sMap.set(students[i].id, students[i]);

    const sesMap = new Map<string, SessionInstance>();
    for (let i = 0; i < sessions.length; i++) sesMap.set(sessions[i].id, sessions[i]);

    const gMap = new Map<string, Group>();
    for (let i = 0; i < groups.length; i++) gMap.set(groups[i].id, groups[i]);

    const tById = new Map<string, Teacher>();
    const tByName = new Map<string, Teacher>();
    for (let i = 0; i < teachers.length; i++) {
      tById.set(teachers[i].id, teachers[i]);
      if (teachers[i].name) tByName.set(teachers[i].name, teachers[i]);
    }

    const pMap = new Map<string, (typeof parents)[number]>();
    for (let i = 0; i < parents.length; i++) pMap.set(parents[i].id, parents[i]);

    return {
      studentById: sMap,
      sessionById: sesMap,
      groupById: gMap,
      teacherById: tById,
      teacherByName: tByName,
      parentById: pMap
    };
  }, [students, sessions, groups, teachers, parents, syncTick]);

  // Collect available class numbers based on selected grade
  const availableClassNumbers = useMemo(() => {
    const nums = new Set<number>();
    for (let i = 0; i < classes.length; i++) {
      if (!gradeFilter || classes[i].grade === gradeFilter) nums.add(classes[i].classNumber);
    }
    for (let i = 0; i < students.length; i++) {
      if ((!gradeFilter || students[i].grade === gradeFilter) && students[i].classNumber) {
        nums.add(students[i].classNumber);
      }
    }
    return Array.from(nums).sort((a, b) => a - b);
  }, [classes, students, gradeFilter]);

  const selectedParentObj = useMemo(
    () => (parentIdFilter ? parentById.get(parentIdFilter) : undefined),
    [parentById, parentIdFilter]
  );

  // Parent options for virtualized searchable select (shows ALL parents smoothly)
  const parentSelectOptions = useMemo<VirtualSelectOption[]>(
    () =>
      parents.map(p => ({
        value: p.id,
        label: p.displayName,
        subLabel: p.phone,
        searchText: `${p.displayName} ${p.phone || ''}`
      })),
    [parents]
  );

  // Students eligible for dropdown based on parent, grade, class, and search query
  const selectableStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    return students.filter(s => {
      if (parentIdFilter) {
        const matchesParent =
          s.parentId === parentIdFilter ||
          (selectedParentObj?.phone && s.parentPhone === selectedParentObj.phone);
        if (!matchesParent) return false;
      }
      if (gradeFilter && s.grade !== gradeFilter) return false;
      if (classFilter && String(s.classNumber) !== classFilter) return false;
      if (q) {
        return (
          s.name.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          (s.parentPhone && s.parentPhone.includes(q))
        );
      }
      return true;
    });
  }, [students, parentIdFilter, selectedParentObj, gradeFilter, classFilter, studentSearch]);

  const selectedStudentObj = useMemo(
    () => (studentIdFilter ? studentById.get(studentIdFilter) : undefined),
    [studentById, studentIdFilter]
  );

  const studentSelectOptions = useMemo<VirtualSelectOption[]>(
    () =>
      selectableStudents.map(st => ({
        value: st.id,
        label: st.name,
        subLabel: st.code,
        searchText: `${st.name} ${st.code} ${st.parentPhone || ''}`
      })),
    [selectableStudents]
  );

  // Reset dependent filters cleanly
  const handleGradeChange = (val: string) => {
    setGradeFilter(val);
    setClassFilter('');
    setStudentIdFilter('');
  };

  const handleClassChange = (val: string) => {
    setClassFilter(val);
    setStudentIdFilter('');
  };

  const handleParentChange = (val: string) => {
    setParentIdFilter(val);
    setStudentIdFilter('');
  };

  const handleResetFilters = () => {
    setStatusFilter('all');
    setGradeFilter('');
    setClassFilter('');
    setParentIdFilter('');
    setStudentIdFilter('');
    setStudentSearch('');
    setDateFrom('');
    setDateTo('');
    setIssuedAt(null);
  };

  // Filtered Attendance Records (O(Attendance) using Map lookups)
  const { filteredAttendance, totalPresentInFiltered, totalAbsentInFiltered } = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    const result: {
      a: (typeof attendance)[number];
      st: Student | undefined;
      ses: SessionInstance | undefined;
      grp: Group | null | undefined;
      recordDate: string;
      subjectDisplay: string;
    }[] = [];
    let presentCount = 0;
    let absentCount = 0;

    for (let i = 0; i < attendance.length; i++) {
      const a = attendance[i];
      if (statusFilter !== 'all' && a.status !== statusFilter) continue;

      const st = studentById.get(a.studentId);
      if (parentIdFilter) {
        const matchesParent =
          st?.parentId === parentIdFilter ||
          (selectedParentObj?.phone && st?.parentPhone === selectedParentObj.phone);
        if (!matchesParent) continue;
      }
      if (gradeFilter && st?.grade !== gradeFilter) continue;
      if (classFilter && String(st?.classNumber ?? '') !== classFilter) continue;
      if (studentIdFilter && a.studentId !== studentIdFilter) continue;
      if (!studentIdFilter && q) {
        const matchesSearch =
          st?.name.toLowerCase().includes(q) ||
          st?.code.toLowerCase().includes(q);
        if (!matchesSearch) continue;
      }

      const ses = sessionById.get(a.sessionId);
      const recordDate = a.sessionDate || ses?.date || a.recordedAt.substring(0, 10);
      if (dateFrom && recordDate < dateFrom) continue;
      if (dateTo && recordDate > dateTo) continue;

      const grp = ses ? groupById.get(ses.groupId) : null;
      const tch = (grp?.teacherId ? teacherById.get(grp.teacherId) : undefined) || teacherByName.get(a.recordedBy);
      const subjectDisplay = a.subjectName || grp?.subject || tch?.subject || a.sessionLabel || '-';

      if (a.status === 'present') presentCount++;
      else if (a.status === 'absent') absentCount++;

      result.push({ a, st, ses, grp, recordDate, subjectDisplay });
    }

    result.sort((x, y) => {
      const dateCmp = y.recordDate.localeCompare(x.recordDate);
      if (dateCmp !== 0) return dateCmp;
      return x.a.recordedAt.localeCompare(y.a.recordedAt);
    });

    return {
      filteredAttendance: result,
      totalPresentInFiltered: presentCount,
      totalAbsentInFiltered: absentCount
    };
  }, [attendance, studentById, sessionById, groupById, teacherById, teacherByName, statusFilter, parentIdFilter, selectedParentObj, gradeFilter, classFilter, studentIdFilter, studentSearch, dateFrom, dateTo]);

  // Filtered Students (used by students report & chronic absence report)
  const { filteredStudents, gradeActiveCountMap } = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    const matched: Student[] = [];
    const gCountMap = new Map<string, number>();

    for (let i = 0; i < students.length; i++) {
      const st = students[i];
      if (parentIdFilter) {
        const matchesParent =
          st.parentId === parentIdFilter ||
          (selectedParentObj?.phone && st.parentPhone === selectedParentObj.phone);
        if (!matchesParent) continue;
      }
      if (gradeFilter && st.grade !== gradeFilter) continue;
      if (classFilter && String(st.classNumber) !== classFilter) continue;
      if (studentIdFilter && st.id !== studentIdFilter) continue;
      if (!studentIdFilter && q) {
        if (!st.name.toLowerCase().includes(q) && !st.code.toLowerCase().includes(q)) continue;
      }
      matched.push(st);
      if (st.status === 'active') {
        gCountMap.set(st.grade, (gCountMap.get(st.grade) || 0) + 1);
      }
    }
    return { filteredStudents: matched, gradeActiveCountMap: gCountMap };
  }, [students, parentIdFilter, selectedParentObj, gradeFilter, classFilter, studentIdFilter, studentSearch]);

  // Chronic / Student Absence Summary Rows (Single pass over attendance + O(Students))
  const absenceSummaryRows = useMemo(() => {
    const countsByStudentId = new Map<string, { absCount: number; presCount: number }>();
    for (let i = 0; i < attendance.length; i++) {
      const a = attendance[i];
      const ses = sessionById.get(a.sessionId);
      const recordDate = a.sessionDate || ses?.date || a.recordedAt.substring(0, 10);
      if (dateFrom && recordDate < dateFrom) continue;
      if (dateTo && recordDate > dateTo) continue;

      let entry = countsByStudentId.get(a.studentId);
      if (!entry) {
        entry = { absCount: 0, presCount: 0 };
        countsByStudentId.set(a.studentId, entry);
      }
      if (a.status === 'absent') entry.absCount++;
      else if (a.status === 'present') entry.presCount++;
    }

    const threshold = settings.absenceThreshold;
    const rows: {
      st: Student;
      absCount: number;
      presCount: number;
      total: number;
      absRate: number;
      exceedsThreshold: boolean;
    }[] = [];

    for (let i = 0; i < filteredStudents.length; i++) {
      const st = filteredStudents[i];
      const entry = countsByStudentId.get(st.id);
      const absCount = entry?.absCount || 0;
      const presCount = entry?.presCount || 0;
      if (statusFilter === 'absent' && absCount === 0) continue;
      if (statusFilter === 'present' && presCount === 0) continue;

      const total = absCount + presCount;
      const absRate = total > 0 ? Math.round((absCount / total) * 100) : 0;
      rows.push({
        st,
        absCount,
        presCount,
        total,
        absRate,
        exceedsThreshold: absCount >= threshold
      });
    }

    rows.sort((a, b) => b.absCount - a.absCount);
    return rows;
  }, [filteredStudents, attendance, sessionById, dateFrom, dateTo, settings.absenceThreshold, statusFilter]);

  // Filtered Broadcasts
  const filteredBroadcasts = useMemo(() => {
    return broadcasts.filter(b => {
      const bDate = b.sentAt.substring(0, 10);
      if (dateFrom && bDate < dateFrom) return false;
      if (dateTo && bDate > dateTo) return false;
      if (gradeFilter && b.grade && b.grade !== gradeFilter) return false;
      if (classFilter && b.classNumber !== undefined && String(b.classNumber) !== classFilter) return false;
      return true;
    });
  }, [broadcasts, dateFrom, dateTo, gradeFilter, classFilter]);

  // Teacher Performance Rows (O(Teachers + Groups + Sessions))
  const teacherPerformanceRows = useMemo(() => {
    const groupsCountByTeacher = new Map<string, number>();
    const groupTeacherById = new Map<string, string>();
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      groupTeacherById.set(g.id, g.teacherId);
      groupsCountByTeacher.set(g.teacherId, (groupsCountByTeacher.get(g.teacherId) || 0) + 1);
    }

    const sessionStatsByTeacher = new Map<string, { total: number; recorded: number }>();
    for (let i = 0; i < sessions.length; i++) {
      const s = sessions[i];
      if (dateFrom && s.date < dateFrom) continue;
      if (dateTo && s.date > dateTo) continue;
      const teacherId = groupTeacherById.get(s.groupId);
      if (!teacherId) continue;
      let stat = sessionStatsByTeacher.get(teacherId);
      if (!stat) {
        stat = { total: 0, recorded: 0 };
        sessionStatsByTeacher.set(teacherId, stat);
      }
      stat.total++;
      if (s.status === 'recorded') stat.recorded++;
    }

    return teachers.map(tch => {
      const groupsCount = groupsCountByTeacher.get(tch.id) || 0;
      const stat = sessionStatsByTeacher.get(tch.id);
      const totalSessions = stat?.total || 0;
      const recordedCount = stat?.recorded || 0;
      const rate = totalSessions > 0 ? Math.round((recordedCount / totalSessions) * 100) : 100;
      return { tch, groupsCount, totalSessions, recordedCount, rate };
    });
  }, [teachers, groups, sessions, dateFrom, dateTo]);

  // Summary description of active filters for display inside the issued report
  const activeFilterSummary = useMemo(() => {
    const parts: string[] = [];
    if (reportType === 'attendance' || reportType === 'chronic_absence') {
      parts.push(
        statusFilter === 'absent'
          ? 'حالة السجل: الغياب فقط'
          : statusFilter === 'present'
          ? 'حالة السجل: الحضور فقط'
          : 'حالة السجل: الحضور والغياب'
      );
    }
    if (selectedParentObj) {
      parts.push(`ولي الأمر: ${selectedParentObj.displayName}`);
    }
    if (gradeFilter) parts.push(`الصف: ${gradeFilter}`);
    if (classFilter) parts.push(`الفصل: ${classFilter}`);
    if (selectedStudentObj) {
      parts.push(`الطالب: ${selectedStudentObj.name} (${selectedStudentObj.code})`);
    } else if (selectedParentObj) {
      parts.push('كل أبناء ولي الأمر');
    } else if (studentSearch.trim()) {
      parts.push(`بحث طالب: "${studentSearch.trim()}"`);
    }
    if (dateFrom) parts.push(`من: ${formatArabicDate(dateFrom)}`);
    if (dateTo) parts.push(`إلى: ${formatArabicDate(dateTo)}`);
    return parts;
  }, [reportType, statusFilter, selectedParentObj, gradeFilter, classFilter, selectedStudentObj, studentSearch, dateFrom, dateTo]);

  const handleIssueReport = () => {
    setIssuedAt(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    const el = document.getElementById('issued-report-preview');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Export filtered report to Excel
  const handleExportExcel = () => {
    let data: Record<string, unknown>[] = [];
    let sheetName = 'تقرير';

    if (reportType === 'attendance') {
      sheetName =
        statusFilter === 'absent'
          ? 'تقرير الغياب'
          : statusFilter === 'present'
          ? 'تقرير الحضور'
          : 'تقرير الحضور والغياب';
      data = filteredAttendance.map(({ a, st, grp, recordDate, subjectDisplay }) => ({
        'اسم الطالب': st?.name || '',
        'كود الطالب': st?.code || '',
        'الصف الدراسي': st?.grade || '',
        'الفصل': st?.classNumber ? `فصل ${st.classNumber}` : '',
        'المادة / الحصة': subjectDisplay,
        'المجموعة / رقم الحصة': a.sessionLabel || grp?.name || '',
        'التاريخ': recordDate,
        'الحالة': a.status === 'present' ? 'حاضر' : 'غائب',
        'المعلم الراصد': a.recordedBy
      }));
    } else if (reportType === 'chronic_absence') {
      sheetName = 'ملخص الغياب';
      data = absenceSummaryRows.map(row => ({
        'اسم الطالب': row.st.name,
        'كود الطالب': row.st.code,
        'الصف الدراسي': row.st.grade,
        'الفصل': `فصل ${row.st.classNumber}`,
        'مرات الحضور': row.presCount,
        'مرات الغياب': row.absCount,
        'إجمالي الحصص': row.total,
        'نسبة الغياب': `${row.absRate}%`,
        'حالة التنبيه': row.exceedsThreshold ? 'تجاوز الحد (إنذار)' : 'طبيعي'
      }));
    } else if (reportType === 'students') {
      sheetName = 'بيانات الطلاب';
      data = filteredStudents.map(st => ({
        'اسم الطالب': st.name,
        'كود الطالب': st.code,
        'الصف الدراسي': st.grade,
        'الفصل': `فصل ${st.classNumber}`,
        'هاتف ولي الأمر': st.parentPhone,
        'الحالة': st.status === 'active' ? 'نشط' : 'مؤرشف'
      }));
    } else if (reportType === 'broadcasts') {
      sheetName = 'سجل الإشعارات';
      data = filteredBroadcasts.map(b => ({
        'عنوان الإشعار': b.title,
        'نص الرسالة': b.body,
        'الفئة المستهدفة': b.targetLabel || b.targetType,
        'عدد المستلمين': b.recipientsCount,
        'المرسل': b.senderName,
        'تاريخ الإرسال': b.sentAt
      }));
    } else if (reportType === 'teachers_performance') {
      sheetName = 'أداء المعلمين';
      data = teacherPerformanceRows.map(({ tch, groupsCount, totalSessions, recordedCount, rate }) => ({
        'اسم المعلم': tch.name,
        'المادة': tch.subject,
        'المجموعات': groupsCount,
        'إجمالي الحصص': totalSessions,
        'الحصص المرصودة': recordedCount,
        'نسبة الانضباط': `${rate}%`
      }));
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `NPS_${sheetName}_${todayStr}.xlsx`);
  };

  // Seamless incremental rendering across all report tabs (zero 50-row cap)
  const currentTotalRows =
    reportType === 'attendance'
      ? filteredAttendance.length
      : reportType === 'chronic_absence'
      ? absenceSummaryRows.length
      : reportType === 'broadcasts'
      ? filteredBroadcasts.length
      : reportType === 'teachers_performance'
      ? teacherPerformanceRows.length
      : filteredStudents.length;

  const { visibleCount, hasMore, sentinelRef } = useProgressiveCount(
    currentTotalRows,
    100,
    150,
    `${reportType}_${statusFilter}_${gradeFilter}_${classFilter}_${parentIdFilter}_${studentIdFilter}_${studentSearch}_${dateFrom}_${dateTo}`
  );

  const paginatedAttendance = filteredAttendance.slice(0, visibleCount);
  const paginatedAbsenceSummary = absenceSummaryRows.slice(0, visibleCount);
  const paginatedBroadcasts = filteredBroadcasts.slice(0, visibleCount);
  const paginatedTeachersPerf = teacherPerformanceRows.slice(0, visibleCount);
  const paginatedStudents = filteredStudents.slice(0, visibleCount);

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-lg font-bold text-slate-900">التقارير الإدارية والإحصائيات</h2>
          <p className="text-xs text-slate-500">
            اختر نوع التقرير وحدد الفلاتر (طالب، صف، فصل، حضور/غياب، فترة) قبل الإصدار والطباعة
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Download className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-[#1F4E8C] hover:bg-[#163A6B] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة التقرير (A4)</span>
          </button>
        </div>
      </div>

      {/* Report Selector Pills */}
      <div className="flex items-center bg-white p-1.5 rounded-2xl border border-slate-200 text-xs font-bold gap-1.5 overflow-x-auto no-print">
        {[
          { id: 'attendance', label: 'تقرير الحضور والغياب' },
          { id: 'chronic_absence', label: 'تقرير الغياب المتكرر' },
          { id: 'students', label: 'تقرير الطلاب والأعداد' },
          { id: 'broadcasts', label: 'سجل الإشعارات والرسائل' },
          { id: 'teachers_performance', label: 'أداء المعلمين في الرصد' }
        ].map(r => (
          <button
            key={r.id}
            onClick={() => setReportType(r.id as ReportType)}
            className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition ${
              reportType === r.id
                ? 'bg-[#1F4E8C] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Pre-Issue Report Filters Card */}
      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4 no-print">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-[#1F4E8C] font-bold text-xs sm:text-sm">
            <Filter className="w-4 h-4" />
            <span>فلاتر إعداد التقرير قبل الإصدار</span>
          </div>
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-[11px] font-bold text-slate-500 hover:text-rose-600 flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-slate-50 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة ضبط الفلاتر</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-right">
          {/* Status Filter: All / Absent / Present */}
          {(reportType === 'attendance' || reportType === 'chronic_absence') && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                نوع السجل (حضور / غياب)
              </label>
              <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`py-1.5 rounded-lg transition ${
                    statusFilter === 'all' ? 'bg-white text-[#1F4E8C] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  الكل
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('absent')}
                  className={`py-1.5 rounded-lg transition ${
                    statusFilter === 'absent' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  غياب فقط
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('present')}
                  className={`py-1.5 rounded-lg transition ${
                    statusFilter === 'present' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  حضور فقط
                </button>
              </div>
            </div>
          )}

          {/* Grade Filter */}
          {reportType !== 'teachers_performance' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                الصف الدراسي
              </label>
              <select
                value={gradeFilter}
                onChange={(e) => handleGradeChange(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-hidden focus:border-[#1F4E8C]"
              >
                <option value="">كافة الصفوف</option>
                {settings.grades.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          )}

          {/* Class Number Filter */}
          {reportType !== 'teachers_performance' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                الفصل
              </label>
              <select
                value={classFilter}
                onChange={(e) => handleClassChange(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-hidden focus:border-[#1F4E8C]"
              >
                <option value="">كافة الفصول</option>
                {availableClassNumbers.map(num => (
                  <option key={num} value={String(num)}>فصل {num}</option>
                ))}
              </select>
            </div>
          )}

          {/* Parent Filter (Report per parent's child or all children) */}
          {(reportType === 'attendance' || reportType === 'chronic_absence' || reportType === 'students') && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                ولي الأمر (تقرير ابن أو كل الأبناء)
              </label>
              <SearchableVirtualSelect
                value={parentIdFilter}
                onChange={handleParentChange}
                options={parentSelectOptions}
                emptyOptionLabel={`كل أولياء الأمور (${parents.length})`}
                searchPlaceholder="ابحث باسم ولي الأمر أو الهاتف..."
              />
            </div>
          )}

          {/* Student Search + Specific Student Picker */}
          {(reportType === 'attendance' || reportType === 'chronic_absence' || reportType === 'students') && (
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                طالب / ابن معين (أو كل الأبناء)
              </label>
              <div className="flex gap-1.5">
                <div className="relative w-1/2">
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => {
                      setStudentSearch(e.target.value);
                      setStudentIdFilter('');
                    }}
                    placeholder="تصفية الجدول بالاسم/الكود..."
                    className="w-full pr-7 pl-2 py-2 text-xs rounded-xl border border-slate-300 outline-hidden focus:border-[#1F4E8C]"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-2.5" />
                </div>
                <div className="w-1/2">
                  <SearchableVirtualSelect
                    value={studentIdFilter}
                    onChange={(val) => setStudentIdFilter(val)}
                    options={studentSelectOptions}
                    emptyOptionLabel={
                      parentIdFilter ? `كل أبناء ولي الأمر (${selectableStudents.length})` : `كل الطلاب (${selectableStudents.length})`
                    }
                    searchPlaceholder="اختر طالباً بالاسم أو الكود..."
                  />
                </div>
              </div>
            </div>
          )}

          {/* Date From */}
          {reportType !== 'students' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                من تاريخ
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-hidden focus:border-[#1F4E8C]"
              />
            </div>
          )}

          {/* Date To */}
          {reportType !== 'students' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                إلى تاريخ
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-hidden focus:border-[#1F4E8C]"
              />
            </div>
          )}
        </div>

        {/* Issue Report CTA Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="text-[11px] text-slate-500">
            {issuedAt
              ? `تم تحديث وإصدار التقرير الساعة ${issuedAt} وفق الفلاتر المحددة.`
              : 'يتم تطبيق الفلاتر تلقائياً على التقرير بالأسفل — اضغط «إصدار التقرير» للانتقال للمعاينة الجاهزة.'}
          </div>
          <button
            type="button"
            onClick={handleIssueReport}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>إصدار التقرير</span>
          </button>
        </div>
      </div>

      {/* Printable Report Canvas (A4 compliant) */}
      <div
        id="issued-report-preview"
        className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 text-right print-page space-y-6"
      >
        {/* Report Official Header */}
        <div className="flex items-center justify-between border-b-2 border-[#1F4E8C]/20 pb-4">
          <div className="space-y-1">
            <h1 className="text-xl font-black text-[#163A6B]">{settings.schoolName}</h1>
            <p className="text-xs text-slate-600">العام الدراسي: {settings.academicYear}</p>
            <p className="text-xs text-slate-500">تاريخ استخراج التقرير: {formatArabicDate(todayStr)}</p>
            {activeFilterSummary.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {activeFilterSummary.map((item, idx) => (
                  <span
                    key={idx}
                    className="inline-block px-2 py-0.5 rounded-md bg-blue-50 text-[#1F4E8C] border border-blue-100 text-[10px] font-bold"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="w-16 h-16 rounded-2xl bg-[#011242] flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
            <img src={settings.logoUrl || '/icons/app-logo.png'} alt="شعار المدرسة" className="w-full h-full object-cover" />
          </div>
        </div>

        {/* 1. Attendance / Absence Report */}
        {reportType === 'attendance' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-bold text-base text-slate-900">
                {statusFilter === 'absent'
                  ? 'تقرير الغياب التفصيلي'
                  : statusFilter === 'present'
                  ? 'تقرير الحضور التفصيلي'
                  : 'تقرير الحضور والغياب التفصيلي'}
              </h3>
              <div className="flex items-center gap-2 text-[11px] font-bold">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700">
                  الإجمالي: {filteredAttendance.length}
                </span>
                {statusFilter !== 'absent' && (
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700">
                    حضور: {totalPresentInFiltered}
                  </span>
                )}
                {statusFilter !== 'present' && (
                  <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700">
                    غياب: {totalAbsentInFiltered}
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right divide-y divide-slate-200">
                <thead className="bg-slate-100 font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5">الطالب</th>
                    <th className="p-2.5">الكود</th>
                    <th className="p-2.5">الصف والفصل</th>
                    <th className="p-2.5">المادة</th>
                    <th className="p-2.5">التاريخ</th>
                    <th className="p-2.5">الحالة</th>
                    <th className="p-2.5">المعلم الراصد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedAttendance.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        لا توجد سجلات تطابق الفلاتر المحددة
                      </td>
                    </tr>
                  ) : (
                    paginatedAttendance.map(({ a, st, recordDate, subjectDisplay }) => (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-900">{st?.name || 'غير معروف'}</td>
                        <td className="p-2.5 font-mono text-slate-600">{st?.code || '-'}</td>
                        <td className="p-2.5 text-slate-600">
                          {st ? `${st.grade} - فصل ${st.classNumber}` : '-'}
                        </td>
                        <td className="p-2.5">
                          <span className="font-semibold text-slate-800">{subjectDisplay}</span>
                          {a.sessionLabel && a.sessionLabel !== subjectDisplay && (
                            <span className="block text-[10px] text-slate-500">{a.sessionLabel}</span>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-500">{formatArabicDate(recordDate)}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                              a.status === 'present'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {a.status === 'present' ? 'حاضر' : 'غائب'}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600">{a.recordedBy}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. Chronic Absence / Student Absence Summary Report */}
        {reportType === 'chronic_absence' && (
          <div className="space-y-4">
            <h3 className="font-bold text-base text-slate-900">
              {statusFilter === 'absent'
                ? 'تقرير الغياب المتكرر حسب الفلاتر'
                : 'تقرير إحصائية الحضور والغياب للطلاب'}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right divide-y divide-slate-200">
                <thead className="bg-slate-100 font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5">اسم الطالب</th>
                    <th className="p-2.5">الكود</th>
                    <th className="p-2.5">الصف والفصل</th>
                    <th className="p-2.5">مرات الحضور</th>
                    <th className="p-2.5">مرات الغياب</th>
                    <th className="p-2.5">إجمالي الحصص</th>
                    <th className="p-2.5">نسبة الغياب</th>
                    <th className="p-2.5">حالة التنبيه</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedAbsenceSummary.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-8 text-slate-400">
                        لا توجد بيانات تطابق الفلاتر المحددة
                      </td>
                    </tr>
                  ) : (
                    paginatedAbsenceSummary.map(({ st, absCount, presCount, total, absRate, exceedsThreshold }) => (
                      <tr key={st.id} className={exceedsThreshold ? 'bg-rose-50/50' : ''}>
                        <td className="p-2.5 font-bold text-slate-900">{st.name}</td>
                        <td className="p-2.5 font-mono text-slate-600">{st.code}</td>
                        <td className="p-2.5 text-slate-600">{st.grade} - فصل {st.classNumber}</td>
                        <td className="p-2.5 font-bold text-emerald-700">{presCount}</td>
                        <td className="p-2.5 font-bold text-rose-700">{absCount}</td>
                        <td className="p-2.5 text-slate-600">{total}</td>
                        <td className="p-2.5 font-semibold text-slate-700">{absRate}%</td>
                        <td className="p-2.5">
                          {exceedsThreshold ? (
                            <span className="text-rose-700 font-bold bg-rose-100 px-2 py-0.5 rounded text-[10px]">
                              تجاوز الحد المقبول (إنذار)
                            </span>
                          ) : (
                            <span className="text-emerald-700 text-[10px]">طبيعي</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. Broadcasts Report */}
        {reportType === 'broadcasts' && (
          <div className="space-y-4">
            <h3 className="font-bold text-base text-slate-900">سجل الإشعارات والرسائل الصادرة</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right divide-y divide-slate-200">
                <thead className="bg-slate-100 font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5">عنوان الإشعار</th>
                    <th className="p-2.5">الفئة المستهدفة</th>
                    <th className="p-2.5">نص الرسالة</th>
                    <th className="p-2.5">المستلمون</th>
                    <th className="p-2.5">المرسل</th>
                    <th className="p-2.5">تاريخ الإرسال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedBroadcasts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        لا توجد إشعارات تطابق الفلاتر المحددة
                      </td>
                    </tr>
                  ) : (
                    paginatedBroadcasts.map(b => (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-900">{b.title}</td>
                        <td className="p-2.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#1F4E8C]">
                            {b.targetLabel || (
                              b.targetType === 'all_teachers' ? 'المعلمون فقط' :
                              b.targetType === 'specific_teachers' ? 'معلمون محددون' :
                              b.targetType === 'all_parents' ? 'كافة أولياء الأمور' :
                              b.targetType === 'grade' ? `الصف ${b.grade}` :
                              b.targetType === 'grade_class' ? `الصف ${b.grade} - فصل ${b.classNumber}` :
                              'طلاب محددون'
                            )}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600 max-w-xs truncate">{b.body}</td>
                        <td className="p-2.5 font-bold text-emerald-700">{b.recipientsCount} مستلم</td>
                        <td className="p-2.5 text-slate-600">{b.senderName}</td>
                        <td className="p-2.5 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {formatArabicDate(b.sentAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. Teachers Performance */}
        {reportType === 'teachers_performance' && (
          <div className="space-y-4">
            <h3 className="font-bold text-base text-slate-900">تقرير أداء المعلمين ونسبة رصد الحصص</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right divide-y divide-slate-200">
                <thead className="bg-slate-100 font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5">اسم المعلم</th>
                    <th className="p-2.5">المادة</th>
                    <th className="p-2.5">المجموعات</th>
                    <th className="p-2.5">إجمالي الحصص</th>
                    <th className="p-2.5">الحصص المرصودة</th>
                    <th className="p-2.5">نسبة الانضباط في الرصد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedTeachersPerf.map(({ tch, groupsCount, totalSessions, recordedCount, rate }) => (
                    <tr key={tch.id}>
                      <td className="p-2.5 font-bold text-slate-900">{tch.name}</td>
                      <td className="p-2.5 text-slate-600">{tch.subject}</td>
                      <td className="p-2.5">{groupsCount} مجموعة</td>
                      <td className="p-2.5">{totalSessions}</td>
                      <td className="p-2.5 font-bold text-emerald-700">{recordedCount}</td>
                      <td className="p-2.5">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-xs ${rate >= 90 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {rate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. Students Stats & Filtered Roster */}
        {reportType === 'students' && (
          <div className="space-y-5">
            <h3 className="font-bold text-base text-slate-900">تقرير أعداد وقائمة الطلاب حسب الصف والفصل</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {settings.grades
                .filter(g => !gradeFilter || g === gradeFilter)
                .map((gradeName, i) => {
                  const count = gradeActiveCountMap.get(gradeName) || 0;
                  return (
                    <div key={i} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                      <span className="text-xs text-slate-500 block mb-1">{gradeName}</span>
                      <strong className="text-lg font-black text-[#1F4E8C]">{count} طالب</strong>
                    </div>
                  );
                })}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right divide-y divide-slate-200">
                <thead className="bg-slate-100 font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5">اسم الطالب</th>
                    <th className="p-2.5">الكود</th>
                    <th className="p-2.5">الصف الدراسي</th>
                    <th className="p-2.5">الفصل</th>
                    <th className="p-2.5">هاتف ولي الأمر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedStudents.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-400">
                        لا يوجد طلاب يطابقون الفلاتر المحددة
                      </td>
                    </tr>
                  ) : (
                    paginatedStudents.map(st => (
                      <tr key={st.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-900">{st.name}</td>
                        <td className="p-2.5 font-mono text-slate-600">{st.code}</td>
                        <td className="p-2.5 text-slate-600">{st.grade}</td>
                        <td className="p-2.5 text-slate-600">فصل {st.classNumber}</td>
                        <td className="p-2.5 font-mono text-slate-600">{st.parentPhone}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Seamless Scroll Auto-Loader for Full Results */}
        {hasMore && (
          <div ref={sentinelRef} className="pt-3 text-center text-xs text-slate-400 no-print">
            جاري تحميل المزيد من النتائج ({visibleCount} / {currentTotalRows})...
          </div>
        )}
      </div>
    </div>
  );
};
