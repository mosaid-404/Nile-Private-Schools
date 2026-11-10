import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA';
import { PWAInstallModal } from './PWAInstallModal';

interface Props {
  className?: string;
  variant?: 'primary' | 'secondary' | 'banner';
}

export const PWAInstallButton: React.FC<Props> = ({
  className = '',
  variant = 'primary'
}) => {
  const { isInstalled, isInstallable, isIOS } = usePWA();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // If running in standalone mode (already installed), hide button completely (INS-02)
  if (isInstalled) {
    return null;
  }

  // Show if installable, or if on iOS, or as a general helpful button
  const canShow = isInstallable || isIOS || true;
  if (!canShow) return null;

  if (variant === 'banner') {
    return (
      <>
        <div className="bg-gradient-to-l from-[#1F4E8C] to-[#163A6B] text-white p-3.5 px-4 rounded-xl flex items-center justify-between shadow-md mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
              <Download className="w-5 h-5 text-blue-200" />
            </div>
            <div>
              <p className="text-sm font-bold">تثبيت تطبيق NPS على هاتفك</p>
              <p className="text-xs text-blue-100">يعمل بدون متجر تطبيقات ويفتح بضغطة واحدة</p>
            </div>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 bg-white text-[#1F4E8C] text-xs font-bold rounded-lg shadow-xs hover:bg-blue-50 active:scale-95 transition-all shrink-0 mr-2"
          >
            تثبيت الآن
          </button>
        </div>
        <PWAInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  if (variant === 'secondary') {
    return (
      <>
        <button
          onClick={() => setIsModalOpen(true)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50/80 text-blue-800 text-xs font-semibold hover:bg-blue-100 transition-colors ${className}`}
        >
          <Download className="w-4 h-4" />
          <span>تثبيت التطبيق</span>
        </button>
        <PWAInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-700 to-[#1F4E8C] text-white text-xs font-bold shadow-sm hover:from-blue-800 hover:to-[#163A6B] transition-all ${className}`}
      >
        <Download className="w-4 h-4" />
        <span>تثبيت التطبيق</span>
      </button>
      <PWAInstallModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
