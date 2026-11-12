import React from 'react';
import { Download, Share2, PlusSquare, Smartphone, CheckCircle, X } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const PWAInstallModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { isInstallable, isIOS, install } = usePWA();

  if (!isOpen) return null;

  const handleInstallClick = async () => {
    const success = await install();
    if (success) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-100">
        {/* Header with Brand Gradient */}
        <div className="bg-gradient-to-l from-[#1F4E8C] to-[#163A6B] p-6 text-white text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="w-20 h-20 mx-auto mb-3 rounded-2xl bg-[#011242] shadow-lg flex items-center justify-center overflow-hidden border border-white/20">
            <img src="/icons/app-logo.png" alt="NPS" className="w-full h-full object-cover" />
          </div>

          <h2 className="text-xl font-bold">تثبيت تطبيق مدارس النيل</h2>
          <p className="text-xs text-blue-100 mt-1">تطبيق ويب تقدمي (PWA) فوري وسريع دون الحاجة لمتجر تطبيقات</p>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Benefits */}
          <div className="grid grid-cols-2 gap-3 text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>يعمل بدون إنترنت</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>إشعارات فورية للغياب</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>وصول سريع بضغطة زر</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>لا يستهلك مساحة الهاتف</span>
            </div>
          </div>

          {/* iOS Specific Instructions (INS-04) */}
          {isIOS ? (
            <div className="space-y-4 text-right">
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="flex items-center gap-2 text-amber-900 font-semibold text-sm mb-2">
                  <Smartphone className="w-4 h-4" />
                  <span>خطوات التثبيت على أجهزة iPhone و iPad:</span>
                </div>
                <ol className="space-y-3 text-xs text-slate-700 pr-4 list-decimal">
                  <li className="leading-relaxed">
                    اضغط على أيقونة <strong className="text-slate-900">المشاركة (Share <Share2 className="w-3.5 h-3.5 inline text-blue-600" />)</strong> في شريط متصفح Safari السفلي.
                  </li>
                  <li className="leading-relaxed">
                    مرر للأسفل واختر <strong className="text-slate-900">«إضافة إلى الشاشة الرئيسية» (<PlusSquare className="w-3.5 h-3.5 inline text-slate-700" /> Add to Home Screen)</strong>.
                  </li>
                  <li className="leading-relaxed">
                    اضغط على كلمة <strong className="text-slate-900">«إضافة» (Add)</strong> في أعلى الزاوية.
                  </li>
                </ol>
              </div>
              <p className="text-center text-xs text-slate-500">
                سيظهر التطبيق فوراً على شاشتك الرئيسية كأي تطبيق أصلي!
              </p>
            </div>
          ) : (
            /* Android & Chrome / Desktop Flow (INS-03) */
            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-600">
                ثبّت التطبيق الآن ليفتح مباشرة من شاشة هاتفك الرئيسية كأي تطبيق رسمي بحجم خفيف جداً.
              </p>

              <button
                onClick={handleInstallClick}
                className="w-full py-3.5 px-6 rounded-xl bg-[#1F4E8C] hover:bg-[#163A6B] active:scale-[0.98] text-white font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 transition-all text-base"
              >
                <Download className="w-5 h-5" />
                <span>تثبيت التطبيق الآن</span>
              </button>

              {!isInstallable && (
                <p className="text-xs text-slate-400">
                  إذا لم يظهر حوار التثبيت، افتح قائمة خيارات المتصفح (⋮) واختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
