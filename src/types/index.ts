export type UserRole = 'owner' | 'teacher' | 'parent' | 'secretary';

export interface User {
  id: string;
  username: string; // phone for parent, T001.. for teacher, admin/name for staff
  displayName: string;
  role: UserRole;
  status: 'active' | 'disabled';
  passwordHash: string; // simplified simulated hash for offline/local storage
  mustChangePassword: boolean;
  lastLogin?: string;
  phone?: string;
  relatedId?: string; // teacherId or parentId
  createdAt: string;
}

export interface Student {
  id: string;
  code: string; // unique, e.g. "1001", preserved leading zeros
  name: string;
  grade: string; // e.g. "الصف الرابع الابتدائي"
  classNumber: number; // e.g. 3
  parentPhone: string; // 11 digits
  parentId: string;
  status: 'active' | 'archived';
  createdAt: string;
}

export interface Parent {
  id: string;
  displayName: string;
  phone: string;
  userId: string;
  studentIds: string[];
  createdAt: string;
}

export interface Teacher {
  id: string;
  name: string;
  subject: string; // primary subject
  phone?: string;
  userId: string;
  status: 'active' | 'disabled';
  createdAt: string;
}

export interface SchoolClass {
  id: string;
  grade: string;
  classNumber: number;
}

export interface Subject {
  id: string;
  name: string;
}

export interface Group {
  id: string;
  name: string; // e.g. "لغة عربية - 4/3" or "مجموعة التقوية رياضيات"
  subject: string;
  teacherId: string;
  mode: 'class' | 'manual';
  classIds?: string[];
  studentIds: string[];
}

export interface ScheduleSlot {
  id: string;
  groupId: string;
  dayOfWeek: number; // 0 = Saturday, 1 = Sunday, 2 = Monday, 3 = Tuesday, 4 = Wednesday, 5 = Thursday, 6 = Friday
  startTime: string; // "09:00"
  endTime: string; // "10:30"
  room?: string;
}

export interface SessionInstance {
  id: string;
  scheduleSlotId: string;
  groupId: string;
  date: string; // "YYYY-MM-DD"
  status: 'scheduled' | 'recorded' | 'cancelled' | 'moved';
  movedToDate?: string;
  recordedAt?: string;
  recordedBy?: string;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  studentId: string;
  status: 'present' | 'absent';
  note?: string; // e.g. "استأذن مسبقاً"
  recordedAt: string;
  recordedBy: string;
  history?: {
    status: 'present' | 'absent';
    changedAt: string;
    changedBy: string;
  }[];
}

export interface BroadcastNotification {
  id: string;
  title: string;
  body: string;
  category: 'general' | 'academic' | 'activity' | 'honor' | 'urgent';
  targetType: 'all_teachers' | 'specific_teachers' | 'all_parents' | 'grade' | 'grade_class' | 'specific_students';
  targetLabel: string;
  teacherIds?: string[];
  grade?: string;
  classNumber?: number;
  studentIds?: string[];
  recipientsCount: number;
  sentAt: string;
  senderName: string;
}

export interface AppNotification {
  id: string;
  recipientPhone: string;
  recipientRole: UserRole;
  recipientName?: string;
  title: string;
  body: string;
  url: string;
  type: 'absence' | 'correction' | 'payment' | 'schedule_change' | 'reminder' | 'broadcast';
  category?: 'general' | 'academic' | 'activity' | 'honor' | 'urgent';
  studentId?: string;
  targetLabel?: string;
  status: 'sent' | 'failed' | 'read';
  isRead: boolean;
  createdAt: string;
}

export interface FeePlan {
  id: string;
  name: string;
  type: 'monthly' | 'session' | 'annual' | 'custom';
  amount: number;
  periodicity: string; // e.g. "شهري", "للحصة", "سنوي"
  description?: string;
}

export interface Invoice {
  id: string;
  studentId: string;
  feePlanId?: string;
  title: string;
  amount: number;
  discount: number;
  dueDate: string; // "YYYY-MM-DD"
  paidAmount: number;
  remainingAmount: number;
  status: 'paid' | 'partial' | 'unpaid' | 'overdue';
  createdAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  studentId: string;
  amount: number;
  method: 'cash' | 'bank_transfer' | 'wallet' | 'cheque';
  date: string;
  receivedBy: string;
  receiptId: string;
  note?: string;
}

export interface Receipt {
  id: string;
  serialNumber: string; // e.g. NPS-2026-000101
  paymentId: string;
  invoiceId: string;
  studentId: string;
  amount: number;
  totalRequired: number;
  totalPaidToDate: number;
  remainingBalance: number;
  paymentMethod: string;
  feeTitle: string;
  date: string;
  issuedBy: string;
  status: 'valid' | 'cancelled';
  cancellationReason?: string;
  reversedReceiptSerial?: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  timestamp: string;
}

export interface SchoolSettings {
  schoolName: string;
  logoUrl: string;
  address: string;
  phones: string[];
  academicYear: string;
  academicYearStart: string;
  academicYearEnd: string;
  holidays: string[]; // array of "YYYY-MM-DD"
  grades: string[];
  subjects: string[];
  teacherEditWindowHours: number;
  absenceThreshold: number; // default 3
  forceParentPasswordChange: boolean;
  notificationTemplates: {
    absence: { title: string; body: string };
    correction: { title: string; body: string };
    payment: { title: string; body: string };
    reminder: { title: string; body: string };
    schedule_change: { title: string; body: string };
  };
}

export interface OfflineAttendanceQueueItem {
  id: string;
  sessionId: string;
  records: {
    studentId: string;
    status: 'present' | 'absent';
    note?: string;
  }[];
  timestamp: string;
  teacherId: string;
  teacherName: string;
}
