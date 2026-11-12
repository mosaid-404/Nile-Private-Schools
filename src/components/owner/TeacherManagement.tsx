import React, { useState } from 'react';
import {
  GraduationCap,
  Plus,
  Search,
  Key,
  Calendar,
  Users,
  Copy,
  Printer,
  AlertCircle,
  CheckCircle,
  FileSpreadsheet,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Teacher, Group, SessionInstance, AttendanceRecord } from '../../types';
import { storage } from '../../services/storage';

export const TeacherManagement: React.FC = () => {
  const [teachers, setTeachers] = useState<Teacher[]>(() => storage.getTeachers());
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedTeacher, setSelectedTeacher] = useState<Teacher | null>(null);

  // New Teacher form
  const [teacherName, setTeacherName] = useState('');
  const [teacherSubject, setTeacherSubject] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [addError, setAddError] = useState('');

  // Credentials Printout Modal (TCH-03)
  const [generatedCreds, setGeneratedCreds] = useState<{
    name: string;
    username: string;
    tempPass: string;
    subject: string;
  } | null>(null);

  const settings = storage.getSettings();
  const subjects = settings.subjects;
  const groups = storage.getGroups();
  const sessions = storage.getSessions();
  const attendance = storage.getAttendanceRecords();

  const refreshTeachers = () => {
    setTeachers(storage.getTeachers());
  };

  const handleAddTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');

    if (!teacherName.trim() || !teacherSubject) {
      setAddError('يرجى إدخال اسم المعلم واختيار المادة');
      return;
    }

    // Check duplicate (TCH-05)
    if (teachers.some(t => t.name === teacherName.trim() && t.subject === teacherSubject)) {
      setAddError('يوجد معلم مسجل مسبقاً بنفس الاسم والمادة التعليمية!');
      return;
    }

    const res = storage.saveTeacher({
      name: teacherName.trim(),
      subject: teacherSubject,
      phone: teacherPhone.trim() || undefined
    });

    setGeneratedCreds({
      name: res.teacher.name,
      username: res.username,
      tempPass: res.tempPassword,
      subject: res.teacher.subject
    });

    setTeacherName('');
    setTeacherPhone('');
    setShowAddModal(false);
    refreshTeachers();
  };

  const handleResetPassword = (teacher: Teacher) => {
    const users = storage.getUsers();
    const user = users.find(u => u.id === teacher.userId);
    if (!user) return;

    const tempPassword = 'NPS@1234';

    user.passwordHash = tempPassword;
    storage.saveUsers(users);

    setGeneratedCreds({
      name: teacher.name,
      username: user.username,
      tempPass: tempPassword,
      subject: teacher.subject
    });
  };

  const handleToggleStatus = (teacher: Teacher) => {
    const newStatus = teacher.status === 'active' ? 'disabled' : 'active';
    teacher.status = newStatus;
    storage.saveTeachers(teachers);

    const users = storage.getUsers();
    const u = users.find(x => x.id === teacher.userId);
    if (u) {
      u.status = newStatus;
      storage.saveUsers(users);
    }
    refreshTeachers();
  };

  const filteredTeachers = teachers.filter(
    t => t.name.includes(searchTerm) || t.subject.includes(searchTerm)
  );

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">إدارة المعلمين وهيئة التدريس</h2>
          <p className="text-xs text-slate-500">
            إجمالي المعلمين: <strong className="text-slate-800">{teachers.length}</strong> معلم
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-[#1F4E8C] hover:bg-[#163A6B] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة معلم جديد</span>
        </button>
      </div>

      {/* Search */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200">
        <div className="relative max-w-sm">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث باسم المعلم أو المادة..."
            className="w-full px-3 py-2 pr-9 text-xs rounded-xl border border-slate-300 outline-hidden focus:border-[#1F4E8C]"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
        </div>
      </div>

      {/* Teachers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTeachers.map(teacher => {
          const teacherGroups = groups.filter(g => g.teacherId === teacher.id);
          const teacherSessions = sessions.filter(s => teacherGroups.some(g => g.id === s.groupId));
          const recordedSessions = teacherSessions.filter(s => s.status === 'recorded');
          const recordRate = teacherSessions.length > 0
            ? Math.round((recordedSessions.length / teacherSessions.length) * 100)
            : 100;

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
                {teacher.phone && (
                  <div className="flex justify-between text-[11px] pt-1 border-t border-slate-200 font-mono">
                    <span>الهاتف:</span>
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

      {/* Add Teacher Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <form onSubmit={handleAddTeacher} className="bg-white rounded-3xl p-6 max-w-md w-full text-right shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900 pb-2 border-b border-slate-200">
              إضافة معلم جديد
            </h3>

            {addError && (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{addError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                اسم المعلم <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={teacherName}
                onChange={(e) => setTeacherName(e.target.value)}
                placeholder="مثال: أ. محمود حسني"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                المادة التعليمية والتخصص <span className="text-rose-500">*</span>
              </label>
              <select
                value={teacherSubject}
                onChange={(e) => setTeacherSubject(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
                required
              >
                <option value="">-- اختر المادة --</option>
                {subjects.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                رقم الهاتف (اختياري)
              </label>
              <input
                type="tel"
                value={teacherPhone}
                onChange={(e) => setTeacherPhone(e.target.value)}
                placeholder="مثال: 01012345678"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono outline-hidden"
              />
            </div>

            <div className="p-3 bg-blue-50/60 rounded-xl text-[11px] text-blue-900 leading-relaxed">
              سيتم توليد كود دخول تلقائي (T001...) وكلمة مرور عشوائية مؤقتة تظهر لك لمرة واحدة لتسليمها للمعلم.
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-[#1F4E8C] text-white rounded-xl text-xs font-bold hover:bg-[#163A6B]"
              >
                حفظ وإصدار بيانات الدخول
              </button>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="py-2.5 px-4 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Generated Credentials Popup (TCH-03 - Shown once) */}
      {generatedCreds && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full text-right shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-emerald-800 font-bold text-base">
              <CheckCircle className="w-6 h-6 text-emerald-600" />
              <span>بيانات حساب دخول المعلم (تظهر مرة واحدة)</span>
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
                  alert('تم نسخ بيانات الدخول إلى الحافظة!');
                }}
                className="flex-1 py-2.5 bg-[#1F4E8C] text-white rounded-xl text-xs font-bold hover:bg-[#163A6B] flex items-center justify-center gap-1.5"
              >
                <Copy className="w-4 h-4" />
                <span>نسخ البيانات</span>
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
