import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Download,
  Plus,
  Archive,
  Eye,
  Key,
  Trash2,
  Phone,
  BookOpen,
  DollarSign,
  AlertCircle,
  CheckCircle,
  FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student, Parent, AttendanceRecord, Invoice } from '../../types';
import { storage } from '../../services/storage';
import { formatCurrency, formatArabicDate } from '../../utils/arabic';
import { AddStudentModal } from './AddStudentModal';

export const StudentManagement: React.FC = () => {
  const [students, setStudents] = useState<Student[]>(() => storage.getStudents());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'active' | 'archived'>('active');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [alertMsg, setAlertMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const settings = storage.getSettings();
  const grades = settings.grades;
  const parents = storage.getParents();
  const attendance = storage.getAttendanceRecords();
  const invoices = storage.getInvoices();
  const groups = storage.getGroups();

  useEffect(() => {
    const onCloudSync = () => setStudents(storage.getStudents());
    window.addEventListener('nps_cloud_sync', onCloudSync);
    return () => window.removeEventListener('nps_cloud_sync', onCloudSync);
  }, []);

  const refreshData = () => {
    setStudents(storage.getStudents());
    setSelectedStudentIds([]);
  };

  // Filter & Search (STU-05)
  const filteredStudents = students.filter(st => {
    const matchesSearch =
      st.name.includes(searchTerm) ||
      st.code.includes(searchTerm) ||
      st.parentPhone.includes(searchTerm);
    const matchesGrade = !selectedGrade || st.grade === selectedGrade;
    const matchesStatus =
      selectedStatus === 'all' ||
      (selectedStatus === 'active' && st.status === 'active') ||
      (selectedStatus === 'archived' && st.status === 'archived');
    return matchesSearch && matchesGrade && matchesStatus;
  });

  // Pagination
  const totalPages = Math.ceil(filteredStudents.length / pageSize) || 1;
  const pagedStudents = filteredStudents.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Select / Deselect All
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedStudentIds(pagedStudents.map(s => s.id));
    } else {
      setSelectedStudentIds([]);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Batch Archive (STU-08)
  const handleBatchArchive = (archive: boolean) => {
    if (selectedStudentIds.length === 0) return;
    const confirmAction = window.confirm(
      `هل أنت متأكد من ${archive ? 'أرشفة' : 'إلغاء أرشفة'} ${selectedStudentIds.length} طالب؟`
    );
    if (!confirmAction) return;

    for (const id of selectedStudentIds) {
      storage.archiveStudent(id, archive);
    }
    refreshData();
    setAlertMsg({
      text: `تم ${archive ? 'أرشفة' : 'تنشيط'} الطلاب المحددين بنجاح`,
      type: 'success'
    });
    setTimeout(() => setAlertMsg(null), 3000);
  };

  // Export to Excel (STU-09)
  const handleExportExcel = () => {
    const exportData = filteredStudents.map(st => {
      const prt = parents.find(p => p.id === st.parentId);
      return {
        'كود الطالب': st.code,
        'اسم الطالب': st.name,
        'الصف الدراسي': st.grade,
        'رقم الفصل': st.classNumber,
        'هاتف ولي الأمر': st.parentPhone,
        'اسم ولي الأمر': prt?.displayName || '',
        'الحالة': st.status === 'active' ? 'نشط' : 'مؤرشف'
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, 'قائمة الطلاب');
    XLSX.writeFile(wb, `NPS_Students_${new Date().toISOString().substring(0, 10)}.xlsx`);
  };

  // Reset Parent Password (PAR-07)
  const handleResetParentPassword = (student: Student) => {
    const prt = parents.find(p => p.id === student.parentId);
    if (!prt) return;

    const users = storage.getUsers();
    const pUser = users.find(u => u.id === prt.userId);
    if (pUser) {
      pUser.passwordHash = prt.phone; // resets to phone number
      storage.saveUsers(users);
      storage.logAudit(
        'admin',
        'المالك',
        'إعادة تعيين كلمة مرور ولي الأمر',
        'User',
        pUser.id,
        `تم إعادة تعيين كلمة مرور ولي الأمر ${prt.displayName} إلى رقم هاتفه الأصلي (${prt.phone})`
      );
      alert(`تمت إعادة تعيين كلمة المرور إلى رقم الهاتف الأصلي بنجاح: ${prt.phone}`);
    }
  };

  // Save Edit Student (STU-07)
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;

    storage.updateStudent(editingStudent);
    refreshData();
    setEditingStudent(null);
    setAlertMsg({ text: 'تم تحديث بيانات الطالب بنجاح', type: 'success' });
    setTimeout(() => setAlertMsg(null), 3000);
  };

  return (
    <div className="space-y-5">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">إدارة سجلات الطلاب</h2>
          <p className="text-xs text-slate-500">
            إجمالي الطلاب المسجلين: <strong className="text-slate-800">{students.length}</strong> (النشطون: {students.filter(s => s.status === 'active').length})
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Export Button */}
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition"
            title="تصدير إلى ملف Excel"
          >
            <Download className="w-4 h-4" />
            <span>تصدير Excel</span>
          </button>

          {/* Add Student Button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 rounded-xl bg-[#1F4E8C] hover:bg-[#163A6B] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة واستيراد طلاب</span>
          </button>
        </div>
      </div>

      {alertMsg && (
        <div
          className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
            alertMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          <span>{alertMsg.text}</span>
        </div>
      )}

      {/* Search & Filters Bar (STU-05) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="بحث بالاسم، الكود، أو هاتف ولي الأمر..."
              className="w-full px-3 py-2 pr-9 text-xs rounded-xl border border-slate-300 outline-hidden focus:border-[#1F4E8C]"
            />
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
          </div>

          {/* Grade Filter */}
          <div>
            <select
              value={selectedGrade}
              onChange={(e) => {
                setSelectedGrade(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white focus:border-[#1F4E8C]"
            >
              <option value="">كافة الصفوف الدراسية</option>
              {grades.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white focus:border-[#1F4E8C]"
            >
              <option value="active">الطلاب النشطون فقط</option>
              <option value="archived">الطلاب المؤرشفون</option>
              <option value="all">كافة الطلاب</option>
            </select>
          </div>
        </div>

        {/* Batch Actions Bar (STU-08) */}
        {selectedStudentIds.length > 0 && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700">
              تم تحديد <strong className="text-[#1F4E8C]">{selectedStudentIds.length}</strong> طالب
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleBatchArchive(true)}
                className="px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold border border-amber-200"
              >
                أرشفة جماعية
              </button>
              <button
                onClick={() => handleBatchArchive(false)}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold border border-emerald-200"
              >
                تنشيط جماعي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right divide-y divide-slate-200">
            <thead className="bg-slate-50 font-bold text-slate-700">
              <tr>
                <th className="p-3 w-10 text-center">
                  <input
                    type="checkbox"
                    onChange={handleSelectAll}
                    checked={pagedStudents.length > 0 && selectedStudentIds.length === pagedStudents.length}
                    className="rounded text-[#1F4E8C]"
                  />
                </th>
                <th className="p-3">الكود</th>
                <th className="p-3">اسم الطالب</th>
                <th className="p-3">الصف والفصل</th>
                <th className="p-3">هاتف ولي الأمر</th>
                <th className="p-3">الحالة</th>
                <th className="p-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedStudents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    لا يوجد طلاب مطابقين لمعايير البحث
                  </td>
                </tr>
              ) : (
                pagedStudents.map(st => {
                  const isChecked = selectedStudentIds.includes(st.id);
                  return (
                    <tr key={st.id} className="hover:bg-slate-50/70 transition">
                      <td className="p-3 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelect(st.id)}
                          className="rounded text-[#1F4E8C]"
                        />
                      </td>
                      <td className="p-3 font-mono font-bold text-[#1F4E8C]">{st.code}</td>
                      <td className="p-3 font-bold text-slate-900">{st.name}</td>
                      <td className="p-3 text-slate-600">
                        {st.grade} - <span className="font-semibold">فصل {st.classNumber}</span>
                      </td>
                      <td className="p-3 font-mono text-slate-700">
                        <div className="flex items-center gap-1.5">
                          <span>{st.parentPhone}</span>
                          {(() => {
                            const siblingsCount = students.filter(other => other.parentPhone === st.parentPhone).length;
                            return siblingsCount > 1 ? (
                              <span className="text-[10px] font-sans font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800" title="مرتبطون بحساب ولي أمر واحد">
                                أخوة ({siblingsCount})
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            st.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {st.status === 'active' ? 'نشط' : 'مؤرشف'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Details Modal */}
                          <button
                            onClick={() => setViewStudent(st)}
                            className="p-1.5 rounded-lg bg-blue-50 text-[#1F4E8C] hover:bg-blue-100 transition"
                            title="عرض تفاصيل وسجل الطالب"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit button */}
                          <button
                            onClick={() => setEditingStudent({ ...st })}
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition"
                            title="تعديل ونقل الفصل"
                          >
                            تعديل
                          </button>

                          {/* Reset Parent Password (PAR-07) */}
                          <button
                            onClick={() => handleResetParentPassword(st)}
                            className="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition"
                            title="إعادة تعيين كلمة مرور ولي الأمر لرقم هاتفه"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>

                          {/* Archive toggle */}
                          <button
                            onClick={() => {
                              storage.archiveStudent(st.id, st.status === 'active');
                              refreshData();
                            }}
                            className={`p-1.5 rounded-lg transition ${
                              st.status === 'active'
                                ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                                : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            }`}
                            title={st.status === 'active' ? 'أرشفة الطالب' : 'إلغاء الأرشفة'}
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              الصفحة {currentPage} من {totalPages}
            </span>
            <div className="flex gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 disabled:opacity-50 font-bold"
              >
                السابق
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 disabled:opacity-50 font-bold"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add / Import Modal */}
      <AddStudentModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={refreshData}
      />

      {/* Student Details Modal (STU-06) */}
      {viewStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full text-right shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-bold text-base text-slate-900">ملف وتفاصيل الطالب</h3>
              <button onClick={() => setViewStudent(null)} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">الاسم:</span>
                <strong className="text-sm text-slate-900">{viewStudent.name}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الكود:</span>
                <strong className="font-mono text-[#1F4E8C]">{viewStudent.code}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الصف والفصل:</span>
                <strong>{viewStudent.grade} - فصل {viewStudent.classNumber}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">هاتف ولي الأمر:</span>
                <strong className="font-mono">{viewStudent.parentPhone}</strong>
              </div>
            </div>

            {/* Attendance & Finance summary */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-emerald-800 font-bold block mb-1">الحضور والغياب</span>
                <p className="text-slate-600">
                  حضور: {attendance.filter(a => a.studentId === viewStudent.id && a.status === 'present').length} • غياب: {attendance.filter(a => a.studentId === viewStudent.id && a.status === 'absent').length}
                </p>
              </div>
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                <span className="text-blue-800 font-bold block mb-1">الموقف المالي</span>
                <p className="text-slate-600">
                  المتبقي: {formatCurrency(invoices.filter(i => i.studentId === viewStudent.id).reduce((a, b) => a + b.remainingAmount, 0))}
                </p>
              </div>
            </div>

            {/* Reset Password Button inside details (PAR-07) */}
            <button
              onClick={() => handleResetParentPassword(viewStudent)}
              className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2"
            >
              <Key className="w-4 h-4" />
              <span>إعادة تعيين كلمة مرور ولي الأمر لرقم هاتفه</span>
            </button>
          </div>
        </div>
      )}

      {/* Edit Student Modal (STU-07) */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <form onSubmit={handleSaveEdit} className="bg-white rounded-3xl p-6 max-w-md w-full text-right shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900 pb-2 border-b border-slate-200">
              تعديل بيانات الطالب ونقله
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم الطالب</label>
              <input
                type="text"
                value={editingStudent.name}
                onChange={(e) => setEditingStudent({ ...editingStudent, name: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الصف الدراسي</label>
              <select
                value={editingStudent.grade}
                onChange={(e) => setEditingStudent({ ...editingStudent, grade: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
              >
                {grades.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم الفصل</label>
              <input
                type="number"
                min="1"
                value={editingStudent.classNumber}
                onChange={(e) => setEditingStudent({ ...editingStudent, classNumber: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم هاتف ولي الأمر</label>
              <input
                type="tel"
                value={editingStudent.parentPhone}
                onChange={(e) => setEditingStudent({ ...editingStudent, parentPhone: e.target.value })}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono outline-hidden"
                required
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-[#1F4E8C] text-white rounded-xl text-xs font-bold hover:bg-[#163A6B]"
              >
                حفظ التعديلات
              </button>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="py-2.5 px-4 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
