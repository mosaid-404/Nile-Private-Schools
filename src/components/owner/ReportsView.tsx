import React, { useState } from 'react';
import {
  FileText,
  Printer,
  Download,
  Calendar,
  Users,
  TrendingUp,
  AlertTriangle,
  Award
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { storage } from '../../services/storage';
import { formatArabicDate, getTodayDateString } from '../../utils/arabic';

export const ReportsView: React.FC = () => {
  const [reportType, setReportType] = useState<
    'attendance' | 'chronic_absence' | 'students' | 'broadcasts' | 'teachers_performance'
  >('attendance');

  const students = storage.getStudents();
  const teachers = storage.getTeachers();
  const groups = storage.getGroups();
  const sessions = storage.getSessions();
  const attendance = storage.getAttendanceRecords();
  const broadcasts = storage.getBroadcasts();
  const settings = storage.getSettings();

  const todayStr = getTodayDateString();

  // Export current report to Excel (Section 12.2)
  const handleExportExcel = () => {
    let data: any[] = [];
    let sheetName = 'تقرير';

    if (reportType === 'attendance') {
      sheetName = 'تقرير الحضور';
      data = attendance.map(a => {
        const st = students.find(s => s.id === a.studentId);
        const ses = sessions.find(s => s.id === a.sessionId);
        const grp = ses ? groups.find(g => g.id === ses.groupId) : null;
        return {
          'اسم الطالب': st?.name,
          'كود الطالب': st?.code,
          'المادة': grp?.subject,
          'المجموعة': grp?.name,
          'التاريخ': ses?.date,
          'الحالة': a.status === 'present' ? 'حاضر' : 'غائب',
          'المعلم الراصد': a.recordedBy
        };
      });
    } else if (reportType === 'chronic_absence') {
      sheetName = 'الغياب المتكرر';
      data = students.map(st => {
        const absCount = attendance.filter(a => a.studentId === st.id && a.status === 'absent').length;
        const total = attendance.filter(a => a.studentId === st.id).length;
        return {
          'اسم الطالب': st.name,
          'كود الطالب': st.code,
          'الصف الدراسي': st.grade,
          'عدد مرات الغياب': absCount,
          'إجمالي الحصص': total,
          'نسبة الغياب': total > 0 ? `${Math.round((absCount / total) * 100)}%` : '0%'
        };
      }).filter(x => x['عدد مرات الغياب'] > 0).sort((a, b) => b['عدد مرات الغياب'] - a['عدد مرات الغياب']);
    } else if (reportType === 'broadcasts') {
      sheetName = 'سجل الإشعارات';
      data = broadcasts.map(b => ({
        'عنوان الإشعار': b.title,
        'نص الرسالة': b.body,
        'الفئة المستهدفة': b.targetLabel || b.targetType,
        'عدد المستلمين': b.recipientsCount,
        'المرسل': b.senderName,
        'تاريخ الإرسال': b.sentAt
      }));
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `NPS_${sheetName}_${todayStr}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-lg font-bold text-slate-900">التقارير الإدارية والإحصائيات</h2>
          <p className="text-xs text-slate-500">تقارير شاملة قابلة للطباعة بتنسيق A4 والتصدير إلى Excel</p>
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
          { id: 'students', label: 'تقرير أعداد الطلاب' },
          { id: 'broadcasts', label: 'سجل الإشعارات والرسائل' },
          { id: 'teachers_performance', label: 'أداء المعلمين في الرصد' }
        ].map(r => (
          <button
            key={r.id}
            onClick={() => setReportType(r.id as any)}
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

      {/* Printable Report Canvas (A4 compliant) */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200 text-right print-page space-y-6">
        {/* Report Official Header */}
        <div className="flex items-center justify-between border-b-2 border-[#1F4E8C]/20 pb-4">
          <div>
            <h1 className="text-xl font-black text-[#163A6B]">{settings.schoolName}</h1>
            <p className="text-xs text-slate-600 mt-0.5">العام الدراسي: {settings.academicYear}</p>
            <p className="text-xs text-slate-500 mt-0.5">تاريخ استخراج التقرير: {formatArabicDate(todayStr)}</p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[#1F4E8C] p-2 flex items-center justify-center shrink-0 overflow-hidden">
            <img src={settings.logoUrl || '/icons/icon.svg'} alt="شعار المدرسة" className="w-full h-full object-contain" />
          </div>
        </div>

        {/* 1. Attendance Report */}
        {reportType === 'attendance' && (
          <div className="space-y-4">
            <h3 className="font-bold text-base text-slate-900">تقرير الحضور والغياب التفصيلي</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right divide-y divide-slate-200">
                <thead className="bg-slate-100 font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5">الطالب</th>
                    <th className="p-2.5">الكود</th>
                    <th className="p-2.5">المادة</th>
                    <th className="p-2.5">التاريخ</th>
                    <th className="p-2.5">الحالة</th>
                    <th className="p-2.5">المعلم الراصد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendance.map(a => {
                    const st = students.find(s => s.id === a.studentId);
                    const ses = sessions.find(s => s.id === a.sessionId);
                    const grp = ses ? groups.find(g => g.id === ses.groupId) : null;
                    return (
                      <tr key={a.id} className="hover:bg-slate-50">
                        <td className="p-2.5 font-bold text-slate-900">{st?.name}</td>
                        <td className="p-2.5 font-mono text-slate-600">{st?.code}</td>
                        <td className="p-2.5">{grp?.subject}</td>
                        <td className="p-2.5 text-slate-500">{ses ? formatArabicDate(ses.date) : ''}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${a.status === 'present' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {a.status === 'present' ? 'حاضر' : 'غائب'}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600">{a.recordedBy}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 2. Chronic Absence Report */}
        {reportType === 'chronic_absence' && (
          <div className="space-y-4">
            <h3 className="font-bold text-base text-slate-900">تقرير الطلاب الأكثر غياباً (تجاوز حد التنبيه)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-right divide-y divide-slate-200">
                <thead className="bg-slate-100 font-bold text-slate-700">
                  <tr>
                    <th className="p-2.5">اسم الطالب</th>
                    <th className="p-2.5">الصف والفصل</th>
                    <th className="p-2.5">مرات الغياب</th>
                    <th className="p-2.5">إجمالي الحصص</th>
                    <th className="p-2.5">نسبة الغياب</th>
                    <th className="p-2.5">حالة التنبيه</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map(st => {
                    const absCount = attendance.filter(a => a.studentId === st.id && a.status === 'absent').length;
                    const total = attendance.filter(a => a.studentId === st.id).length;
                    const rate = total > 0 ? Math.round((absCount / total) * 100) : 0;
                    const exceedsThreshold = absCount >= settings.absenceThreshold;

                    return (
                      <tr key={st.id} className={exceedsThreshold ? 'bg-rose-50/50' : ''}>
                        <td className="p-2.5 font-bold text-slate-900">{st.name}</td>
                        <td className="p-2.5 text-slate-600">{st.grade} - فصل {st.classNumber}</td>
                        <td className="p-2.5 font-bold text-rose-700">{absCount}</td>
                        <td className="p-2.5 text-slate-600">{total}</td>
                        <td className="p-2.5 font-semibold text-slate-700">{rate}%</td>
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
                    );
                  })}
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
                  {broadcasts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        لا توجد إشعارات مرسلة حتى الآن
                      </td>
                    </tr>
                  ) : (
                    broadcasts.map(b => (
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
                  {teachers.map(tch => {
                    const tchGroups = groups.filter(g => g.teacherId === tch.id);
                    const tchSessions = sessions.filter(s => tchGroups.some(g => g.id === s.groupId));
                    const recordedCount = tchSessions.filter(s => s.status === 'recorded').length;
                    const rate = tchSessions.length > 0 ? Math.round((recordedCount / tchSessions.length) * 100) : 100;

                    return (
                      <tr key={tch.id}>
                        <td className="p-2.5 font-bold text-slate-900">{tch.name}</td>
                        <td className="p-2.5 text-slate-600">{tch.subject}</td>
                        <td className="p-2.5">{tchGroups.length} مجموعة</td>
                        <td className="p-2.5">{tchSessions.length}</td>
                        <td className="p-2.5 font-bold text-emerald-700">{recordedCount}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded-full font-bold text-xs ${rate >= 90 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                            {rate}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. Students Stats */}
        {reportType === 'students' && (
          <div className="space-y-4">
            <h3 className="font-bold text-base text-slate-900">إحصائية أعداد الطلاب حسب الصفوف والمراحل</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {settings.grades.map((gradeName, i) => {
                const count = students.filter(s => s.grade === gradeName && s.status === 'active').length;
                return (
                  <div key={i} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-xs text-slate-500 block mb-1">{gradeName}</span>
                    <strong className="text-lg font-black text-[#1F4E8C]">{count} طالب</strong>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
