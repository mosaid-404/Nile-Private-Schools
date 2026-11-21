import React, { useState, useMemo, useEffect } from 'react';
import { Bell, CheckCheck, UserX, UserCheck, LogOut, CreditCard, Calendar, Clock, AlertCircle, X } from 'lucide-react';
import { AppNotification, User } from '../../types';
import { storage } from '../../services/storage';
import { formatArabicDate, formatArabicTime } from '../../utils/arabic';
import { MobilePushBanner } from './MobilePushBanner';
import { useProgressiveCount } from './VirtualList';

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

  useEffect(() => {
    if (isOpen) {
      setNotifications(storage.getNotifications());
    }
    const onCloudSync = () => setNotifications(storage.getNotifications());
    window.addEventListener('nps_cloud_sync', onCloudSync);
    return () => window.removeEventListener('nps_cloud_sync', onCloudSync);
  }, [isOpen]);

  const userNotifications = useMemo(() => {
    if (!isOpen || currentUser.role === 'owner') return [];
    const parentPref =
      currentUser.role === 'parent'
        ? storage.getParentNotificationPref(currentUser.relatedId, currentUser.phone)
        : 'both';
    const seenKeys = new Set<string>();
    const result: AppNotification[] = [];
    for (let i = 0; i < notifications.length; i++) {
      const n = notifications[i];
      if (currentUser.role === 'parent' && !storage.shouldDeliverAttendanceNotif(parentPref, n.type)) {
        continue;
      }
      const matchesUser = n.recipientUserId
        ? n.recipientUserId === currentUser.id
        : currentUser.role === 'parent'
        ? n.recipientPhone === currentUser.phone
        : currentUser.role === 'teacher'
        ? n.recipientPhone === currentUser.phone || (!n.recipientPhone && n.recipientRole === 'teacher')
        : false;
      if (!matchesUser) continue;

      const key = `${n.title}|${n.body}|${(n.createdAt || '').substring(0, 16)}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      result.push(n);
    }
    return result;
  }, [isOpen, notifications, currentUser]);

  const { displayedList, unreadCount } = useMemo(() => {
    let unread = 0;
    const unreadItems: AppNotification[] = [];
    for (let i = 0; i < userNotifications.length; i++) {
      const n = userNotifications[i];
      if (!n.isRead) {
        unread++;
        unreadItems.push(n);
      }
    }
    return {
      displayedList: filter === 'unread' ? unreadItems : userNotifications,
      unreadCount: unread
    };
  }, [userNotifications, filter]);

  const { visibleCount, hasMore, sentinelRef } = useProgressiveCount(
    displayedList.length,
    60,
    100,
    `${isOpen}_${filter}`
  );

  if (!isOpen) return null;

  const visibleNotifications = displayedList.slice(0, visibleCount);

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

  const getIcon = (type: string) => {
    switch (type) {
      case 'presence':
        return <UserCheck className="w-5 h-5 text-emerald-600" />;
      case 'departure':
        return <LogOut className="w-5 h-5 text-indigo-600" />;
      case 'absence':
        return <UserX className="w-5 h-5 text-rose-600" />;
      case 'payment':
        return <CreditCard className="w-5 h-5 text-emerald-600" />;
      case 'schedule_change':
      case 'tutoring':
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

        {/* Web Push Activation & Status (NOT-03) */}
        <div className="p-3 px-4 border-b border-slate-100 bg-slate-50/50">
          <MobilePushBanner currentUser={currentUser} variant="settings" />
        </div>

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
            <>
              {visibleNotifications.map(item => (
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
              ))}
              {hasMore && (
                <div ref={sentinelRef} className="py-2 text-center text-[11px] text-slate-400">
                  جاري عرض باقي الإشعارات...
                </div>
              )}
            </>
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
