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
  Copy,
  Key,
  Loader2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Teacher } from '../../types';
import { storage } from '../../services/storage';
import { cleanEgyptianPhone, toLatinDigits, normalizeSubjectName } from '../../utils/arabic';
import { useProgressiveCount } from '../common/VirtualList';

export interface CreatedTeacherCred {
  teacher: Teacher;
  username: string;
  tempPassword: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ParsedTeacherRow {
  index: number;
  name: string;
  subject: string;
  phone: string;
  status: 'valid' | 'warning' | 'error' | 'exists';
  message: string;
}

export const AddTeacherModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [activeTab, setActiveTab] = useState<'manual' | 'upload' | 'paste'>('manual');

  // Manual form state
  const [manualName, setManualName] = useState('');
  const [manualSubject, setManualSubject] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualError, setManualError] = useState('');
  const [manualSuccess, setManualSuccess] = useState('');

  // Bulk Import / Paste state
  const [pasteText, setPasteText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedTeacherRow[]>([]);
  const [bulkNotice, setBulkNotice] = useState('');
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'issues'>('all');

  // Async Progress state for 10,000+ rows
  const [busyProgress, setBusyProgress] = useState<{
    phase: 'reading' | 'parsing' | 'saving';
    processed: number;
    total: number;
  } | null>(null);

  // Created Credentials Summary
  const [createdCreds, setCreatedCreds] = useState<CreatedTeacherCred[]>([]);
  const [importSummary, setImportSummary] = useState<{
    total: number;
    added: number;
    skipped: number;
  } | null>(null);
  const [copiedFlag, setCopiedFlag] = useState(false);

  const settings = storage.getSettings();
  const allowedSubjects = settings.subjects;
  const allowedSubjectSet = useMemo(() => new Set(allowedSubjects), [allowedSubjects]);

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

  const {
    visibleCount: visibleCredsCount,
    hasMore: hasMoreCreds,
    sentinelRef: credsSentinelRef
  } = useProgressiveCount(createdCreds.length, 100, 150, `${isOpen}_${createdCreds.length}`);

  if (!isOpen) return null;

  const visibleRowIndices = filteredIndices.slice(0, visiblePreviewCount);
  const visibleCreds = createdCreds.slice(0, visibleCredsCount);

  // Tab 1: Manual single / consecutive add
  const handleManualAdd = (addAnother: boolean) => {
    setManualError('');
    setManualSuccess('');

    const resolvedSubject = manualSubject === '__custom__' ? customSubject.trim() : manualSubject.trim();

    if (!manualName.trim() || manualName.trim().length < 3) {
      setManualError('يرجى إدخال اسم المعلم (3 أحرف على الأقل)');
      return;
    }

    if (!resolvedSubject) {
      setManualError('يرجى اختيار أو كتابة المادة التعليمية');
      return;
    }

    let cleanedPhone: string | undefined;
    if (manualPhone.trim()) {
      const phoneCheck = cleanEgyptianPhone(manualPhone.trim());
      if (!phoneCheck.isValid) {
        setManualError(phoneCheck.error || 'رقم الهاتف غير صحيح');
        return;
      }
      cleanedPhone = phoneCheck.cleaned;
    }

    const latestTeachers = storage.getTeachers();
    if (
      latestTeachers.some(
        t =>
          t.name.trim().toLowerCase() === manualName.trim().toLowerCase() &&
          t.subject.trim().toLowerCase() === resolvedSubject.toLowerCase()
      )
    ) {
      setManualError('يوجد معلم مسجل مسبقاً بنفس الاسم والمادة التعليمية!');
      return;
    }

    const res = storage.saveTeacher({
      name: manualName.trim(),
      subject: resolvedSubject,
      phone: cleanedPhone
    });

    const newCred: CreatedTeacherCred = {
      teacher: res.teacher,
      username: res.username,
      tempPassword: res.tempPassword
    };

    setCreatedCreds(prev => [...prev, newCred]);
    onSuccess();

    if (addAnother) {
      setManualSuccess(
        `تم حفظ المعلم «${res.teacher.name}» بنجاح — كود الدخول: ${res.username} | كلمة المرور: ${res.tempPassword}`
      );
      setManualName('');
      setManualPhone('');
    } else {
      setImportSummary({
        total: 1,
        added: 1,
        skipped: 0
      });
      setManualName('');
      setManualPhone('');
    }
  };

  // Download Ready Excel Template
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    const templateData = [
      ['اسم المعلم', 'المادة التعليمية', 'رقم الهاتف (اختياري)'],
      ['أ. محمود حسني عبد الله', 'لغة عربية', '01012345678'],
      ['أ. سارة خالد إبراهيم', 'لغة إنجليزية', '01198765432'],
      ['أ. كريم عادل محمد', 'رياضيات', '']
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(templateData);

    const instructionsData = [
      ['اسم العمود', 'الوصف والقواعد'],
      ['اسم المعلم', 'اسم المعلم ثلاثي أو رباعي (إجباري - 3 أحرف على الأقل)'],
      ['المادة التعليمية', `يفضل استخدام أحد المسميات المعتمدة: ${allowedSubjects.join(' - ')}`],
      ['رقم الهاتف', 'اختياري - إن وجد يجب أن يكون رقم محمول مصري من 11 رقماً (010 / 011 / 012 / 015)'],
      ['بيانات الدخول', 'يتم توليد اسم مستخدم تلقائي لكل معلم (TEACHER_XXXX) وكلمة مرور مؤقتة (NPS@1234)']
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(instructionsData);

    XLSX.utils.book_append_sheet(wb, ws1, 'قالب المعلمين');
    XLSX.utils.book_append_sheet(wb, ws2, 'تعليمات الاستيراد');

    XLSX.writeFile(wb, 'NPS_Teachers_Template.xlsx');
  };

  // Async Chunked Parser for 10,000+ teachers without UI freeze
  const parseRawRowsAsync = async (rawMatrix: unknown[][]) => {
    setBulkNotice('');
    setImportSummary(null);
    setParsedRows([]);

    const totalRaw = rawMatrix.length;
    if (totalRaw === 0) {
      setBulkNotice('لم يتم العثور على صفوف بيانات صالحة للتحليل.');
      return;
    }

    setBusyProgress({ phase: 'parsing', processed: 0, total: totalRaw });
    await new Promise<void>(r => setTimeout(r, 0));

    // O(1) lookups built once
    const existingKeysSet = new Set(
      storage
        .getTeachers()
        .map(t => `${t.name.trim().toLowerCase()}||${t.subject.trim().toLowerCase()}`)
    );
    const seenInBatch = new Set<string>();
    const subjectCache = new Map<string, string | null>();
    const rows: ParsedTeacherRow[] = [];

    const CHUNK = 500;
    for (let start = 0; start < totalRaw; start += CHUNK) {
      const end = Math.min(start + CHUNK, totalRaw);

      for (let i = start; i < end; i++) {
        const row = rawMatrix[i];
        if (!row || row.length === 0) continue;
        const nonEmpty = row.some(cell => String(cell ?? '').trim() !== '');
        if (!nonEmpty) continue;

        const c0 = String(row[0] ?? '').trim();
        const c1 = String(row[1] ?? '').trim();

        const headerSignature = `${c0} ${c1}`.toLowerCase();
        if (
          c0 === 'م' ||
          c0 === '#' ||
          c0.includes('مسلسل') ||
          c0.includes('اسم المعلم') ||
          c0 === 'الاسم' ||
          headerSignature.includes('teacher') ||
          headerSignature.includes('المادة')
        ) {
          continue;
        }

        const isSerialCol = /^\d{1,5}$/.test(toLatinDigits(c0)) && row.length >= 3 && /[أ-يa-zA-Z]/.test(c1);
        const offset = isSerialCol ? 1 : 0;

        const name = String(row[offset] ?? '').trim().replace(/\s+/g, ' ');
        const cleanedSubjectRaw = String(row[offset + 1] ?? '').trim().replace(/\s+/g, ' ');
        const phoneDigits = toLatinDigits(String(row[offset + 2] ?? '')).trim();

        let status: ParsedTeacherRow['status'] = 'valid';
        let message = 'جاهز للاعتماد';

        if (!name || name.length < 3) {
          rows.push({
            index: rows.length + 1,
            name,
            subject: cleanedSubjectRaw || allowedSubjects[0] || '',
            phone: phoneDigits,
            status: 'error',
            message: 'اسم المعلم يجب أن يكون 3 أحرف على الأقل'
          });
          continue;
        }

        let matchedSubject = subjectCache.get(cleanedSubjectRaw);
        if (matchedSubject === undefined) {
          matchedSubject = normalizeSubjectName(cleanedSubjectRaw, allowedSubjects);
          subjectCache.set(cleanedSubjectRaw, matchedSubject);
        }

        let finalSubject = matchedSubject || cleanedSubjectRaw;
        if (!cleanedSubjectRaw) {
          status = 'error';
          message = 'المادة التعليمية مطلوبة';
          finalSubject = allowedSubjects[0] || '';
        } else if (!matchedSubject) {
          status = 'warning';
          message = `مادة مخصصة «${cleanedSubjectRaw}» (غير مدرجة في الإعدادات - سيتم اعتمادها)`;
        }

        const dupKey = `${name.toLowerCase()}||${finalSubject.toLowerCase()}`;
        if (status !== 'error') {
          if (seenInBatch.has(dupKey)) {
            status = 'error';
            message = 'معلم مكرر بنفس الاسم والمادة داخل الدفعة';
          } else if (existingKeysSet.has(dupKey)) {
            status = 'exists';
            message = 'مسجل مسبقاً بالنظام بنفس الاسم والمادة (سيتم تخطيه)';
          }
          seenInBatch.add(dupKey);
        }

        let finalPhone = phoneDigits;
        if (status !== 'error' && phoneDigits) {
          const phoneCheck = cleanEgyptianPhone(phoneDigits);
          if (!phoneCheck.isValid) {
            status = 'error';
            message = phoneCheck.error || 'رقم الهاتف غير صحيح (يجب أن يكون 11 رقم مصري)';
          } else {
            finalPhone = phoneCheck.cleaned;
          }
        }

        rows.push({
          index: rows.length + 1,
          name,
          subject: finalSubject,
          phone: finalPhone,
          status,
          message
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

  // Tab 2: Upload Excel / CSV using ArrayBuffer
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkNotice('');
    setBusyProgress({ phase: 'reading', processed: 0, total: 1 });

    const reader = new FileReader();
    reader.onload = (evt) => {
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
          setBulkNotice('تعذر قراءة الملف. تأكد من أنه ملف Excel (.xlsx / .xls) أو CSV صالح.');
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

  // Tab 3: Paste from Excel or multi-line quick entry
  const handleParsePaste = () => {
    if (!pasteText.trim()) {
      setBulkNotice('يرجى لصق البيانات أو كتابة أسماء المعلمين أولاً.');
      return;
    }

    const lines = pasteText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    const matrix = lines.map(line => {
      if (line.includes('\t')) return line.split('\t').map(c => c.trim());
      if (line.includes('|')) return line.split('|').map(c => c.trim());
      if (line.includes('؛') || line.includes(';')) return line.split(/[؛;]/).map(c => c.trim());
      if (line.includes(',') || line.includes('،')) return line.split(/[,،]/).map(c => c.trim());
      return [line];
    });

    void parseRawRowsAsync(matrix);
  };

  // Fast single-row re-validation on edit (O(1) without blocking 10k rows)
  const handleUpdateRowCell = (idx: number, field: 'name' | 'subject' | 'phone', value: string) => {
    const existingKeys = new Set(
      storage
        .getTeachers()
        .map(t => `${t.name.trim().toLowerCase()}||${t.subject.trim().toLowerCase()}`)
    );

    setParsedRows(prev => {
      const next = [...prev];
      const updated = { ...next[idx], [field]: value };

      const cleanName = updated.name.trim().replace(/\s+/g, ' ');
      const cleanSubj = updated.subject.trim().replace(/\s+/g, ' ');
      const cleanPhoneDigits = toLatinDigits(updated.phone || '').trim();

      if (!cleanName || cleanName.length < 3) {
        updated.status = 'error';
        updated.message = 'اسم المعلم يجب أن يكون 3 أحرف على الأقل';
      } else if (!cleanSubj) {
        updated.status = 'error';
        updated.message = 'المادة التعليمية مطلوبة';
      } else if (existingKeys.has(`${cleanName.toLowerCase()}||${cleanSubj.toLowerCase()}`)) {
        updated.status = 'exists';
        updated.message = 'مسجل مسبقاً بالنظام بنفس الاسم والمادة (سيتم تخطيه)';
      } else if (cleanPhoneDigits) {
        const phoneCheck = cleanEgyptianPhone(cleanPhoneDigits);
        if (!phoneCheck.isValid) {
          updated.status = 'error';
          updated.message = phoneCheck.error || 'رقم الهاتف غير صحيح';
        } else {
          updated.phone = phoneCheck.cleaned;
          updated.status = allowedSubjectSet.has(cleanSubj) ? 'valid' : 'warning';
          updated.message =
            updated.status === 'valid'
              ? 'جاهز للاعتماد'
              : `مادة مخصصة «${cleanSubj}» (غير مدرجة في الإعدادات - سيتم اعتمادها)`;
        }
      } else {
        updated.status = allowedSubjectSet.has(cleanSubj) ? 'valid' : 'warning';
        updated.message =
          updated.status === 'valid'
            ? 'جاهز للاعتماد'
            : `مادة مخصصة «${cleanSubj}» (غير مدرجة في الإعدادات - سيتم اعتمادها)`;
      }

      next[idx] = updated;
      return next;
    });
  };

  const handleDeleteRow = (idx: number) => {
    setParsedRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter(r => r.status === 'valid' || r.status === 'warning');
    if (validRows.length === 0) {
      setBulkNotice('لا توجد صفوف صالحة للاعتماد.');
      return;
    }

    setBulkNotice('');
    setBusyProgress({ phase: 'saving', processed: 0, total: validRows.length });

    const payload = validRows.map(r => ({
      name: r.name,
      subject: r.subject,
      phone: r.phone || undefined
    }));

    const res = await storage.saveTeachersBulkAsync(payload, (processed, total) => {
      setBusyProgress({ phase: 'saving', processed, total });
    });

    setBusyProgress(null);
    setCreatedCreds(res.added);
    setImportSummary({
      total: parsedRows.length,
      added: res.added.length,
      skipped: parsedRows.length - res.added.length
    });
    setParsedRows([]);
    setPasteText('');
    onSuccess();
  };

  const handleDownloadErrors = () => {
    const errorRows = parsedRows.filter(r => r.status === 'error' || r.status === 'exists');
    if (errorRows.length === 0) return;

    const data = [
      ['اسم المعلم', 'المادة التعليمية', 'رقم الهاتف', 'سبب الملاحظة / الخطأ'],
      ...errorRows.map(r => [r.name, r.subject, r.phone, r.message])
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'صفوف مرفوضة');
    XLSX.writeFile(wb, 'NPS_Rejected_Teachers.xlsx');
  };

  const handleCopyAllCreds = () => {
    if (createdCreds.length === 0) return;
    const text = createdCreds
      .map(
        c =>
          `المعلم: ${c.teacher.name} | المادة: ${c.teacher.subject} | اسم المستخدم: ${c.username} | كلمة المرور: ${c.tempPassword}`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopiedFlag(true);
    setTimeout(() => setCopiedFlag(false), 2500);
  };

  const handleDownloadCredsExcel = () => {
    if (createdCreds.length === 0) return;
    const data = [
      ['اسم المعلم', 'المادة التعليمية', 'رقم الهاتف', 'اسم المستخدم', 'كلمة المرور المؤقتة'],
      ...createdCreds.map(c => [
        c.teacher.name,
        c.teacher.subject,
        c.teacher.phone || '',
        c.username,
        c.tempPassword
      ])
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'بيانات دخول المعلمين');
    XLSX.writeFile(wb, `NPS_Teachers_Credentials_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
              <h3 className="font-bold text-base sm:text-lg">إضافة واستيراد المعلمين</h3>
              <p className="text-xs text-blue-100">
                يدعم إضافة عشرات الآلاف من المعلمين (يدوي، ملف Excel/CSV، أو لصق دفعة واحدة) بدون تعليق
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
              if (importSummary) {
                setImportSummary(null);
                setCreatedCreds([]);
              }
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
              if (importSummary) {
                setImportSummary(null);
                setCreatedCreds([]);
              }
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
              if (importSummary) {
                setImportSummary(null);
                setCreatedCreds([]);
              }
            }}
            className={`flex-1 py-2.5 rounded-xl transition flex items-center justify-center gap-2 ${
              activeTab === 'paste'
                ? 'bg-white text-[#1F4E8C] shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clipboard className="w-4 h-4" />
            <span>لصق من Excel / دفعة واحدة</span>
          </button>
        </div>

        {/* Content */}
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
                      `جاري حفظ المعلمين وإصدار حسابات الدخول (${busyProgress.processed.toLocaleString()} / ${busyProgress.total.toLocaleString()})...`}
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
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اسم المعلم <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    placeholder="مثال: أ. محمود حسني عبد الله"
                    className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 outline-hidden focus:border-[#1F4E8C]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    المادة التعليمية والتخصص <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={manualSubject}
                    onChange={(e) => setManualSubject(e.target.value)}
                    className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 outline-hidden bg-white focus:border-[#1F4E8C]"
                  >
                    <option value="">-- اختر المادة --</option>
                    {allowedSubjects.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                    <option value="__custom__">+ كتابة مادة أخرى...</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    رقم الهاتف (اختياري)
                  </label>
                  <input
                    type="tel"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                    placeholder="مثال: 01012345678"
                    className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 font-mono outline-hidden focus:border-[#1F4E8C]"
                  />
                </div>

                {manualSubject === '__custom__' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      اكتب اسم المادة التعليمية <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={customSubject}
                      onChange={(e) => setCustomSubject(e.target.value)}
                      placeholder="مثال: فيزياء / تربية فنية / ألماني..."
                      className="w-full px-3 py-2.5 text-xs rounded-xl border border-slate-300 outline-hidden focus:border-[#1F4E8C]"
                    />
                  </div>
                )}
              </div>

              <div className="p-3 bg-blue-50/70 rounded-xl text-[11px] text-blue-900 leading-relaxed">
                يتم توليد اسم مستخدم فريد تلقائياً (<span className="font-mono font-bold">TEACHER_XXXX</span>) وكلمة مرور مؤقتة (<span className="font-mono font-bold">NPS@1234</span>) فور الحفظ.
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => handleManualAdd(false)}
                  className="flex-1 py-3 bg-[#1F4E8C] text-white rounded-xl text-xs font-bold hover:bg-[#163A6B] shadow-sm"
                >
                  حفظ المعلم وإصدار بيانات الدخول
                </button>
                <button
                  type="button"
                  onClick={() => handleManualAdd(true)}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 shadow-sm"
                >
                  حفظ وإضافة معلم آخر
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Upload Excel / CSV */}
          {activeTab === 'upload' && !importSummary && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-200">
                <div>
                  <h4 className="text-sm font-bold text-[#163A6B]">تحميل قالب Excel الجاهز لاستيراد المعلمين</h4>
                  <p className="text-xs text-slate-600 mt-0.5">
                    الأعمدة المطلوبة: اسم المعلم | المادة التعليمية | رقم الهاتف (اختياري).
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
                  اختر ملف Excel (.xlsx / .xls) أو CSV — يدعم استيراد 10,000+ معلم بسرعة عالية
                </p>
                <p className="text-[11px] text-slate-400 mt-1 mb-4">
                  يُقرأ أول شيت تلقائياً مع تجاهل صف العناوين والرقم المسلسل إن وجد
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

          {/* Tab 3: Paste from Excel / Batch text */}
          {activeTab === 'paste' && !importSummary && (
            <div className="space-y-4">
              <div className="text-xs text-slate-700 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5">
                <div className="font-bold text-slate-900">
                  الصق الصفوف مباشرة من Excel أو اكتب المعلمين دفعة واحدة (سطر لكل معلم):
                </div>
                <div className="text-[11px] text-slate-600">
                  الترتيب: <span className="font-bold text-[#1F4E8C]">اسم المعلم</span> |{' '}
                  <span className="font-bold text-[#1F4E8C]">المادة التعليمية</span> |{' '}
                  <span className="text-slate-500">رقم الهاتف (اختياري)</span>
                </div>
                <div className="text-[11px] font-mono text-slate-500 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                  أ. محمود حسني | لغة عربية | 01012345678
                  <br />
                  أ. سارة خالد | لغة إنجليزية | 01198765432
                </div>
              </div>

              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="انسخ الصفوف من Excel والصقها هنا مباشرة، أو اكتب كل معلم في سطر مفصولاً بعلامة | أو فاصلة..."
                rows={6}
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

          {/* Paginated Preview & Validation Table */}
          {parsedRows.length > 0 && !importSummary && (
            <div className="pt-4 border-t border-slate-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">
                    جدول معاينة وتحقق المعلمين ({parsedRows.length.toLocaleString()} صف)
                  </h4>
                  <p className="text-xs text-slate-500">
                    يتم عرض كافة الصفوف ({filteredIndices.length.toLocaleString()}) بسلاسة مع التمرير التلقائي للتعديل والاعتماد
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
                      <th className="p-2.5">اسم المعلم</th>
                      <th className="p-2.5">المادة التعليمية</th>
                      <th className="p-2.5">رقم الهاتف</th>
                      <th className="p-2.5">ملاحظة التحقق</th>
                      <th className="p-2.5 text-center">حذف</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {visibleRowIndices.map(idx => {
                      const row = parsedRows[idx];
                      const subjectOptions =
                        allowedSubjectSet.has(row.subject) || !row.subject
                          ? allowedSubjects
                          : [row.subject, ...allowedSubjects];

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
                                مخصص
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

                          <td className="p-2.5">
                            <input
                              type="text"
                              value={row.name}
                              onChange={(e) => handleUpdateRowCell(idx, 'name', e.target.value)}
                              className="w-44 px-2 py-1 rounded border border-slate-200 text-xs"
                            />
                          </td>

                          <td className="p-2.5">
                            <select
                              value={row.subject}
                              onChange={(e) => handleUpdateRowCell(idx, 'subject', e.target.value)}
                              className="px-2 py-1 rounded border border-slate-200 text-xs bg-white"
                            >
                              <option value="">-- اختر المادة --</option>
                              {subjectOptions.map(s => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </td>

                          <td className="p-2.5 font-mono">
                            <input
                              type="text"
                              value={row.phone}
                              onChange={(e) => handleUpdateRowCell(idx, 'phone', e.target.value)}
                              placeholder="اختياري"
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

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex gap-2">
                  {(errorCount > 0 || existsCount > 0) && (
                    <button
                      type="button"
                      onClick={handleDownloadErrors}
                      className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-rose-700 font-bold text-xs flex items-center gap-1.5 transition"
                    >
                      <Download className="w-4 h-4" />
                      <span>تحميل الصفوف المرفوضة (Excel)</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void handleConfirmImport()}
                  disabled={validCount === 0 || !!busyProgress}
                  className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition"
                >
                  اعتماد وحفظ الصفوف الصالحة ({validCount.toLocaleString()} معلم)
                </button>
              </div>
            </div>
          )}

          {/* Credentials & Import Summary Panel */}
          {(importSummary || (activeTab === 'manual' && createdCreds.length > 0)) && (
            <div className="p-5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                  <Key className="w-5 h-5 text-emerald-600" />
                  <span>
                    {importSummary
                      ? `تم حفظ ${importSummary.added.toLocaleString()} معلم بنجاح وإصدار بيانات الدخول!`
                      : `بيانات الدخول الصادرة في هذه الجلسة (${createdCreds.length})`}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopyAllCreds}
                    className="px-3 py-1.5 bg-[#1F4E8C] hover:bg-[#163A6B] text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedFlag ? 'تم النسخ!' : 'نسخ جميع البيانات'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCredsExcel}
                    className="px-3 py-1.5 bg-white border border-emerald-300 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تصدير بيانات الدخول (Excel)</span>
                  </button>
                </div>
              </div>

              {importSummary && (
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div className="bg-white p-3 rounded-xl border border-emerald-100">
                    <span className="text-slate-500 block">المعلمون المضافون:</span>
                    <strong className="text-emerald-700 text-base">{importSummary.added.toLocaleString()}</strong>
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
              )}

              {visibleCreds.length > 0 && (
                <div className="space-y-2">
                  <div className="overflow-x-auto max-h-56 bg-white rounded-xl border border-emerald-200">
                    <table className="w-full text-xs text-right divide-y divide-slate-200">
                      <thead className="bg-emerald-100/70 font-bold text-emerald-900 sticky top-0">
                        <tr>
                          <th className="p-2.5">#</th>
                          <th className="p-2.5">اسم المعلم</th>
                          <th className="p-2.5">المادة</th>
                          <th className="p-2.5">اسم المستخدم</th>
                          <th className="p-2.5">كلمة المرور المؤقتة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {visibleCreds.map((c, i) => (
                          <tr key={i}>
                            <td className="p-2.5 text-slate-400 font-mono">
                              {i + 1}
                            </td>
                            <td className="p-2.5 font-bold text-slate-900">{c.teacher.name}</td>
                            <td className="p-2.5 text-slate-600">{c.teacher.subject}</td>
                            <td className="p-2.5 font-mono font-bold text-[#1F4E8C]">{c.username}</td>
                            <td className="p-2.5 font-mono font-bold text-emerald-700">{c.tempPassword}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {hasMoreCreds && <div ref={credsSentinelRef} className="h-4" />}
                  </div>
                </div>
              )}

              {importSummary && (
                <div className="pt-1 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setImportSummary(null);
                      setCreatedCreds([]);
                    }}
                    className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-50"
                  >
                    إضافة معلمين آخرين
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-2 bg-emerald-700 text-white rounded-xl text-xs font-bold hover:bg-emerald-800"
                  >
                    إغلاق ومتابعة
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
