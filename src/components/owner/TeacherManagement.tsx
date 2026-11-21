import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Key,
  Copy,
  Printer,
  CheckCircle,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Teacher, Group, SessionInstance, User } from '../../types';
import { storage } from '../../services/storage';
import { AddTeacherModal } from './AddTeacherModal';

export const TeacherManagement: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>(() => storage.getTeachers());
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedSingle, setCopiedSingle] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 24;

  // Credentials Printout Modal (TCH-03)
  const [generatedCreds, setGeneratedCreds] = useState<{
    name: string;
    username: string;
    tempPass: string;
    subject: string;
  } | null>(null);

  const users = storage.getUsers();
  const groups = storage.getGroups();
  const sessions = storage.getSessions();

  useEffect(() => {
    const onCloudSync = () => setTeachers(storage.getTeachers());
    window.addEventListener('nps_cloud_sync', onCloudSync);
    return () => window.removeEventListener('nps_cloud_sync', onCloudSync);
  }, []);

  const refreshTeachers = () => {
    setTeachers(storage.getTeachers());
  };

  const userById = useMemo(() => {
    const map = new Map<string, User>();
    for (const u of users) map.set(u.id, u);
    return map;
  }, [users]);

  const groupsByTeacherId = useMemo(() => {
    const map = new Map<string, Group[]>();
    for (const g of groups) {
      const arr = map.get(g.teacherId) || [];
      arr.push(g);
      map.set(g.teacherId, arr);
    }
    return map;
  }, [groups]);

  const sessionsByGroupId = useMemo(() => {
    const map = new Map<string, SessionInstance[]>();
    for (const s of sessions) {
      const arr = map.get(s.groupId) || [];
      arr.push(s);
      map.set(s.groupId, arr);
    }
    return map;
  }, [sessions]);

  const handleResetPassword = (teacher: Teacher) => {
    const allUsers = storage.getUsers();
    const user = allUsers.find(u => u.id === teacher.userId);
    if (!user) return;

    const tempPassword = 'NPS@1234';

    user.passwordHash = tempPassword;
    storage.saveUsers(allUsers);

    setCopiedSingle(false);
    setGeneratedCreds({
      name: teacher.name,
      username: user.username,
      tempPass: tempPassword,
      subject: teacher.subject
    });
  };

  const handleToggleStatus = (teacher: Teacher) => {
    const newStatus: 'active' | 'disabled' = teacher.status === 'active' ? 'disabled' : 'active';
    const updated: Teacher[] = teachers.map(t =>
      t.id === teacher.id ? { ...t, status: newStatus } : t
    );
    storage.saveTeachers(updated);

    const allUsers = storage.getUsers();
    const u = allUsers.find(x => x.id === teacher.userId);
    if (u) {
      u.status = newStatus;
      storage.saveUsers(allUsers);
    }
    refreshTeachers();
  };

  const handleExportExcel = () => {
    const data = [
      ['اسم المعلم', 'المادة التعليمية', 'رقم الهاتف', 'اسم المستخدم', 'الحالة'],
      ...teachers.map(t => {
        const u = userById.get(t.userId);
        return [
          t.name,
          t.subject,
          t.phone || '',
          u?.username || '',
          t.status === 'active' ? 'نشط' : 'معطّل'
        ];
      })
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'قائمة المعلمين');
    XLSX.writeFile(wb, `NPS_Teachers_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filteredTeachers = useMemo(() => {
    const q = searchTerm.trim();
    if (!q) return teachers;
    return teachers.filter(t => t.name.includes(q) || t.subject.includes(q));
  }, [teachers, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredTeachers.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedTeachers = filteredTeachers.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">إدارة المعلمين وهيئة التدريس</h2>
          <p className="text-xs text-slate-500">
            إجمالي المعلمين: <strong className="text-slate-800">{teachers.length.toLocaleString()}</strong> معلم
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {teachers.length > 0 && (
            <button
              onClick={handleExportExcel}
              className="px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition"
            >
              <Download className="w-4 h-4 text-emerald-600" />
              <span>تصدير Excel</span>
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-[#1F4E8C] hover:bg-[#163A6B] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>إضافة واستيراد معلمين</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="relative max-w-sm w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="بحث باسم المعلم أو المادة..."
            className="w-full px-3 py-2 pr-9 text-xs rounded-xl border border-slate-300 outline-hidden focus:border-[#1F4E8C]"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
        </div>
        {filteredTeachers.length > pageSize && (
          <span className="text-xs text-slate-500">
            عرض {pagedTeachers.length} من أصل {filteredTeachers.length.toLocaleString()} معلم
          </span>
        )}
      </div>

      {/* Teachers Grid (Paginated) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {pagedTeachers.map(teacher => {
          const teacherGroups = groupsByTeacherId.get(teacher.id) || [];
          let totalSess = 0;
          let recordedSess = 0;
          for (const g of teacherGroups) {
            const gSessions = sessionsByGroupId.get(g.id) || [];
            totalSess += gSessions.length;
            for (const s of gSessions) {
              if (s.status === 'recorded') recordedSess++;
            }
          }
          const recordRate = totalSess > 0 ? Math.round((recordedSess / totalSess) * 100) : 100;
          const teacherUser = userById.get(teacher.userId);

          return (
            <div
              key={teacher.id}
              className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-lg">
                    {teacher.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{teacher.name}</h3>
                    <span className="text-[11px] font-semibold text-[#1F4E8C] bg-blue-50 px-2 py-0.5 rounded-full inline-block mt-0.5">
                      {teacher.subject}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    teacher.status === 'active'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {teacher.status === 'active' ? 'نشط' : 'معطّل'}
                </span>
              </div>

              {/* Stats & Groups */}
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 text-xs space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>المجموعات الدراسية:</span>
                  <strong>{teacherGroups.length} مجموعة</strong>
                </div>
                <div className="flex justify-between">
                  <span>نسبة رصد الحضور:</span>
                  <strong className="text-emerald-700">{recordRate}%</strong>
                </div>
                {teacherUser?.username && (
                  <div className="flex justify-between text-[11px] pt-1 border-t border-slate-200 font-mono">
                    <span className="font-sans">كود الدخول:</span>
                    <strong className="text-[#1F4E8C]">{teacherUser.username}</strong>
                  </div>
                )}
                {teacher.phone && (
                  <div className="flex justify-between text-[11px] pt-1 border-t border-slate-200 font-mono">
                    <span className="font-sans">الهاتف:</span>
                    <span>{teacher.phone}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1 text-xs">
                <button
                  onClick={() => handleResetPassword(teacher)}
                  className="flex-1 py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl font-bold flex items-center justify-center gap-1 border border-amber-200 transition"
                  title="توليد كلمة مرور مؤقتة جديدة"
                >
                  <Key className="w-3.5 h-3.5" />
                  <span>كلمة مرور مؤقتة</span>
                </button>

                <button
                  onClick={() => handleToggleStatus(teacher)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition ${
                    teacher.status === 'active'
                      ? 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  {teacher.status === 'active' ? 'تعطيل' : 'تفعيل'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="p-4 bg-white rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
          <span className="text-slate-600">
            الصفحة <strong>{safePage}</strong> من <strong>{totalPages}</strong> (إجمالي {filteredTeachers.length.toLocaleString()} معلم)
          </span>
          <div className="flex gap-1.5">
            <button
              disabled={safePage <= 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="px-3.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 disabled:opacity-40 font-bold hover:bg-slate-100"
            >
              السابق
            </button>
            <button
              disabled={safePage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="px-3.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 disabled:opacity-40 font-bold hover:bg-slate-100"
            >
              التالي
            </button>
          </div>
        </div>
      )}

      {/* Multi-Mode Add / Import Teacher Modal */}
      <AddTeacherModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={refreshTeachers}
      />

      {/* Generated Credentials Popup (TCH-03 - Reset password) */}
      {generatedCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full text-right shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-base">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
              <span>بيانات حساب دخول المعلم</span>
            </div>

            <p className="text-xs text-slate-600">
              يرجى نسخ أو طباعة بيانات الدخول أدناه لتسليمها للمعلم:
            </p>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span>اسم المعلم:</span>
                <strong className="text-slate-900">{generatedCreds.name}</strong>
              </div>
              <div className="flex justify-between">
                <span>المادة:</span>
                <strong>{generatedCreds.subject}</strong>
              </div>
              <div className="flex justify-between">
                <span>اسم المستخدم:</span>
                <strong className="font-mono text-sm text-[#1F4E8C]">{generatedCreds.username}</strong>
              </div>
              <div className="flex justify-between">
                <span>كلمة المرور المؤقتة:</span>
                <strong className="font-mono text-sm text-emerald-700">{generatedCreds.tempPass}</strong>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `بيانات حساب المعلم: ${generatedCreds.name}\nاسم المستخدم: ${generatedCreds.username}\nكلمة المرور: ${generatedCreds.tempPass}`
                  );
                  setCopiedSingle(true);
                  setTimeout(() => setCopiedSingle(false), 2500);
                }}
                className="flex-1 py-2.5 bg-[#1F4E8C] text-white rounded-xl text-xs font-bold hover:bg-[#163A6B] flex items-center justify-center gap-1.5"
              >
                <Copy className="w-4 h-4" />
                <span>{copiedSingle ? 'تم النسخ!' : 'نسخ البيانات'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة</span>
              </button>
              <button
                type="button"
                onClick={() => setGeneratedCreds(null)}
                className="py-2.5 px-3 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

