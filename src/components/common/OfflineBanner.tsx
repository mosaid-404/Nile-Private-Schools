import React from 'react';
import { WifiOff, RefreshCw, AlertTriangle, ArrowUpCircle } from 'lucide-react';
import { usePWA } from '../../hooks/usePWA';

export const OfflineBanner: React.FC = () => {
  const { isOnline, offlineQueueCount, swUpdateAvailable } = usePWA();

  const handleReload = () => {
    window.location.reload();
  };

  if (isOnline && offlineQueueCount === 0 && !swUpdateAvailable) {
    return null;
  }

  return (
    <div className="w-full no-print">
      {/* Offline Alert */}
      {!isOnline && (
        <div className="bg-amber-600 text-white px-4 py-2 text-xs md:text-sm font-medium flex items-center justify-between shadow-sm animate-pulse">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>أنت تعمل الآن دون اتصال بالإنترنت. البيانات تُحفظ محلياً على جهازك.</span>
          </div>
          {offlineQueueCount > 0 && (
            <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-bold">
              {offlineQueueCount} رصد بانتظار المزامنة
            </span>
          )}
        </div>
      )}

      {/* Reconnected with pending sync */}
      {isOnline && offlineQueueCount > 0 && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
            <span>عادت شبكة الإنترنت! جاري مزامنة سجلات الحضور المحفوظة محلياً...</span>
          </div>
        </div>
      )}

      {/* SW Update Available (SW-08) */}
      {swUpdateAvailable && (
        <div className="bg-blue-700 text-white px-4 py-2 text-xs font-medium flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4 shrink-0" />
            <span>يتوفر تحديث جديد لتطبيق مدارس النيل.</span>
          </div>
          <button
            onClick={handleReload}
            className="px-3 py-1 bg-white text-blue-900 rounded font-bold hover:bg-blue-50 text-xs shadow-xs"
          >
            تحديث الآن
          </button>
        </div>
      )}
    </div>
  );
};
