import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building,
  Calendar,
  Lock,
  Bell,
  Database,
  Trash2,
  CheckCircle,
  Download,
  Upload,
  AlertTriangle,
  RefreshCw
} from 'lucide-react';
import { SchoolSettings } from '../../types';
import { storage } from '../../services/storage';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<SchoolSettings>(() => storage.getSettings());
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [showDeleteDemoModal, setShowDeleteDemoModal] = useState(false);

  // Form states
  const [schoolName, setSchoolName] = useState(settings.schoolName);
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '/icons/icon.svg');
  const [address, setAddress] = useState(settings.address);
  const [phone1, setPhone1] = useState(settings.phones[0] || '');
  const [phone2, setPhone2] = useState(settings.phones[1] || '');
  const [academicYear, setAcademicYear] = useState(settings.academicYear);
  const [editWindowHours, setEditWindowHours] = useState(settings.teacherEditWindowHours);
  const [absenceThreshold, setAbsenceThreshold] = useState(settings.absenceThreshold);
  const [forceParentPass, setForceParentPass] = useState(settings.forceParentPasswordChange);

  useEffect(() => {
    const onCloudSync = () => {
      const latest = storage.getSettings();
      setSettings(latest);
      setSchoolName(latest.schoolName);
      setLogoUrl(latest.logoUrl || '/icons/icon.svg');
      setAddress(latest.address);
      setPhone1(latest.phones[0] || '');
      setPhone2(latest.phones[1] || '');
      setAcademicYear(latest.academicYear);
      setEditWindowHours(latest.teacherEditWindowHours);
      setAbsenceThreshold(latest.absenceThreshold);
      setForceParentPass(latest.forceParentPasswordChange);
    };
    window.addEventListener('nps_cloud_sync', onCloudSync);
    return () => window.removeEventListener('nps_cloud_sync', onCloudSync);
  }, []);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('حجم الصورة يجب أن يكون أقل من 5 ميجابايت');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      const result = evt.target?.result as string;
      if (!result) return;

      // Keep SVGs or tiny images directly; compress larger raster images so Firestore 1MB limit is never exceeded
      if (file.type === 'image/svg+xml' && result.length < 150000) {
        setLogoUrl(result);
        storage.updateSettings({ logoUrl: result });
        window.dispatchEvent(new Event('nps_settings_updated'));
        return;
      }

      const img = new Image();
      img.onload = () => {
        const maxDim = 256;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/png');
        const finalUrl = compressed.length > 200000 ? canvas.toDataURL('image/jpeg', 0.8) : compressed;
        setLogoUrl(finalUrl);
        storage.updateSettings({ logoUrl: finalUrl });
        window.dispatchEvent(new Event('nps_settings_updated'));
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = storage.updateSettings({
      schoolName: schoolName.trim(),
      logoUrl: logoUrl || '/icons/icon.svg',
      address: address.trim(),
      phones: [phone1.trim(), phone2.trim()].filter(Boolean),
      academicYear: academicYear.trim(),
      teacherEditWindowHours: editWindowHours,
      absenceThreshold,
      forceParentPasswordChange: forceParentPass
    });
    setSettings(updated);
    window.dispatchEvent(new Event('nps_settings_updated'));
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  // Full backup JSON export
  const handleExportBackup = () => {
    const data = storage.exportAllData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NPS_Backup_${new Date().toISOString().substring(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Restore backup
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content && storage.importAllData(content)) {
        alert('تم استعادة النسخة الاحتياطية بنجاح!');
        window.location.reload();
      } else {
        alert('ملف النسخة الاحتياطية غير صالح.');
      }
    };
    reader.readAsText(file);
  };

  // Delete Demo Data (GEN-07)
  const handleDeleteDemoData = () => {
    storage.deleteDemoData();
    setShowDeleteDemoModal(false);
    alert('تم حذف كافة البيانات التجريبية بنجاح. النظام الآن نظيف وجاهز للإدخال الفعلي!');
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">إعدادات النظام العامة</h2>
          <p className="text-xs text-slate-500">
            تخصيص بيانات المدرسة، القواعد الأكاديمية، والنسخ الاحتياطي
          </p>
        </div>

        {savedSuccess && (
          <div className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1.5">
            <CheckCircle className="w-4 h-4" />
            <span>تم حفظ الإعدادات بنجاح!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6 text-right">
        {/* School Profile */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-[#1F4E8C] font-bold text-sm">
            <Building className="w-4 h-4" />
            <span>بيانات وهوية المدرسة (تظهر بالإيصالات والتقارير)</span>
          </div>

          {/* School Logo Upload */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="w-16 h-16 rounded-2xl bg-[#1F4E8C] p-2 flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
              <img src={logoUrl} alt="شعار المدرسة" className="w-full h-full object-contain" />
            </div>
            <div className="flex-1 space-y-2">
              <div className="text-xs font-bold text-slate-800">شعار المدرسة (اللوجو)</div>
              <p className="text-[11px] text-slate-500">يظهر في الشريط العلوي وصفحة الدخول والتقارير (يفضل PNG أو SVG بحجم أقل من 1 ميجابايت).</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="px-3 py-1.5 rounded-xl bg-[#1F4E8C] hover:bg-[#163A6B] text-white text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 transition">
                  <Upload className="w-3.5 h-3.5" />
                  <span>تغيير اللوجو</span>
                  <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                </label>
                {logoUrl !== '/icons/icon.svg' && (
                  <button
                    type="button"
                    onClick={() => setLogoUrl('/icons/icon.svg')}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition"
                  >
                    استعادة الافتراضي
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم المدرسة الرسمي</label>
              <input
                type="text"
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">العنوان</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف الأول</label>
              <input
                type="tel"
                value={phone1}
                onChange={(e) => setPhone1(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف الثاني</label>
              <input
                type="tel"
                value={phone2}
                onChange={(e) => setPhone2(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Academic & Attendance Rules */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-[#1F4E8C] font-bold text-sm">
            <Calendar className="w-4 h-4" />
            <span>قواعد الحضور والعام الدراسي</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مسمى العام الدراسي الحالي</label>
              <input
                type="text"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">مهلة تعديل المعلم للحضور (بالساعات)</label>
              <input
                type="number"
                min="1"
                value={editWindowHours}
                onChange={(e) => setEditWindowHours(parseInt(e.target.value) || 24)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                required
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">بعدها يكون التعديل للمالك فقط</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">حد التنبيه للغياب المتكرر (شهرياً)</label>
              <input
                type="number"
                min="1"
                value={absenceThreshold}
                onChange={(e) => setAbsenceThreshold(parseInt(e.target.value) || 3)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                required
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">إظهار تنبيه عند تجاوز هذا العدد</span>
            </div>
          </div>

          {/* Password Security setting (AUTH-10) */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2.5 text-xs text-slate-800 font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={forceParentPass}
                onChange={(e) => setForceParentPass(e.target.checked)}
                className="w-4 h-4 rounded text-[#1F4E8C]"
              />
              <span>إلزام أولياء الأمور بتغيير كلمة المرور المبدئية عند أول دخول إلى الحساب</span>
            </label>
          </div>
        </div>

        {/* Save button */}
        <div>
          <button
            type="submit"
            className="py-3 px-8 bg-[#1F4E8C] hover:bg-[#163A6B] text-white rounded-xl text-xs font-bold shadow-md transition"
          >
            حفظ كافة التعديلات
          </button>
        </div>
      </form>

      {/* Backup, Restore & Reset Section (GEN-07) */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 text-slate-800 font-bold text-sm">
          <Database className="w-4 h-4 text-[#1F4E8C]" />
          <span>النسخ الاحتياطي وإدارة البيانات التجريبية</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Backup Export */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <h4 className="text-xs font-bold text-slate-900">تصدير نسخة احتياطية كاملة (JSON)</h4>
            <p className="text-[11px] text-slate-500">
              تنزيل ملف يحتوي على كافة بيانات المدرسة، الطلاب، المعلمين، الحضور، والإيصالات.
            </p>
            <button
              onClick={handleExportBackup}
              className="px-4 py-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs"
            >
              <Download className="w-4 h-4" />
              <span>تنزيل النسخة الاحتياطية</span>
            </button>
          </div>

          {/* Backup Restore */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <h4 className="text-xs font-bold text-slate-900">استعادة نسخة احتياطية سابقة</h4>
            <p className="text-[11px] text-slate-500">
              رفع ملف النسخة الاحتياطية واسترجاع قاعدة البيانات كاملة.
            </p>
            <label className="px-4 py-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 shadow-2xs">
              <Upload className="w-4 h-4" />
              <span>اختيار ملف النسخة الاحتياطية</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportBackup}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Delete Demo Data Button (GEN-07) */}
        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-bold text-rose-700">حذف البيانات التجريبية (بدء التشغيل الفعلي)</h4>
            <p className="text-[11px] text-slate-500">
              يقوم بمسح كافة الطلاب والمعلمين والحصص والإيصالات التجريبية بضغطة زر واحدة، مع الإبقاء على حساب المالك والإعدادات.
            </p>
          </div>

          <button
            onClick={() => setShowDeleteDemoModal(true)}
            className="px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs flex items-center gap-1.5 shrink-0 transition"
          >
            <Trash2 className="w-4 h-4" />
            <span>حذف البيانات التجريبية بزر واحد</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Delete Demo Data */}
      {showDeleteDemoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-right shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="font-bold text-base text-slate-900 text-center">
              تأكيد حذف البيانات التجريبية
            </h3>

            <p className="text-xs text-slate-600 leading-relaxed text-center">
              هل أنت متأكد من رغبتك في مسح كافة الطلاب والمعلمين والحصص والإيصالات التجريبية؟
              <br />
              <strong className="text-rose-700">هذا الإجراء لا يمكن التراجع عنه.</strong>
            </p>

            <div className="flex gap-2 pt-2">
              <button
                onClick={handleDeleteDemoData}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition"
              >
                نعم، احذف وابدأ بنظام نظيف
              </button>
              <button
                onClick={() => setShowDeleteDemoModal(false)}
                className="py-2.5 px-4 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
