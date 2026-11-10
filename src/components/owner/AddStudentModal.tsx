import React, { useState } from 'react';
import {
  Upload,
  Clipboard,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  X,
  Trash2,
  RefreshCw,
  Plus
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Student } from '../../types';
import { storage } from '../../services/storage';
import { cleanEgyptianPhone, toLatinDigits, normalizeGradeName } from '../../utils/arabic';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedRow {
  index: number;
  code: string;
  name: string;
  grade: string;
  classNumber: number;
  phone: string;
  status: 'valid' | 'warning' | 'error' | 'exists';
  message: string;
  rawGrade: string;
}

export const AddStudentModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'upload' | 'paste'>('manual');
  
  // Manual form state
  const [manualCode, setManualCode] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualGrade, setManualGrade] = useState('');
  const [manualClassNum, setManualClassNum] = useState<number>(1);
  const [manualPhone, setManualPhone] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualSuccess, setManualSuccess] = useState('');

  // Bulk Import state
  const [pasteText, setPasteText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    added: number;
    parentsCreated: number;
    skipped: number;
  } | null>(null);

  const settings = storage.getSettings();
  const allowedGrades = settings.grades;
  const existingStudents = storage.getStudents();

  if (!isOpen) return null;

  // Manual Add Handler (STU-01)
  const handleManualAdd = (addAnother: boolean = false) => {
    setManualError('');
    setManualSuccess('');

    if (!manualCode.trim() || !manualName.trim() || !manualGrade || !manualPhone.trim()) {
      setManualError('يرجى تعبئة كافة الحقول المطلوبة');
      return;
    }

    const res = storage.saveStudent({
      code: manualCode.trim(),
      name: manualName.trim(),
      grade: manualGrade,
      classNumber: manualClassNum,
      parentPhone: manualPhone.trim(),
      status: 'active'
    });

    if (res.success) {
      setManualSuccess(`تم حفظ الطالب ${manualName} بنجاح! تم إنشاء / ربط حساب ولي الأمر تلقائياً.`);
      onSuccess();
      if (addAnother) {
        setManualCode('');
        setManualName('');
        setManualPhone('');
        setTimeout(() => setManualSuccess(''), 2000);
      } else {
        setTimeout(() => {
          onClose();
        }, 1200);
      }
    } else {
      setManualError(res.error || 'حدث خطأ أثناء الحفظ.');
    }
  };

  // Download Sample Excel Template (Appendix A, STU-02)
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Template
    const templateData = [
      ['كود الطالب', 'اسم الطالب', 'الصف الدراسي', 'رقم الفصل', 'رقم هاتف ولي الأمر'],
      ['1001', 'محمد أحمد علي', 'الصف الرابع الابتدائي', 3, '01012345678'],
      ['1002', 'سارة خالد حسن', 'الصف الأول الإعدادي', 1, '01198765432'],
      ['1003', 'يوسف كريم إبراهيم', 'الصف الرابع الابتدائي', 3, '01245678901']
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(templateData);

    // Sheet 2: Instructions
    const instructionsData = [
      ['اسم العمود', 'الوصف والقواعد'],
      ['كود الطالب', 'رقم أو نص فريد لكل طالب بدون مسافات (مثال: 1001)'],
      ['اسم الطالب', 'اسم الطالب ثلاثي أو رباعي بالعربية أو الإنجليزية'],
      ['الصف الدراسي', `يجب أن يكون من الصفوف المعتمدة: ${allowedGrades.slice(0, 6).join(' - ')} إلخ`],
      ['رقم الفصل', 'رقم الفصل الصحيح (مثال: 1 أو 2 أو 3)'],
      ['رقم هاتف ولي الأمر', 'رقم محمول مصري 11 خانة (يبدأ بـ 010 أو 011 أو 012 أو 015). يتم إنشاء حساب ولي الأمر تلقائياً بنفس الرقم.']
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(instructionsData);

    XLSX.utils.book_append_sheet(wb, ws1, 'قالب الطلاب');
    XLSX.utils.book_append_sheet(wb, ws2, 'تعليمات الاستيراد');

    XLSX.writeFile(wb, 'NPS_Students_Template.xlsx');
  };

  // Parse Raw Tabular Data (from File or Paste)
  const parseRawRows = (rawMatrix: any[][]) => {
    const rows: ParsedRow[] = [];
    const seenCodesInFile = new Set<string>();

    for (let i = 0; i < rawMatrix.length; i++) {
      const row = rawMatrix[i];
      if (!row || row.length === 0 || (row.length === 1 && !row[0])) continue;

      // Skip header row if matches labels
      const firstCol = String(row[0] || '').trim();
      if (firstCol.includes('كود') || firstCol.toLowerCase().includes('code')) {
        continue;
      }

      const rawCode = toLatinDigits(String(row[0] || '')).trim();
      const rawName = String(row[1] || '').trim();
      const rawGrade = String(row[2] || '').trim();
      const rawClassNum = parseInt(toLatinDigits(String(row[3] || '1')), 10) || 1;
      const rawPhone = toLatinDigits(String(row[4] || '')).trim();

      let status: 'valid' | 'warning' | 'error' | 'exists' = 'valid';
      let message = 'جاهز للاعتماد';

      // 1. Check code
      if (!rawCode) {
        status = 'error';
        message = 'كود الطالب مطلوب';
      } else if (seenCodesInFile.has(rawCode)) {
        status = 'error';
        message = 'كود مكرر داخل نفس الملف';
      } else if (existingStudents.some(s => s.code === rawCode)) {
        status = 'exists';
        message = 'كود مسجل مسبقاً بالنظام (سيتم تخطيه)';
      }
      seenCodesInFile.add(rawCode);

      // 2. Check name
      if (status !== 'error' && (!rawName || rawName.length < 3)) {
        status = 'error';
        message = 'اسم الطالب يجب أن يكون 3 أحرف على الأقل';
      }

      // 3. Check grade
      const normalizedGrade = normalizeGradeName(rawGrade, allowedGrades);
      let finalGrade = normalizedGrade || rawGrade;
      if (status !== 'error' && !normalizedGrade) {
        status = 'warning';
        message = `صف دراسي غير مطابق تماماً (مقترح: ${allowedGrades[0]})`;
        finalGrade = allowedGrades[0];
      }

      // 4. Check phone
      if (status !== 'error') {
        const phoneCheck = cleanEgyptianPhone(rawPhone);
        if (!phoneCheck.isValid) {
          status = 'error';
          message = phoneCheck.error || 'رقم هاتف غير صحيح';
        }
      }

      rows.push({
        index: i + 1,
        code: rawCode,
        name: rawName,
        grade: finalGrade,
        classNumber: rawClassNum,
        phone: rawPhone,
        status,
        message,
        rawGrade
      });
    }

    setParsedRows(rows);
    setImportSummary(null);
  };

  // Upload File Handler (STU-02)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        parseRawRows(data);
      } catch (err) {
        alert('حدث خطأ أثناء قراءة ملف Excel.');
      }
    };
    reader.readAsBinaryString(file);
  };

  // Paste Text Handler (STU-03)
  const handleParsePaste = () => {
    if (!pasteText.trim()) return;
    const lines = pasteText.trim().split('\n');
    const matrix = lines.map(line => line.split('\t').map(c => c.trim()));
    parseRawRows(matrix);
  };

  // Update cell in preview table
  const handleUpdateRowCell = (idx: number, field: keyof ParsedRow, value: any) => {
    setParsedRows(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  // Remove row from preview table
  const handleDeleteRow = (idx: number) => {
    setParsedRows(prev => prev.filter((_, i) => i !== idx));
  };

  // Confirm Valid Rows (Section 4.3 Step 4 & 5)
  const handleConfirmImport = () => {
    const validRows = parsedRows.filter(r => r.status === 'valid' || r.status === 'warning');
    if (validRows.length === 0) {
      alert('لا توجد صفوف صالحة للاعتماد!');
      return;
    }

    let addedCount = 0;
    const beforeParentsCount = storage.getParents().length;

    for (const row of validRows) {
      const res = storage.saveStudent({
        code: row.code,
        name: row.name,
        grade: row.grade,
        classNumber: row.classNumber,
        parentPhone: row.phone,
        status: 'active'
      });
      if (res.success) {
        addedCount++;
      }
    }

    const afterParentsCount = storage.getParents().length;
    const newParents = afterParentsCount - beforeParentsCount;

    setImportSummary({
      total: parsedRows.length,
      added: addedCount,
      parentsCreated: newParents,
      skipped: parsedRows.length - addedCount
    });

    onSuccess();
  };

  // Download Errors File (Section 4.3 Step 6)
  const handleDownloadErrors = () => {
    const errorRows = parsedRows.filter(r => r.status === 'error' || r.status === 'exists');
    if (errorRows.length === 0) return;

    const data = [
      ['كود الطالب', 'اسم الطالب', 'الصف الدراسي', 'رقم الفصل', 'رقم هاتف ولي الأمر', 'سبب الخطأ'],
      ...errorRows.map(r => [r.code, r.name, r.grade, r.classNumber, r.phone, r.message])
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'صفوف مرفوضة');
    XLSX.writeFile(wb, 'NPS_Rejected_Rows.xlsx');
  };

  const validCount = parsedRows.filter(r => r.status === 'valid' || r.status === 'warning').length;
  const errorCount = parsedRows.filter(r => r.status === 'error').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="bg-[#1F4E8C] text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/10">
              <FileSpreadsheet className="w-5 h-5 text-blue-100" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg">إضافة طلاب واستيراد جماعي</h3>
              <p className="text-xs text-blue-100">
                إضافة يدوية، رفع ملف Excel/CSV، أو لصق مباشر من جداول البيانات
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Tabs (STU-04) */}
        <div className="flex items-center bg-slate-100 p-2 border-b border-slate-200 text-xs font-bold gap-2">
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center gap-2 ${
              activeTab === 'manual'
                ? 'bg-white text-[#1F4E8C] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>إضافة يدوية فردية</span>
          </button>

          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center gap-2 ${
              activeTab === 'upload'
                ? 'bg-white text-[#1F4E8C] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>رفع ملف Excel / CSV</span>
          </button>

          <button
            onClick={() => setActiveTab('paste')}
            className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center gap-2 ${
              activeTab === 'paste'
                ? 'bg-white text-[#1F4E8C] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clipboard className="w-4 h-4" />
            <span>لصق صفوف من Excel</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5 text-right">
          {/* Tab 1: Manual Addition (STU-01) */}
          {activeTab === 'manual' && (
            <div className="max-w-xl mx-auto space-y-4">
              {manualError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{manualError}</span>
                </div>
              )}
              {manualSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>{manualSuccess}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    كود الطالب <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="مثال: 1007"
                    className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 font-mono outline-hidden focus:border-[#1F4E8C]"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">يعامل كنص لحفظ الأصفار البادئة</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم الطالب ثلاثي / رباعي <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="مثال: زياد سامح عبد السلام"
                    className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 outline-hidden focus:border-[#1F4E8C]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    الصف الدراسي <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={manualGrade}
                    onChange={(e) => setManualGrade(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 outline-hidden bg-white focus:border-[#1F4E8C]"
                    required
                  >
                    <option value="">-- اختر الصف الدراسي --</option>
                    {allowedGrades.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم الفصل <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={manualClassNum}
                    onChange={(e) => setManualClassNum(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 outline-hidden focus:border-[#1F4E8C]"
                    required
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم هاتف ولي الأمر (محمول مصري 11 خانة) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    placeholder="مثال: 01012345678"
                    className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 font-mono outline-hidden focus:border-[#1F4E8C]"
                    required
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    يتم إنشاء حساب ولي الأمر تلقائياً وتعيين رقم الهاتف كاسم مستخدم وكلمة مرور مبدئية
                  </span>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => handleManualAdd(false)}
                  className="flex-1 py-3 bg-[#1F4E8C] text-white rounded-xl text-xs font-bold hover:bg-[#163A6B] shadow-sm"
                >
                  حفظ الطالب
                </button>
                <button
                  type="button"
                  onClick={() => handleManualAdd(true)}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm"
                >
                  حفظ وإضافة طالب آخر
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Upload Excel/CSV (STU-02) */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-200">
                <div>
                  <h4 className="text-sm font-bold text-[#163A6B]">تحميل قالب Excel الجاهز للاستيراد</h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    القالب يحتوي على ورقة ثانية تشرح القيم المعتمدة لكل صف دراسي وعمود.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2 bg-[#1F4E8C] hover:bg-[#163A6B] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shrink-0 shadow-xs"
                >
                  <Download className="w-4 h-4" />
                  <span>تحميل القالب الجاهز (XLSX)</span>
                </button>
              </div>

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-slate-300 hover:border-[#1F4E8C] rounded-3xl p-8 text-center bg-slate-50/50 transition">
                <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">اختر ملف Excel (XLSX أو CSV) حتى 5 ميجابايت وحتى 5000 صف</p>
                <p className="text-[11px] text-slate-400 mt-1 mb-4">يُقرأ أول شيت ويتجاهل الصف الأول إن كان عناوين</p>
                <label className="px-5 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 rounded-xl text-xs font-bold cursor-pointer inline-block shadow-2xs">
                  <span>تصفح الملفات من جهازك</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Tab 3: Paste from Excel (STU-03) */}
          {activeTab === 'paste' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                انسخ الصفوف من ملفك في Excel (بالأعمدة: كود الطالب | اسم الطالب | الصف | رقم الفصل | هاتف ولي الأمر) ثم الصقها في المربع أدناه:
              </div>

              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="الصق هنا البيانات المنسوخة من Excel مباشرة..."
                rows={5}
                className="w-full p-3 text-xs font-mono rounded-2xl border border-slate-300 outline-hidden focus:border-[#1F4E8C] bg-white"
              />

              <button
                type="button"
                onClick={handleParsePaste}
                className="py-2.5 px-6 bg-[#1F4E8C] text-white rounded-xl text-xs font-bold hover:bg-[#163A6B]"
              >
                تحليل الصفوف وعرض المعاينة
              </button>
            </div>
          )}

          {/* Preview Table & Validation (Section 4.3 Steps 2, 3, 4) */}
          {parsedRows.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    جدول معاينة وتحقق الصفوف ({parsedRows.length} صف)
                  </h4>
                  <p className="text-xs text-slate-500">
                    يمكنك تعديل أي خلية مباشرة في الجدول قبل الاعتماد النهائي
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                    {validCount} صف صالح
                  </span>
                  {errorCount > 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-rose-100 text-rose-800 font-bold">
                      {errorCount} به أخطاء
                    </span>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-2xl">
                <table className="w-full text-xs text-right divide-y divide-slate-200">
                  <thead className="bg-slate-100 font-bold text-slate-700 sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5">الحالة</th>
                      <th className="p-2.5">الكود</th>
                      <th className="p-2.5">اسم الطالب</th>
                      <th className="p-2.5">الصف الدراسي</th>
                      <th className="p-2.5">رقم الفصل</th>
                      <th className="p-2.5">هاتف ولي الأمر</th>
                      <th className="p-2.5">ملاحظة التحقق</th>
                      <th className="p-2.5 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {parsedRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={`hover:bg-slate-50/80 ${
                          row.status === 'error'
                            ? 'bg-rose-50/50'
                            : row.status === 'warning'
                            ? 'bg-amber-50/40'
                            : row.status === 'exists'
                            ? 'bg-blue-50/40'
                            : ''
                        }`}
                      >
                        {/* Status badge */}
                        <td className="p-2.5 whitespace-nowrap">
                          {row.status === 'valid' && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                              جاهز
                            </span>
                          )}
                          {row.status === 'warning' && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[10px]">
                              تنبيه
                            </span>
                          )}
                          {row.status === 'error' && (
                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                              خطأ
                            </span>
                          )}
                          {row.status === 'exists' && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[10px]">
                              موجود مسبقاً
                            </span>
                          )}
                        </td>

                        {/* Editable Code */}
                        <td className="p-2.5 font-mono">
                          <input
                            type="text"
                            value={row.code}
                            onChange={(e) => handleUpdateRowCell(idx, 'code', e.target.value)}
                            className="w-20 px-2 py-1 rounded border border-slate-200 text-xs"
                          />
                        </td>

                        {/* Editable Name */}
                        <td className="p-2.5">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => handleUpdateRowCell(idx, 'name', e.target.value)}
                            className="w-36 px-2 py-1 rounded border border-slate-200 text-xs"
                          />
                        </td>

                        {/* Editable Grade */}
                        <td className="p-2.5">
                          <select
                            value={row.grade}
                            onChange={(e) => handleUpdateRowCell(idx, 'grade', e.target.value)}
                            className="px-2 py-1 rounded border border-slate-200 text-xs bg-white"
                          >
                            {allowedGrades.map(g => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                        </td>

                        {/* Editable Class */}
                        <td className="p-2.5">
                          <input
                            type="number"
                            min="1"
                            value={row.classNumber}
                            onChange={(e) => handleUpdateRowCell(idx, 'classNumber', parseInt(e.target.value) || 1)}
                            className="w-14 px-2 py-1 rounded border border-slate-200 text-xs"
                          />
                        </td>

                        {/* Editable Phone */}
                        <td className="p-2.5 font-mono">
                          <input
                            type="text"
                            value={row.phone}
                            onChange={(e) => handleUpdateRowCell(idx, 'phone', e.target.value)}
                            className="w-28 px-2 py-1 rounded border border-slate-200 text-xs"
                          />
                        </td>

                        {/* Message */}
                        <td className="p-2.5 text-[11px] text-slate-600 max-w-xs truncate">
                          {row.message}
                        </td>

                        {/* Delete row button */}
                        <td className="p-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeleteRow(idx)}
                            className="p-1 rounded text-rose-500 hover:bg-rose-50"
                            title="حذف هذا الصف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex gap-2">
                  {errorCount > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadErrors}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition"
                    >
                      <Download className="w-4 h-4" />
                      <span>تحميل ملف الأخطاء المرفوضة (Excel)</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={validCount === 0}
                  className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition"
                >
                  اعتماد الصفوف الصالحة ({validCount} طالب)
                </button>
              </div>
            </div>
          )}

          {/* Import Summary Modal (Section 4.3 Step 6) */}
          {importSummary && (
            <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-3">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <span>اكتمل الاستيراد الجماعي للطلاب بنجاح!</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-emerald-100">
                  <span className="text-slate-500 block">الطلاب المضافون:</span>
                  <strong className="text-emerald-700 text-base">{importSummary.added}</strong>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-100">
                  <span className="text-slate-500 block">حسابات أولياء الأمور:</span>
                  <strong className="text-blue-700 text-base">{importSummary.parentsCreated}</strong>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-100">
                  <span className="text-slate-500 block">الصفوف المتخطاة:</span>
                  <strong className="text-amber-700 text-base">{importSummary.skipped}</strong>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-100">
                  <span className="text-slate-500 block">إجمالي المفحوص:</span>
                  <strong className="text-slate-700 text-base">{importSummary.total}</strong>
                </div>
              </div>
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800"
                >
                  إغلاق ومتابعة
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
