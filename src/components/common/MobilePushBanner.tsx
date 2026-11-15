import React, { useState, useEffect } from 'react';
import { BellRing, CheckCircle2, Smartphone, AlertCircle, Send } from 'lucide-react';
import type { User } from '../../types';
import { storage } from '../../services/storage';
import {
  ensurePushSubscription,
  getCurrentPushEndpoint,
  getPushSupportInfo,
  sendTestWebPush
} from '../../services/pushService';

interface Props {
  currentUser: User;
  variant?: 'banner' | 'settings';
}

export const MobilePushBanner: React.FC<Props> = ({ currentUser, variant = 'banner' }) => {
  const [supportInfo, setSupportInfo] = useState(() => getPushSupportInfo());
  const [hasEndpoint, setHasEndpoint] = useState<boolean>(false);
  const [checked, setChecked] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [testing, setTesting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const refreshStatus = async () => {
    const info = getPushSupportInfo();
    setSupportInfo(info);
    const endpoint = await getCurrentPushEndpoint();
    setHasEndpoint(Boolean(endpoint));
    setChecked(true);
  };

  useEffect(() => {
    void refreshStatus();
    const handler = () => {
      void refreshStatus();
    };
    window.addEventListener('nps_push_status_changed', handler);
    return () => window.removeEventListener('nps_push_status_changed', handler);
  }, [currentUser.id]);

  if (currentUser.role === 'owner' || !checked) {
    return null;
  }

  const isFullyActive = supportInfo.permission === 'granted' && hasEndpoint;

  // On dashboard banner variant, hide automatically once push is fully active
  if (variant === 'banner' && isFullyActive) {
    return null;
  }

  const handleEnablePush = async () => {
    setLoading(true);
    setFeedback(null);
    const res = await ensurePushSubscription(currentUser, true);
    setLoading(false);
    if (res.status === 'subscribed') {
      storage.logAudit(
        currentUser.id,
        currentUser.displayName,
        'تفعيل الإشعارات الفورية',
        'User',
        currentUser.id,
        'تم تفعيل اشتراك Web Push للوصول خارج المتصفح'
      );
      setFeedback({ ok: true, text: 'تم تفعيل إشعارات الهاتف بنجاح! ستصلك الإشعارات حتى خارج المتصفح.' });
      await refreshStatus();
    } else if (res.message) {
      setFeedback({ ok: false, text: res.message });
    }
  };

  const handleSendTest = async () => {
    setTesting(true);
    setFeedback(null);
    const res = await sendTestWebPush(currentUser);
    setTesting(false);
    setFeedback({ ok: res.ok, text: res.message });
    await refreshStatus();
  };

  if (supportInfo.requiresIOSHomeScreenInstall) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 text-xs text-amber-900 flex items-start gap-3">
        <Smartphone className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-extrabold">تفعيل الإشعارات على الآيفون / الآيباد خارج المتصفح</p>
          <p className="text-[11px] leading-relaxed text-amber-800">
            لتلقي الإشعارات على الهاتف دون فتح المتصفح: اضغط على زر <strong>المشاركة (Share)</strong> في Safari ثم اختر{' '}
            <strong>«إضافة إلى الشاشة الرئيسية»</strong>، وبعدها افتح التطبيق من أيقونته وفعّل الإشعارات.
          </p>
        </div>
      </div>
    );
  }

  if (!supportInfo.supported) {
    return null;
  }

  if (supportInfo.permission === 'denied') {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 text-xs text-rose-900 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-extrabold">إشعارات المتصفح محظورة على هذا الجهاز</p>
          <p className="text-[11px] leading-relaxed text-rose-700">
            افتح إعدادات الموقع (أيقونة القفل بجانب رابط الموقع في المتصفح) وغيّر إذن <strong>الإشعارات</strong> إلى{' '}
            <strong>سماح (Allow)</strong> ثم أعد تحميل الصفحة.
          </p>
        </div>
      </div>
    );
  }

  if (isFullyActive) {
    return (
      <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs font-extrabold">إشعارات الهاتف الفورية مفعّلة</p>
              <p className="text-[11px] text-emerald-700">تصلك الإشعارات على هذا الجهاز حتى وأنت خارج المتصفح</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSendTest}
            disabled={testing}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-[11px] font-bold flex items-center gap-1.5 transition shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{testing ? 'جاري الإرسال...' : 'إرسال إشعار تجريبي'}</span>
          </button>
        </div>
        {feedback && (
          <p className={`text-[11px] font-bold ${feedback.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
            {feedback.text}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-start gap-2.5 text-blue-950">
          <BellRing className="w-5 h-5 text-[#1F4E8C] shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-extrabold">
              {supportInfo.permission === 'granted'
                ? 'أكمل ربط إشعارات الخلفية لهذا الهاتف'
                : 'فعّل إشعارات الهاتف الفورية'}
            </p>
            <p className="text-[11px] text-blue-800 mt-0.5">
              لتصل الإشعارات على الموبايل مباشرة حتى عندما تكون خارج المتصفح أو الشاشة مغلقة.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleEnablePush}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-[#1F4E8C] hover:bg-[#163A6B] disabled:opacity-60 text-white text-xs font-bold transition shrink-0 text-center"
        >
          {loading ? 'جاري التفعيل...' : 'تفعيل الإشعارات الآن'}
        </button>
      </div>
      {feedback && (
        <p className={`text-[11px] font-bold ${feedback.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
          {feedback.text}
        </p>
      )}
    </div>
  );
};
