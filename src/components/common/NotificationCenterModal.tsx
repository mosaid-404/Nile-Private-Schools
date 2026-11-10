import React, { useState } from 'react';
import { Bell, CheckCheck, UserX, CreditCard, Calendar, Clock, AlertCircle, X } from 'lucide-react';
import { AppNotification, User } from '../../types';
import { storage } from '../../services/storage';
import { formatArabicDate, formatArabicTime } from '../../utils/arabic';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onSelectStudentAttendance?: (studentId: string) => void;
}

export const NotificationCenterModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  onSelectStudentAttendance
}) => {
  const [notifications, setNotifications] = useState<AppNotification[]>(() => {
    return storage.getNotifications();
  });
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(() => {
    return typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default';
  });

  if (!isOpen) return null;

  // Filter for current user's role/phone
  const userNotifications = notifications.filter(n => {
    if (currentUser.role === 'owner') return true; // Owner sees all
    if (currentUser.role === 'parent') {
      return n.recipientPhone === currentUser.phone || n.recipientRole === 'parent';
    }
    if (currentUser.role === 'teacher') {
      return n.recipientRole === 'teacher';
    }
    return true;
  });

  const displayedList = filter === 'unread' ? userNotifications.filter(n => !n.isRead) : userNotifications;
  const unreadCount = userNotifications.filter(n => !n.isRead).length;

  const handleMarkAllRead = () => {
    storage.markAllNotificationsAsRead(currentUser.role === 'owner' ? undefined : currentUser.phone);
    setNotifications(storage.getNotifications());
  };

  const handleNotificationClick = (notif: AppNotification) => {
    storage.markNotificationAsRead(notif.id);
    setNotifications(storage.getNotifications());
    if (notif.studentId && onSelectStudentAttendance) {
      onSelectStudentAttendance(notif.studentId);
      onClose();
    }
  };

  const handleRequestPushPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const res = await Notification.requestPermission();
      setPermissionStatus(res);
      if (res === 'granted') {
        storage.logAudit(currentUser.id, currentUser.displayName, 'تفعيل الإشعارات الفورية', 'User', currentUser.id, 'تم منح إذن إشعارات Web Push');
      }
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'absence':
        return <UserX className="w-5 h-5 text-rose-600" />;
      case 'payment':
        return <CreditCard className="w-5 h-5 text-emerald-600" />;
      case 'schedule_change':
        return <Calendar className="w-5 h-5 text-blue-600" />;
      default:
        return <AlertCircle className="w-5 h-5 text-amber-600" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-[#1F4E8C] text-white p-4 px-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/10">
              <Bell className="w-5 h-5 text-blue-100" />
            </div>
            <div>
              <h3 className="font-bold text-base">مركز الإشعارات والتنبيهات</h3>
              <p className="text-xs text-blue-100">{unreadCount} إشعار جديد غير مقروء</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Web Push Prompt if not granted (NOT-03) */}
        {permissionStatus !== 'granted' && (
          <div className="bg-amber-50 border-b border-amber-100 p-3 px-5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>فعّل إشعارات الهاتف لتصلك تنبيهات الغياب والرسوم فوراً دون فتح التطبيق.</span>
            </div>
            <button
              onClick={handleRequestPushPermission}
              className="px-3 py-1 bg-amber-600 text-white rounded font-bold hover:bg-amber-700 shrink-0 mr-2"
            >
              تفعيل الآن
            </button>
          </div>
        )}

        {/* Filter & Actions Bar */}
        <div className="p-3 px-5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filter === 'all' ? 'bg-[#1F4E8C] text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              الكل ({userNotifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                filter === 'unread' ? 'bg-[#1F4E8C] text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
              }`}
            >
              غير المقروءة ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex items-center gap-1 text-[#1F4E8C] hover:text-[#163A6B] font-bold text-xs"
            >
              <CheckCheck className="w-4 h-4" />
              <span>تعيين الكل كمقروء</span>
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {displayedList.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Bell className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">لا توجد إشعارات حالياً</p>
            </div>
          ) : (
            displayedList.map(item => (
              <div
                key={item.id}
                onClick={() => handleNotificationClick(item)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer text-right flex gap-3.5 items-start ${
                  item.isRead
                    ? 'bg-white border-slate-200 hover:border-slate-300 opacity-80'
                    : 'bg-blue-50/70 border-blue-200 hover:border-blue-400 shadow-xs'
                }`}
              >
                <div className="p-2 rounded-xl bg-white shadow-xs shrink-0 mt-0.5">
                  {getIcon(item.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      {!item.isRead && <span className="w-2 h-2 rounded-full bg-[#1F4E8C]" />}
                      {item.title}
                    </span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1 shrink-0">
                      <Clock className="w-3 h-3" />
                      {formatArabicDate(item.createdAt)} - {formatArabicTime(item.createdAt.substring(11, 16))}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed">{item.body}</p>

                  {item.studentId && (
                    <span className="inline-block mt-2 text-[11px] font-semibold text-[#1F4E8C] hover:underline">
                      عرض التفاصيل وسجل الحضور ←
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 px-5 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
          <span>نظام مدارس النيل — التنبيهات الفورية</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 font-semibold text-slate-700"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
