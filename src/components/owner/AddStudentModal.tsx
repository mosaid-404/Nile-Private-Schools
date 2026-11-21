import React, { useState, useMemo } from 'react';
import {
  Upload,
  Clipboard,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle,
  X,
  Trash2,
  Plus,
  Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { storage } from '../../services/storage';
import { cleanEgyptianPhone, toLatinDigits, normalizeGradeName } from '../../utils/arabic';
import { useProgressiveCount } from '../common/VirtualList';

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
  const [bulkNotice, setBulkNotice] = useState('');
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'issues'>('all');

  // Async Progress state for 10,000+ rows
  const [busyProgress, setBusyProgress] = useState<{
    phase: 'reading' | 'parsing' | 'saving';
    processed: number;
    total: number;
  } | null>(null);

  const [importSummary, setImportSummary] = useState<{
    total: number;
    added: number;
    parentsCreated: number;
    skipped: number;
  } | null>(null);

  const settings = storage.getSettings();
  const allowedGrades = settings.grades;

  // Derived counters & filtered pagination in single pass
  const { validCount, errorCount, existsCount, filteredIndices } = useMemo(() => {
    let valid = 0;
    let err = 0;
    let exists = 0;
    const indices: number[] = [];

    for (let i = 0; i < parsedRows.length; i++) {
      const st = parsedRows[i].status;
      if (st === 'valid' || st === 'warning') {
        valid++;
        if (previewFilter === 'all' || previewFilter === 'valid') indices.push(i);
      } else {
        if (st === 'error') err++;
        else exists++;
        if (previewFilter === 'all' || previewFilter === 'issues') indices.push(i);
      }
    }
    return { validCount: valid, errorCount: err, existsCount: exists, filteredIndices: indices };
  }, [parsedRows, previewFilter]);

  const {
    visibleCount: visiblePreviewCount,
    hasMore: hasMorePreview,
    sentinelRef: previewSentinelRef
  } = useProgressiveCount(
    filteredIndices.length,
    100,
    150,
    `${isOpen}_${previewFilter}_${parsedRows.length}`
  );

  if (!isOpen) return null;

  const visibleRowIndices = filteredIndices.slice(0, visiblePreviewCount);

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

    const templateData = [
      ['كود الطالب', 'اسم الطالب', 'الصف الدراسي', 'رقم الفصل', 'رقم هاتف ولي الأمر'],
      ['1001', 'محمد أحمد علي', 'الصف الرابع الابتدائي', 3, '01012345678'],
      ['1002', 'سارة خالد حسن', 'الصف الأول الإعدادي', 1, '01198765432'],
      ['1003', 'يوسف كريم إبراهيم', 'الصف الرابع الابتدائي', 3, '01245678901']
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(templateData);

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

  // Async Chunked Parser for 10,000+ rows without blocking UI
  const parseRawRowsAsync = async (rawMatrix: unknown[][]) => {
    setBulkNotice('');
    setImportSummary(null);
    setParsedRows([]);

    const totalRaw = rawMatrix.length;
    if (totalRaw === 0) {
      setBulkNotice('الملف أو النص فارغ ولا يحتوي على صفوف.');
      return;
    }

    setBusyProgress({ phase: 'parsing', processed: 0, total: totalRaw });
    await new Promise<void>(r => setTimeout(r, 0));

    // O(1) lookup structures built once
    const existingCodesSet = new Set(storage.getStudents().map(s => s.code.trim()));
    const seenCodesInFile = new Set<string>();
    const gradeCache = new Map<string, string | null>();
    const rows: ParsedRow[] = [];

    const CHUNK = 500;
    for (let start = 0; start < totalRaw; start += CHUNK) {
      const end = Math.min(start + CHUNK, totalRaw);

      for (let i = start; i < end; i++) {
        const row = rawMatrix[i];
        if (!row || row.length === 0 || (row.length === 1 && !row[0])) continue;

        const firstCol = String(row[0] ?? '').trim();
        if (firstCol.includes('كود') || firstCol.toLowerCase().includes('code')) {
          continue;
        }

        const rawCode = toLatinDigits(firstCol).trim();
        const rawName = String(row[1] ?? '').trim();
        const rawGrade = String(row[2] ?? '').trim();
        const rawClassNum = parseInt(toLatinDigits(String(row[3] ?? '1')), 10) || 1;
        const rawPhone = toLatinDigits(String(row[4] ?? '')).trim();

        let status: ParsedRow['status'] = 'valid';
        let message = 'جاهز للاعتماد';

        if (!rawCode) {
          status = 'error';
          message = 'كود الطالب مطلوب';
        } else if (seenCodesInFile.has(rawCode)) {
          status = 'error';
          message = 'كود مكرر داخل نفس الملف';
        } else if (existingCodesSet.has(rawCode)) {
          status = 'exists';
          message = 'كود مسجل مسبقاً بالنظام (سيتم تخطيه)';
        }
        seenCodesInFile.add(rawCode);

        if (status !== 'error' && (!rawName || rawName.length < 3)) {
          status = 'error';
          message = 'اسم الطالب يجب أن يكون 3 أحرف على الأقل';
        }

        let normalizedGrade = gradeCache.get(rawGrade);
        if (normalizedGrade === undefined) {
          normalizedGrade = normalizeGradeName(rawGrade, allowedGrades);
          gradeCache.set(rawGrade, normalizedGrade);
        }

        let finalGrade = normalizedGrade || rawGrade;
        if (status !== 'error' && !normalizedGrade) {
          if (status === 'valid') {
            status = 'warning';
            message = `صف دراسي غير مطابق تماماً (مقترح: ${allowedGrades[0]})`;
          }
          finalGrade = allowedGrades[0];
        }

        let finalPhone = rawPhone;
        if (status !== 'error') {
          const phoneCheck = cleanEgyptianPhone(rawPhone);
          if (!phoneCheck.isValid) {
            status = 'error';
            message = phoneCheck.error || 'رقم هاتف غير صحيح';
          } else {
            finalPhone = phoneCheck.cleaned;
          }
        }

        rows.push({
          index: rows.length + 1,
          code: rawCode,
          name: rawName,
          grade: finalGrade,
          classNumber: rawClassNum,
          phone: finalPhone,
          status,
          message,
          rawGrade
        });
      }

      setBusyProgress({ phase: 'parsing', processed: end, total: totalRaw });
      if (end < totalRaw) {
        await new Promise<void>(r => setTimeout(r, 0));
      }
    }

    setBusyProgress(null);
    if (rows.length === 0) {
      setBulkNotice('لم يتم العثور على صفوف بيانات صالحة للتحليل.');
      return;
    }

    setParsedRows(rows);
    setPreviewFilter('all');
  };

  // Upload File Handler using ArrayBuffer for fast large-file reading
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkNotice('');
    setBusyProgress({ phase: 'reading', processed: 0, total: 1 });

    const reader = new FileReader();
    reader.onload = (evt) => {
      // Yield once so the spinner renders before XLSX parses large workbooks
      setTimeout(() => {
        try {
          const buf = evt.target?.result;
          const wb = XLSX.read(buf, { type: 'array' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
          void parseRawRowsAsync(data);
        } catch {
          setBusyProgress(null);
          setBulkNotice('حدث خطأ أثناء قراءة ملف Excel. تأكد من سلامة الملف.');
        }
      }, 20);
    };
    reader.onerror = () => {
      setBusyProgress(null);
      setBulkNotice('تعذر فتح الملف المحدد.');
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Paste Text Handler
  const handleParsePaste = () => {
    if (!pasteText.trim()) {
      setBulkNotice('يرجى لصق البيانات أولاً.');
      return;
    }
    const lines = pasteText.trim().split(/\r?\n/);
    const matrix = lines.map(line => {
      if (line.includes('\t')) return line.split('\t').map(c => c.trim());
      if (line.includes('|')) return line.split('|').map(c => c.trim());
      if (line.includes(';') || line.includes('؛')) return line.split(/[;؛]/).map(c => c.trim());
      if (line.includes(',') || line.includes('،')) return line.split(/[,،]/).map(c => c.trim());
      return [line.trim()];
    });
    void parseRawRowsAsync(matrix);
  };

  // Fast single-row re-validation on edit
  const handleUpdateRowCell = (idx: number, field: keyof ParsedRow, value: string | number) => {
    const existingCodes = new Set(storage.getStudents().map(s => s.code.trim()));
    setParsedRows(prev => {
      const next = [...prev];
      const updated = { ...next[idx], [field]: value };

      const cleanCode = toLatinDigits(String(updated.code)).trim();
      const cleanName = String(updated.name).trim();
      const phoneCheck = cleanEgyptianPhone(String(updated.phone));

      if (!cleanCode) {
        updated.status = 'error';
        updated.message = 'كود الطالب مطلوب';
      } else if (existingCodes.has(cleanCode)) {
        updated.status = 'exists';
        updated.message = 'كود مسجل مسبقاً بالنظام (سيتم تخطيه)';
      } else if (!cleanName || cleanName.length < 3) {
        updated.status = 'error';
        updated.message = 'اسم الطالب يجب أن يكون 3 أحرف على الأقل';
      } else if (!phoneCheck.isValid) {
        updated.status = 'error';
        updated.message = phoneCheck.error || 'رقم هاتف غير صحيح';
      } else {
        updated.status = 'valid';
        updated.message = 'جاهز للاعتماد';
        updated.phone = phoneCheck.cleaned;
      }

      next[idx] = updated;
      return next;
    });
  };

  const handleDeleteRow = (idx: number) => {
    setParsedRows(prev => prev.filter((_, i) => i !== idx));
  };

  // High-scale Async Bulk Confirm (10,000+ rows)
  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter(r => r.status === 'valid' || r.status === 'warning');
    if (validRows.length === 0) {
      setBulkNotice('لا توجد صفوف صالحة للاعتماد.');
      return;
    }

    setBulkNotice('');
    setBusyProgress({ phase: 'saving', processed: 0, total: validRows.length });

    const payload = validRows.map(r => ({
      code: r.code,
      name: r.name,
      grade: r.grade,
      classNumber: r.classNumber,
      parentPhone: r.phone,
      status: 'active' as const
    }));

    const res = await storage.saveStudentsBulkAsync(payload, (processed, total) => {
      setBusyProgress({ phase: 'saving', processed, total });
    });

    setBusyProgress(null);
    setImportSummary({
      total: parsedRows.length,
      added: res.addedCount,
      parentsCreated: res.parentsCreated,
      skipped: parsedRows.length - res.addedCount
    });
    setParsedRows([]);
    setPasteText('');
    onSuccess();
  };

  // Download Errors File
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

  const progressPct =
    busyProgress && busyProgress.total > 0
      ? Math.min(100, Math.round((busyProgress.processed / busyProgress.total) * 100))
      : 0;

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
                يدعم استيراد عشرات الآلاف من الطلاب (Excel / CSV / لصق مباشر) بدون تعليق
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={!!busyProgress}
            className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3 Tabs */}
        <div className="flex items-center bg-slate-100 p-2 border-b border-slate-200 text-xs font-bold gap-2">
          <button
            type="button"
            disabled={!!busyProgress}
            onClick={() => {
              setActiveTab('manual');
              setBulkNotice('');
              if (importSummary) setImportSummary(null);
            }}
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
            type="button"
            disabled={!!busyProgress}
            onClick={() => {
              setActiveTab('upload');
              setBulkNotice('');
              if (importSummary) setImportSummary(null);
            }}
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
            type="button"
            disabled={!!busyProgress}
            onClick={() => {
              setActiveTab('paste');
              setBulkNotice('');
              if (importSummary) setImportSummary(null);
            }}
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
          {/* Progress Banner */}
          {busyProgress && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-[#163A6B]">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#1F4E8C]" />
                  <span>
                    {busyProgress.phase === 'reading' && 'جاري قراءة وفك ضغط ملف Excel...'}
                    {busyProgress.phase === 'parsing' &&
                      `جاري فحص والتحقق من الصفوف (${busyProgress.processed.toLocaleString()} / ${busyProgress.total.toLocaleString()})...`}
                    {busyProgress.phase === 'saving' &&
                      `جاري حفظ الطلاب وإنشاء حسابات أولياء الأمور (${busyProgress.processed.toLocaleString()} / ${busyProgress.total.toLocaleString()})...`}
                  </span>
                </div>
                {busyProgress.phase !== 'reading' && <span>{progressPct}%</span>}
              </div>
              <div className="w-full h-2.5 bg-blue-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#1F4E8C] transition-all duration-150"
                  style={{ width: `${busyProgress.phase === 'reading' ? 30 : progressPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Tab 1: Manual Addition */}
          {activeTab === 'manual' && !importSummary && (
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

          {/* Tab 2: Upload Excel/CSV */}
          {activeTab === 'upload' && !importSummary && (
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

              <div className="border-2 border-dashed border-slate-300 hover:border-[#1F4E8C] rounded-3xl p-8 text-center bg-slate-50/50 transition">
                <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">
                  اختر ملف Excel (XLSX أو CSV) يدعم 10,000+ طالب بسرعة عالية
                </p>
                <p className="text-[11px] text-slate-400 mt-1 mb-4">
                  يُقرأ أول شيت ويتجاهل الصف الأول إن كان عناوين
                </p>
                <label className="px-5 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 rounded-xl text-xs font-bold cursor-pointer inline-block shadow-2xs">
                  <span>تصفح الملفات من جهازك</span>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileUpload}
                    disabled={!!busyProgress}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          )}

          {/* Tab 3: Paste from Excel */}
          {activeTab === 'paste' && !importSummary && (
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
                disabled={!!busyProgress}
                className="py-2.5 px-6 bg-[#1F4E8C] text-white rounded-xl text-xs font-bold hover:bg-[#163A6B] disabled:opacity-50"
              >
                تحليل الصفوف وعرض المعاينة
              </button>
            </div>
          )}

          {bulkNotice && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{bulkNotice}</span>
            </div>
          )}

          {/* Paginated Preview Table & Validation */}
          {parsedRows.length > 0 && !importSummary && (
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    جدول معاينة وتحقق الصفوف ({parsedRows.length.toLocaleString()} صف)
                  </h4>
                  <p className="text-xs text-slate-500">
                    يتم عرض كافة الصفوف ({filteredIndices.length.toLocaleString()}) بسلاسة مع التمرير التلقائي للمعاينة والتعديل
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('all')}
                    className={`px-2.5 py-1 rounded-full font-bold transition ${
                      previewFilter === 'all'
                        ? 'bg-[#1F4E8C] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    الكل ({parsedRows.length.toLocaleString()})
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewFilter('valid')}
                    className={`px-2.5 py-1 rounded-full font-bold transition ${
                      previewFilter === 'valid'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    }`}
                  >
                    الصالحة ({validCount.toLocaleString()})
                  </button>
                  {(errorCount > 0 || existsCount > 0) && (
                    <button
                      type="button"
                      onClick={() => setPreviewFilter('issues')}
                      className={`px-2.5 py-1 rounded-full font-bold transition ${
                        previewFilter === 'issues'
                          ? 'bg-rose-600 text-white'
                          : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                      }`}
                    >
                      أخطاء / مكررات ({(errorCount + existsCount).toLocaleString()})
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto max-h-72 border border-slate-200 rounded-2xl">
                <table className="w-full text-xs text-right divide-y divide-slate-200">
                  <thead className="bg-slate-100 font-bold text-slate-700 sticky top-0 z-10">
                    <tr>
                      <th className="p-2.5">#</th>
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
                    {visibleRowIndices.map(idx => {
                      const row = parsedRows[idx];
                      return (
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
                          <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
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

                          <td className="p-2.5 font-mono">
                            <input
                              type="text"
                              value={row.code}
                              onChange={(e) => handleUpdateRowCell(idx, 'code', e.target.value)}
                              className="w-20 px-2 py-1 rounded border border-slate-200 text-xs"
                            />
                          </td>

                          <td className="p-2.5">
                            <input
                              type="text"
                              value={row.name}
                              onChange={(e) => handleUpdateRowCell(idx, 'name', e.target.value)}
                              className="w-36 px-2 py-1 rounded border border-slate-200 text-xs"
                            />
                          </td>

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

                          <td className="p-2.5">
                            <input
                              type="number"
                              min="1"
                              value={row.classNumber}
                              onChange={(e) => handleUpdateRowCell(idx, 'classNumber', parseInt(e.target.value) || 1)}
                              className="w-14 px-2 py-1 rounded border border-slate-200 text-xs"
                            />
                          </td>

                          <td className="p-2.5 font-mono">
                            <input
                              type="text"
                              value={row.phone}
                              onChange={(e) => handleUpdateRowCell(idx, 'phone', e.target.value)}
                              className="w-28 px-2 py-1 rounded border border-slate-200 text-xs"
                            />
                          </td>

                          <td className="p-2.5 text-[11px] text-slate-600 max-w-xs truncate" title={row.message}>
                            {row.message}
                          </td>

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
                      );
                    })}
                  </tbody>
                </table>
                {hasMorePreview && <div ref={previewSentinelRef} className="h-4" />}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex gap-2">
                  {(errorCount > 0 || existsCount > 0) && (
                    <button
                      type="button"
                      onClick={handleDownloadErrors}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition"
                    >
                      <Download className="w-4 h-4" />
                      <span>تحميل ملف الأخطاء والمكررات (Excel)</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void handleConfirmImport()}
                  disabled={validCount === 0 || !!busyProgress}
                  className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition"
                >
                  اعتماد الصفوف الصالحة ({validCount.toLocaleString()} طالب)
                </button>
              </div>
            </div>
          )}

          {/* Import Summary */}
          {importSummary && (
            <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-3">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                <span>اكتمل الاستيراد الجماعي للطلاب بنجاح!</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-emerald-100">
                  <span className="text-slate-500 block">الطلاب المضافون:</span>
                  <strong className="text-emerald-700 text-base">{importSummary.added.toLocaleString()}</strong>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-100">
                  <span className="text-slate-500 block">حسابات أولياء الأمور:</span>
                  <strong className="text-blue-700 text-base">{importSummary.parentsCreated.toLocaleString()}</strong>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-100">
                  <span className="text-slate-500 block">الصفوف المتخطاة:</span>
                  <strong className="text-amber-700 text-base">{importSummary.skipped.toLocaleString()}</strong>
                </div>
                <div className="bg-white p-3 rounded-xl border border-emerald-100">
                  <span className="text-slate-500 block">إجمالي المفحوص:</span>
                  <strong className="text-slate-700 text-base">{importSummary.total.toLocaleString()}</strong>
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
