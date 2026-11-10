import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  User,
  Student,
  Parent,
  Teacher,
  SchoolClass,
  Subject,
  Group,
  ScheduleSlot,
  SessionInstance,
  AttendanceRecord,
  AppNotification,
  FeePlan,
  Invoice,
  Payment,
  Receipt,
  AuditLog,
  SchoolSettings,
  OfflineAttendanceQueueItem,
  UserRole,
  BroadcastNotification
} from '../types';
import { getTodayDateString, cleanEgyptianPhone } from '../utils/arabic';

const STORAGE_KEYS = {
  USERS: 'nps_users',
  STUDENTS: 'nps_students',
  PARENTS: 'nps_parents',
  TEACHERS: 'nps_teachers',
  CLASSES: 'nps_classes',
  SUBJECTS: 'nps_subjects',
  GROUPS: 'nps_groups',
  SCHEDULE_SLOTS: 'nps_schedule_slots',
  SESSIONS: 'nps_sessions',
  ATTENDANCE: 'nps_attendance',
  NOTIFICATIONS: 'nps_notifications',
  BROADCASTS: 'nps_broadcasts',
  FEE_PLANS: 'nps_fee_plans',
  INVOICES: 'nps_invoices',
  PAYMENTS: 'nps_payments',
  RECEIPTS: 'nps_receipts',
  AUDIT_LOGS: 'nps_audit_logs',
  SETTINGS: 'nps_settings',
  OFFLINE_QUEUE: 'nps_offline_queue',
  LOGIN_ATTEMPTS: 'nps_login_attempts',
  CURRENT_USER: 'nps_current_user',
  INITIALIZED: 'nps_initialized_v1'
};

export const DEFAULT_SETTINGS: SchoolSettings = {
  schoolName: 'مدارس النيل الخاصة للغات',
  logoUrl: '/icons/icon.svg',
  address: 'شارع النيل، المعادي، القاهرة',
  phones: ['01012345678', '0223456789'],
  academicYear: '2026 / 2027',
  academicYearStart: '2026-09-01',
  academicYearEnd: '2027-06-30',
  holidays: ['2026-10-06', '2027-01-07', '2027-01-25', '2027-04-25', '2027-05-01'],
  grades: [
    'رياض الأطفال 1',
    'رياض الأطفال 2',
    'الصف الأول الابتدائي',
    'الصف الثاني الابتدائي',
    'الصف الثالث الابتدائي',
    'الصف الرابع الابتدائي',
    'الصف الخامس الابتدائي',
    'الصف السادس الابتدائي',
    'الصف الأول الإعدادي',
    'الصف الثاني الإعدادي',
    'الصف الثالث الإعدادي',
    'الصف الأول الثانوي',
    'الصف الثاني الثانوي',
    'الصف الثالث الثانوي'
  ],
  subjects: [
    'لغة عربية',
    'لغة إنجليزية',
    'رياضيات',
    'علوم',
    'دراسات اجتماعية',
    'لغة فرنسية',
    'تربية دينية',
    'حاسب آلي'
  ],
  teacherEditWindowHours: 24,
  absenceThreshold: 3,
  forceParentPasswordChange: false,
  notificationTemplates: {
    absence: {
      title: 'تنبيه غياب',
      body: 'تغيّب الطالب [اسم الطالب] عن حصة [المادة] اليوم [التاريخ] الساعة [الوقت].'
    },
    correction: {
      title: 'تصحيح حالة الحضور',
      body: 'تم تصحيح حالة الطالب [اسم الطالب] في حصة [المادة] بتاريخ [التاريخ] إلى «حاضر».'
    },
    payment: {
      title: 'تم استلام دفعة',
      body: 'تم استلام مبلغ [المبلغ] ج.م للطالب [اسم الطالب]. المتبقي: [المتبقي] ج.م. رقم الإيصال [رقم].'
    },
    reminder: {
      title: 'تذكير بالرسوم',
      body: 'يوجد مبلغ مستحق [المبلغ] ج.م للطالب [اسم الطالب] بتاريخ استحقاق [التاريخ].'
    },
    schedule_change: {
      title: 'تعديل في الجدول',
      body: 'تم [إلغاء/نقل] حصة [المادة] بتاريخ [التاريخ].'
    }
  }
};

class StorageService {
  private get<T>(key: string, defaultValue: T): T {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  private isSyncingFromCloud = false;

  private set<T>(key: string, value: T): void {
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);

      const localOnlyKeys: string[] = [
        STORAGE_KEYS.CURRENT_USER,
        STORAGE_KEYS.LOGIN_ATTEMPTS,
        STORAGE_KEYS.OFFLINE_QUEUE,
        STORAGE_KEYS.INITIALIZED
      ];
      if (!this.isSyncingFromCloud && !localOnlyKeys.includes(key)) {
        setDoc(doc(db, 'nps_store', key), {
          value: serialized,
          updatedAt: new Date().toISOString()
        }).catch((err) => {
          console.error(`Firestore sync error for "${key}":`, err);
        });
      }
    } catch (e) {
      console.error(`Error saving to localStorage key "${key}":`, e);
    }
  }

  public startCloudSync(): () => void {
    const syncKeys = Object.values(STORAGE_KEYS).filter(
      (k) =>
        k !== STORAGE_KEYS.CURRENT_USER &&
        k !== STORAGE_KEYS.LOGIN_ATTEMPTS &&
        k !== STORAGE_KEYS.OFFLINE_QUEUE &&
        k !== STORAGE_KEYS.INITIALIZED
    );

    const unsubscribe = onSnapshot(
      collection(db, 'nps_store'),
      (snapshot) => {
        if (snapshot.empty) {
          // Push initial local seed data to Firestore
          syncKeys.forEach((key) => {
            const localVal = localStorage.getItem(key);
            if (localVal) {
              setDoc(doc(db, 'nps_store', key), {
                value: localVal,
                updatedAt: new Date().toISOString()
              }).catch(() => {});
            }
          });
          return;
        }

        let changed = false;
        this.isSyncingFromCloud = true;
        try {
          snapshot.docs.forEach((docSnap) => {
            const key = docSnap.id;
            const cloudVal = docSnap.data()?.value;
            if (typeof cloudVal === 'string' && localStorage.getItem(key) !== cloudVal) {
              localStorage.setItem(key, cloudVal);
              changed = true;
            }
          });
        } finally {
          this.isSyncingFromCloud = false;
        }

        if (changed) {
          window.dispatchEvent(new Event('nps_cloud_sync'));
          window.dispatchEvent(new Event('nps_settings_updated'));
        }
      },
      (error) => {
        console.error('Firestore onSnapshot error:', error);
      }
    );

    return unsubscribe;
  }

  // Initialize Seed Data (GEN-07)
  public initializeSeedData(): void {
    if (localStorage.getItem(STORAGE_KEYS.INITIALIZED)) {
      return;
    }

    const today = getTodayDateString();

    // 1. Settings
    this.set(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);

    // 2. Initial Owner Account
    const initialOwner: User = {
      id: 'usr_owner_1',
      username: 'admin',
      displayName: 'الأستاذ أحمد فؤاد (المالك / المدير)',
      role: 'owner',
      status: 'active',
      passwordHash: 'admin123', // required to change on first login
      mustChangePassword: true,
      phone: '01012345678',
      createdAt: new Date().toISOString()
    };

    // 3. Secretary Account
    const initialSecretary: User = {
      id: 'usr_sec_1',
      username: 'accountant',
      displayName: 'أ. مروة الشاذلي (الحسابات)',
      role: 'secretary',
      status: 'active',
      passwordHash: 'sec123',
      mustChangePassword: false,
      phone: '01099887766',
      createdAt: new Date().toISOString()
    };

    // 4. Teachers
    const teachersList: Teacher[] = [
      { id: 'tch_1', name: 'أ. أحمد محمود سالم', subject: 'لغة عربية', phone: '01122334455', userId: 'usr_tch_1', status: 'active', createdAt: new Date().toISOString() },
      { id: 'tch_2', name: 'أ. منى عبد الله', subject: 'لغة إنجليزية', phone: '01233445566', userId: 'usr_tch_2', status: 'active', createdAt: new Date().toISOString() },
      { id: 'tch_3', name: 'أ. شريف توفيق عزمي', subject: 'رياضيات', phone: '01044556677', userId: 'usr_tch_3', status: 'active', createdAt: new Date().toISOString() },
      { id: 'tch_4', name: 'أ. رانيا سامي فهمي', subject: 'علوم', phone: '01555667788', userId: 'usr_tch_4', status: 'active', createdAt: new Date().toISOString() }
    ];

    const teacherUsers: User[] = [
      { id: 'usr_tch_1', username: 'T001', displayName: 'أ. أحمد محمود سالم', role: 'teacher', status: 'active', passwordHash: 'tch12345', mustChangePassword: false, relatedId: 'tch_1', createdAt: new Date().toISOString() },
      { id: 'usr_tch_2', username: 'T002', displayName: 'أ. منى عبد الله', role: 'teacher', status: 'active', passwordHash: 'tch12345', mustChangePassword: false, relatedId: 'tch_2', createdAt: new Date().toISOString() },
      { id: 'usr_tch_3', username: 'T003', displayName: 'أ. شريف توفيق عزمي', role: 'teacher', status: 'active', passwordHash: 'tch12345', mustChangePassword: false, relatedId: 'tch_3', createdAt: new Date().toISOString() },
      { id: 'usr_tch_4', username: 'T004', displayName: 'أ. رانيا سامي فهمي', role: 'teacher', status: 'active', passwordHash: 'tch12345', mustChangePassword: false, relatedId: 'tch_4', createdAt: new Date().toISOString() }
    ];

    // 5. Classes
    const classesList: SchoolClass[] = [
      { id: 'cls_4_3', grade: 'الصف الرابع الابتدائي', classNumber: 3 },
      { id: 'cls_4_1', grade: 'الصف الرابع الابتدائي', classNumber: 1 },
      { id: 'cls_1_prep_1', grade: 'الصف الأول الإعدادي', classNumber: 1 },
      { id: 'cls_2_prep_2', grade: 'الصف الثاني الإعدادي', classNumber: 2 }
    ];

    // 6. Parents & Students (Including brothers test case PAR-04: Mohamed Ahmed Ali & Omar Ahmed Ali)
    const parentPhone1 = '01012345678';
    const parentPhone2 = '01198765432';
    const parentPhone3 = '01245678901';

    const parentsList: Parent[] = [
      { id: 'prt_1', displayName: 'ولي أمر الطالب محمد أحمد علي', phone: parentPhone1, userId: 'usr_prt_1', studentIds: ['stu_1', 'stu_3'], createdAt: new Date().toISOString() },
      { id: 'prt_2', displayName: 'ولي أمر الطالبة سارة خالد حسن', phone: parentPhone2, userId: 'usr_prt_2', studentIds: ['stu_2'], createdAt: new Date().toISOString() },
      { id: 'prt_3', displayName: 'ولي أمر الطالب يوسف كريم إبراهيم', phone: parentPhone3, userId: 'usr_prt_3', studentIds: ['stu_4'], createdAt: new Date().toISOString() }
    ];

    const parentUsers: User[] = [
      { id: 'usr_prt_1', username: parentPhone1, displayName: 'ولي أمر الطالب محمد أحمد علي', role: 'parent', status: 'active', passwordHash: parentPhone1, mustChangePassword: false, phone: parentPhone1, relatedId: 'prt_1', createdAt: new Date().toISOString() },
      { id: 'usr_prt_2', username: parentPhone2, displayName: 'ولي أمر الطالبة سارة خالد حسن', role: 'parent', status: 'active', passwordHash: parentPhone2, mustChangePassword: false, phone: parentPhone2, relatedId: 'prt_2', createdAt: new Date().toISOString() },
      { id: 'usr_prt_3', username: parentPhone3, displayName: 'ولي أمر الطالب يوسف كريم إبراهيم', role: 'parent', status: 'active', passwordHash: parentPhone3, mustChangePassword: false, phone: parentPhone3, relatedId: 'prt_3', createdAt: new Date().toISOString() }
    ];

    const studentsList: Student[] = [
      { id: 'stu_1', code: '1001', name: 'محمد أحمد علي', grade: 'الصف الرابع الابتدائي', classNumber: 3, parentPhone: parentPhone1, parentId: 'prt_1', status: 'active', createdAt: new Date().toISOString() },
      { id: 'stu_2', code: '1002', name: 'سارة خالد حسن', grade: 'الصف الأول الإعدادي', classNumber: 1, parentPhone: parentPhone2, parentId: 'prt_2', status: 'active', createdAt: new Date().toISOString() },
      { id: 'stu_3', code: '1003', name: 'عمر أحمد علي', grade: 'الصف الأول الإعدادي', classNumber: 1, parentPhone: parentPhone1, parentId: 'prt_1', status: 'active', createdAt: new Date().toISOString() }, // Brother of Mohamed
      { id: 'stu_4', code: '1004', name: 'يوسف كريم إبراهيم', grade: 'الصف الرابع الابتدائي', classNumber: 3, parentPhone: parentPhone3, parentId: 'prt_3', status: 'active', createdAt: new Date().toISOString() },
      { id: 'stu_5', code: '1005', name: 'مريم طارق الشافعي', grade: 'الصف الرابع الابتدائي', classNumber: 3, parentPhone: '01511223344', parentId: 'prt_1', status: 'active', createdAt: new Date().toISOString() },
      { id: 'stu_6', code: '1006', name: 'حمزة مصطفى رضوان', grade: 'الصف الرابع الابتدائي', classNumber: 3, parentPhone: '01066778899', parentId: 'prt_1', status: 'active', createdAt: new Date().toISOString() }
    ];

    // 7. Groups
    const groupsList: Group[] = [
      { id: 'grp_1', name: 'لغة عربية - 4/3', subject: 'لغة عربية', teacherId: 'tch_1', mode: 'class', classIds: ['cls_4_3'], studentIds: ['stu_1', 'stu_4', 'stu_5', 'stu_6'] },
      { id: 'grp_2', name: 'رياضيات - 4/3', subject: 'رياضيات', teacherId: 'tch_3', mode: 'class', classIds: ['cls_4_3'], studentIds: ['stu_1', 'stu_4', 'stu_5', 'stu_6'] },
      { id: 'grp_3', name: 'لغة إنجليزية - 1 إعدادي', subject: 'لغة إنجليزية', teacherId: 'tch_2', mode: 'class', classIds: ['cls_1_prep_1'], studentIds: ['stu_2', 'stu_3'] },
      { id: 'grp_4', name: 'مجموعة تقوية علوم خاصة', subject: 'علوم', teacherId: 'tch_4', mode: 'manual', studentIds: ['stu_1', 'stu_2'] }
    ];

    // 8. Schedule Slots
    // Day of week: today's day number in Cairo (0=Saturday ... 6=Friday)
    const currentDayOfWeek = (new Date().getDay() + 1) % 7; // Map JS Sunday(0) -> 1, Saturday(6) -> 0

    const scheduleSlotsList: ScheduleSlot[] = [
      { id: 'slot_1', groupId: 'grp_1', dayOfWeek: currentDayOfWeek, startTime: '08:30', endTime: '09:45', room: 'قاعة 101' },
      { id: 'slot_2', groupId: 'grp_2', dayOfWeek: currentDayOfWeek, startTime: '10:00', endTime: '11:15', room: 'قاعة 102' },
      { id: 'slot_3', groupId: 'grp_3', dayOfWeek: currentDayOfWeek, startTime: '11:30', endTime: '12:45', room: 'معمل اللغات' },
      { id: 'slot_4', groupId: 'grp_4', dayOfWeek: (currentDayOfWeek + 1) % 7, startTime: '14:00', endTime: '15:30', room: 'معمل العلوم' }
    ];

    // 9. Session Instances for Today
    const sessionInstances: SessionInstance[] = [
      { id: 'ses_1', scheduleSlotId: 'slot_1', groupId: 'grp_1', date: today, status: 'recorded', recordedAt: new Date(Date.now() - 3600000).toISOString(), recordedBy: 'أ. أحمد محمود سالم' },
      { id: 'ses_2', scheduleSlotId: 'slot_2', groupId: 'grp_2', date: today, status: 'scheduled' },
      { id: 'ses_3', scheduleSlotId: 'slot_3', groupId: 'grp_3', date: today, status: 'scheduled' }
    ];

    // 10. Attendance Records for ses_1
    const attendanceRecords: AttendanceRecord[] = [
      { id: 'att_1', sessionId: 'ses_1', studentId: 'stu_1', status: 'present', recordedAt: new Date(Date.now() - 3600000).toISOString(), recordedBy: 'أ. أحمد محمود سالم' },
      { id: 'att_2', sessionId: 'ses_1', studentId: 'stu_4', status: 'absent', note: 'وعكة صحية', recordedAt: new Date(Date.now() - 3600000).toISOString(), recordedBy: 'أ. أحمد محمود سالم' },
      { id: 'att_3', sessionId: 'ses_1', studentId: 'stu_5', status: 'present', recordedAt: new Date(Date.now() - 3600000).toISOString(), recordedBy: 'أ. أحمد محمود سالم' },
      { id: 'att_4', sessionId: 'ses_1', studentId: 'stu_6', status: 'present', recordedAt: new Date(Date.now() - 3600000).toISOString(), recordedBy: 'أ. أحمد محمود سالم' }
    ];

    // 11. Initial Notifications
    const initialNotifications: AppNotification[] = [
      {
        id: 'notif_1',
        recipientPhone: parentPhone3,
        recipientRole: 'parent',
        title: 'تنبيه غياب',
        body: `تغيّب الطالب يوسف كريم إبراهيم عن حصة لغة عربية اليوم ${today} الساعة 08:30 ص.`,
        url: '/#parent-children',
        type: 'absence',
        studentId: 'stu_4',
        status: 'sent',
        isRead: false,
        createdAt: new Date(Date.now() - 3500000).toISOString()
      }
    ];

    // 12. Fee Plans & Invoices & Payments & Receipts
    const feePlansList: FeePlan[] = [
      { id: 'plan_1', name: 'الاشتراك الشهري للعام الدراسي', type: 'monthly', amount: 800, periodicity: 'شهري', description: 'الاشتراك الشهري العام للخدمات التعليمية والأنشطة' },
      { id: 'plan_2', name: 'حزمة حصص التقوية المتقدمة', type: 'session', amount: 450, periodicity: 'شهري', description: '8 حصص تقوية مكثفة' },
      { id: 'plan_3', name: 'المصروفات الدراسية السنوية (القسط الأول)', type: 'annual', amount: 3500, periodicity: 'سنوي', description: 'القسط السنوي الأول' }
    ];

    const invoicesList: Invoice[] = [
      { id: 'inv_1', studentId: 'stu_1', feePlanId: 'plan_1', title: 'اشتراك شهر نوفمبر 2026', amount: 800, discount: 0, dueDate: today, paidAmount: 800, remainingAmount: 0, status: 'paid', createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
      { id: 'inv_2', studentId: 'stu_2', feePlanId: 'plan_1', title: 'اشتراك شهر نوفمبر 2026', amount: 800, discount: 100, dueDate: today, paidAmount: 400, remainingAmount: 300, status: 'partial', createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
      { id: 'inv_3', studentId: 'stu_3', feePlanId: 'plan_1', title: 'اشتراك شهر نوفمبر 2026 (خصم الإخوة)', amount: 800, discount: 150, dueDate: today, paidAmount: 0, remainingAmount: 650, status: 'unpaid', createdAt: new Date(Date.now() - 86400000 * 5).toISOString() },
      { id: 'inv_4', studentId: 'stu_4', feePlanId: 'plan_1', title: 'اشتراك شهر أكتوبر 2026', amount: 800, discount: 0, dueDate: '2026-10-15', paidAmount: 0, remainingAmount: 800, status: 'overdue', createdAt: new Date(Date.now() - 86400000 * 30).toISOString() }
    ];

    const receipt1: Receipt = {
      id: 'rcp_1',
      serialNumber: 'NPS-2026-000101',
      paymentId: 'pay_1',
      invoiceId: 'inv_1',
      studentId: 'stu_1',
      amount: 800,
      totalRequired: 800,
      totalPaidToDate: 800,
      remainingBalance: 0,
      paymentMethod: 'نقداً',
      feeTitle: 'اشتراك شهر نوفمبر 2026',
      date: today,
      issuedBy: 'أ. مروة الشاذلي',
      status: 'valid'
    };

    const payment1: Payment = {
      id: 'pay_1',
      invoiceId: 'inv_1',
      studentId: 'stu_1',
      amount: 800,
      method: 'cash',
      date: today,
      receivedBy: 'أ. مروة الشاذلي',
      receiptId: 'rcp_1',
      note: 'سداد كامل الاشتراك'
    };

    const initialAuditLogs: AuditLog[] = [
      { id: 'aud_1', userId: 'usr_owner_1', userName: 'الأستاذ أحمد فؤاد', action: 'تهيئة النظام', entity: 'System', entityId: 'sys', details: 'تم تهيئة النظام الأولي بنجاح', timestamp: new Date().toISOString() },
      { id: 'aud_2', userId: 'usr_sec_1', userName: 'أ. مروة الشاذلي', action: 'إصدار إيصال', entity: 'Receipt', entityId: 'rcp_1', details: 'إصدار إيصال رقم NPS-2026-000101 بمبلغ 800 ج.م', timestamp: new Date().toISOString() }
    ];

    const allUsers = [initialOwner, initialSecretary, ...teacherUsers, ...parentUsers];

    this.set(STORAGE_KEYS.USERS, allUsers);
    this.set(STORAGE_KEYS.TEACHERS, teachersList);
    this.set(STORAGE_KEYS.CLASSES, classesList);
    this.set(STORAGE_KEYS.SUBJECTS, DEFAULT_SETTINGS.subjects.map((name, i) => ({ id: `sbj_${i + 1}`, name })));
    this.set(STORAGE_KEYS.PARENTS, parentsList);
    this.set(STORAGE_KEYS.STUDENTS, studentsList);
    this.set(STORAGE_KEYS.GROUPS, groupsList);
    this.set(STORAGE_KEYS.SCHEDULE_SLOTS, scheduleSlotsList);
    this.set(STORAGE_KEYS.SESSIONS, sessionInstances);
    this.set(STORAGE_KEYS.ATTENDANCE, attendanceRecords);
    this.set(STORAGE_KEYS.NOTIFICATIONS, initialNotifications);
    this.set(STORAGE_KEYS.FEE_PLANS, feePlansList);
    this.set(STORAGE_KEYS.INVOICES, invoicesList);
    this.set(STORAGE_KEYS.PAYMENTS, [payment1]);
    this.set(STORAGE_KEYS.RECEIPTS, [receipt1]);
    this.set(STORAGE_KEYS.AUDIT_LOGS, initialAuditLogs);
    this.set(STORAGE_KEYS.OFFLINE_QUEUE, []);
    this.set(STORAGE_KEYS.INITIALIZED, 'true');
  }

  // Single button delete demo data (GEN-07)
  public deleteDemoData(): void {
    const users = this.getUsers().filter(u => u.role === 'owner');
    this.set(STORAGE_KEYS.USERS, users);
    this.set(STORAGE_KEYS.STUDENTS, []);
    this.set(STORAGE_KEYS.PARENTS, []);
    this.set(STORAGE_KEYS.TEACHERS, []);
    this.set(STORAGE_KEYS.CLASSES, []);
    this.set(STORAGE_KEYS.GROUPS, []);
    this.set(STORAGE_KEYS.SCHEDULE_SLOTS, []);
    this.set(STORAGE_KEYS.SESSIONS, []);
    this.set(STORAGE_KEYS.ATTENDANCE, []);
    this.set(STORAGE_KEYS.NOTIFICATIONS, []);
    this.set(STORAGE_KEYS.INVOICES, []);
    this.set(STORAGE_KEYS.PAYMENTS, []);
    this.set(STORAGE_KEYS.RECEIPTS, []);
    this.set(STORAGE_KEYS.OFFLINE_QUEUE, []);

    this.logAudit(
      users[0]?.id || 'admin',
      users[0]?.displayName || 'المالك',
      'حذف البيانات التجريبية',
      'System',
      'sys',
      'تم حذف كافة البيانات التجريبية والبدء بنظام نظيف'
    );
  }

  // --- Users & Auth ---
  public getUsers(): User[] {
    return this.get<User[]>(STORAGE_KEYS.USERS, []);
  }

  public saveUsers(users: User[]): void {
    this.set(STORAGE_KEYS.USERS, users);
  }

  public getCurrentUser(): User | null {
    return this.get<User | null>(STORAGE_KEYS.CURRENT_USER, null);
  }

  public setCurrentUser(user: User | null): void {
    this.set(STORAGE_KEYS.CURRENT_USER, user);
  }

  public checkLoginLockout(username: string): { isLocked: boolean; remainingMinutes?: number } {
    const attempts = this.get<Record<string, { count: number; lockedUntil?: number }>>(STORAGE_KEYS.LOGIN_ATTEMPTS, {});
    const record = attempts[username];
    if (record && record.lockedUntil) {
      const now = Date.now();
      if (now < record.lockedUntil) {
        const remaining = Math.ceil((record.lockedUntil - now) / 60000);
        return { isLocked: true, remainingMinutes: remaining };
      } else {
        delete attempts[username];
        this.set(STORAGE_KEYS.LOGIN_ATTEMPTS, attempts);
      }
    }
    return { isLocked: false };
  }

  public registerFailedLogin(username: string): { isLockedNow: boolean; remainingMinutes?: number } {
    const attempts = this.get<Record<string, { count: number; lockedUntil?: number }>>(STORAGE_KEYS.LOGIN_ATTEMPTS, {});
    const record = attempts[username] || { count: 0 };
    record.count += 1;

    let isLockedNow = false;
    let remainingMinutes = 0;

    if (record.count >= 5) {
      record.lockedUntil = Date.now() + 15 * 60 * 1000; // 15 mins lock
      isLockedNow = true;
      remainingMinutes = 15;
      this.logAudit('sys', 'System', 'إغلاق مؤقت للحساب', 'User', username, `محاولات تسجيل دخول فاشلة متتالية (5 مرات)`);
    }

    attempts[username] = record;
    this.set(STORAGE_KEYS.LOGIN_ATTEMPTS, attempts);
    return { isLockedNow, remainingMinutes };
  }

  public clearFailedLogin(username: string): void {
    const attempts = this.get<Record<string, { count: number; lockedUntil?: number }>>(STORAGE_KEYS.LOGIN_ATTEMPTS, {});
    if (attempts[username]) {
      delete attempts[username];
      this.set(STORAGE_KEYS.LOGIN_ATTEMPTS, attempts);
    }
  }

  // --- Settings ---
  public getSettings(): SchoolSettings {
    return this.get<SchoolSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
  }

  public updateSettings(settings: Partial<SchoolSettings>): SchoolSettings {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    this.set(STORAGE_KEYS.SETTINGS, updated);
    return updated;
  }

  // --- Students ---
  public getStudents(): Student[] {
    return this.get<Student[]>(STORAGE_KEYS.STUDENTS, []);
  }

  public saveStudent(studentData: Omit<Student, 'id' | 'createdAt' | 'parentId'>): { success: boolean; student?: Student; error?: string } {
    const students = this.getStudents();
    
    // Check code duplication
    const cleanCode = studentData.code.trim();
    if (students.some(s => s.code === cleanCode)) {
      return { success: false, error: 'كود الطالب مسجل بالفعل لطالب آخر' };
    }

    // Validate and clean phone
    const phoneCheck = cleanEgyptianPhone(studentData.parentPhone);
    if (!phoneCheck.isValid) {
      return { success: false, error: phoneCheck.error };
    }

    // Auto-create or link parent account (PAR-01, PAR-04)
    const parent = this.findOrCreateParent(phoneCheck.cleaned, studentData.name);

    // Auto-ensure class exists (SCH-01)
    this.ensureClassExists(studentData.grade, studentData.classNumber);

    const newStudent: Student = {
      ...studentData,
      id: `stu_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      code: cleanCode,
      parentPhone: phoneCheck.cleaned,
      parentId: parent.id,
      createdAt: new Date().toISOString()
    };

    students.push(newStudent);
    this.set(STORAGE_KEYS.STUDENTS, students);

    // Update parent studentIds
    if (!parent.studentIds.includes(newStudent.id)) {
      parent.studentIds.push(newStudent.id);
      this.updateParent(parent);
    }

    // Auto add student to group if group matches this class
    this.syncStudentWithClassGroups(newStudent);

    return { success: true, student: newStudent };
  }

  public updateStudent(student: Student): void {
    const students = this.getStudents();
    const idx = students.findIndex(s => s.id === student.id);
    if (idx !== -1) {
      const oldStudent = students[idx];
      students[idx] = student;
      this.set(STORAGE_KEYS.STUDENTS, students);

      // Check if parent phone changed (AUTH-12)
      if (oldStudent.parentPhone !== student.parentPhone) {
        const phoneCheck = cleanEgyptianPhone(student.parentPhone);
        if (phoneCheck.isValid) {
          this.handleParentPhoneChange(oldStudent, phoneCheck.cleaned, student.name);
        }
      }

      this.syncStudentWithClassGroups(student);
    }
  }

  public archiveStudent(studentId: string, archive: boolean = true): void {
    const students = this.getStudents();
    const student = students.find(s => s.id === studentId);
    if (student) {
      student.status = archive ? 'archived' : 'active';
      this.set(STORAGE_KEYS.STUDENTS, students);

      // If all children of parent archived, disable parent account (PAR-05)
      const parent = this.getParents().find(p => p.id === student.parentId);
      if (parent) {
        const activeChildren = students.filter(s => parent.studentIds.includes(s.id) && s.status === 'active');
        const users = this.getUsers();
        const pUser = users.find(u => u.id === parent.userId);
        if (pUser) {
          pUser.status = activeChildren.length > 0 ? 'active' : 'disabled';
          this.saveUsers(users);
        }
      }
    }
  }

  // --- Parents & Sibling Handling ---
  public getParents(): Parent[] {
    return this.get<Parent[]>(STORAGE_KEYS.PARENTS, []);
  }

  public findOrCreateParent(phone: string, studentName: string): Parent {
    const parents = this.getParents();
    let parent = parents.find(p => p.phone === phone);

    if (parent) {
      // Sibling exists! (PAR-04)
      return parent;
    }

    // Create new Parent & User
    const parentId = `prt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = `usr_prt_${Date.now()}`;
    const displayName = `ولي أمر الطالب ${studentName}`;

    const newParent: Parent = {
      id: parentId,
      displayName,
      phone,
      userId,
      studentIds: [],
      createdAt: new Date().toISOString()
    };

    const newUser: User = {
      id: userId,
      username: phone,
      displayName,
      role: 'parent',
      status: 'active',
      passwordHash: phone, // Initial password is phone number (PAR-02)
      mustChangePassword: this.getSettings().forceParentPasswordChange,
      phone,
      relatedId: parentId,
      createdAt: new Date().toISOString()
    };

    parents.push(newParent);
    this.set(STORAGE_KEYS.PARENTS, parents);

    const users = this.getUsers();
    users.push(newUser);
    this.saveUsers(users);

    return newParent;
  }

  public updateParent(parent: Parent): void {
    const parents = this.getParents();
    const idx = parents.findIndex(p => p.id === parent.id);
    if (idx !== -1) {
      parents[idx] = parent;
      this.set(STORAGE_KEYS.PARENTS, parents);
    }
  }

  private handleParentPhoneChange(student: Student, newPhone: string, studentName: string): void {
    const parents = this.getParents();
    const oldParent = parents.find(p => p.id === student.parentId);

    // Remove student from old parent
    if (oldParent) {
      oldParent.studentIds = oldParent.studentIds.filter(id => id !== student.id);
      this.updateParent(oldParent);
    }

    // Find or create parent with new phone
    const newParent = this.findOrCreateParent(newPhone, studentName);
    if (!newParent.studentIds.includes(student.id)) {
      newParent.studentIds.push(student.id);
      this.updateParent(newParent);
    }

    // Update student's parent link
    student.parentId = newParent.id;
    student.parentPhone = newPhone;
  }

  // --- Teachers ---
  public getTeachers(): Teacher[] {
    return this.get<Teacher[]>(STORAGE_KEYS.TEACHERS, []);
  }

  public saveTeachers(teachers: Teacher[]): void {
    this.set(STORAGE_KEYS.TEACHERS, teachers);
  }

  public saveTeacher(data: { name: string; subject: string; phone?: string }): { teacher: Teacher; tempPassword: string; username: string } {
    const teachers = this.getTeachers();
    const teacherId = `tch_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const userId = `usr_tch_${Date.now()}`;

    // Generate automatic username T001, T002...
    const count = teachers.length + 1;
    const username = `T${count.toString().padStart(3, '0')}`;
    
    // Generate 8-character random temporary password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let tempPassword = '';
    for (let i = 0; i < 8; i++) {
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const teacher: Teacher = {
      id: teacherId,
      name: data.name.trim(),
      subject: data.subject.trim(),
      phone: data.phone?.trim(),
      userId,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    const user: User = {
      id: userId,
      username,
      displayName: teacher.name,
      role: 'teacher',
      status: 'active',
      passwordHash: tempPassword,
      mustChangePassword: false,
      phone: teacher.phone,
      relatedId: teacherId,
      createdAt: new Date().toISOString()
    };

    teachers.push(teacher);
    this.set(STORAGE_KEYS.TEACHERS, teachers);

    const users = this.getUsers();
    users.push(user);
    this.saveUsers(users);

    return { teacher, tempPassword, username };
  }

  // --- Classes & Groups ---
  public getClasses(): SchoolClass[] {
    return this.get<SchoolClass[]>(STORAGE_KEYS.CLASSES, []);
  }

  public ensureClassExists(grade: string, classNumber: number): SchoolClass {
    const classes = this.getClasses();
    let cls = classes.find(c => c.grade === grade && c.classNumber === classNumber);
    if (!cls) {
      cls = {
        id: `cls_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        grade,
        classNumber
      };
      classes.push(cls);
      this.set(STORAGE_KEYS.CLASSES, classes);
    }
    return cls;
  }

  public getGroups(): Group[] {
    return this.get<Group[]>(STORAGE_KEYS.GROUPS, []);
  }

  public saveGroup(group: Group): void {
    const groups = this.getGroups();
    const idx = groups.findIndex(g => g.id === group.id);
    if (idx !== -1) {
      groups[idx] = group;
    } else {
      groups.push(group);
    }
    this.set(STORAGE_KEYS.GROUPS, groups);
  }

  public syncStudentWithClassGroups(student: Student): void {
    const groups = this.getGroups();
    const classes = this.getClasses();
    const studentClass = classes.find(c => c.grade === student.grade && c.classNumber === student.classNumber);

    if (studentClass) {
      let changed = false;
      for (const group of groups) {
        if (group.mode === 'class' && group.classIds?.includes(studentClass.id)) {
          if (student.status === 'active' && !group.studentIds.includes(student.id)) {
            group.studentIds.push(student.id);
            changed = true;
          } else if (student.status === 'archived' && group.studentIds.includes(student.id)) {
            group.studentIds = group.studentIds.filter(id => id !== student.id);
            changed = true;
          }
        }
      }
      if (changed) {
        this.set(STORAGE_KEYS.GROUPS, groups);
      }
    }
  }

  // --- Schedule Slots & Sessions ---
  public getScheduleSlots(): ScheduleSlot[] {
    return this.get<ScheduleSlot[]>(STORAGE_KEYS.SCHEDULE_SLOTS, []);
  }

  public saveScheduleSlot(slot: ScheduleSlot): { success: boolean; error?: string } {
    const slots = this.getScheduleSlots();
    const groups = this.getGroups();

    // Check conflict (SCH-05): teacher or class conflict
    const group = groups.find(g => g.id === slot.groupId);
    if (!group) return { success: false, error: 'المجموعة غير موجودة' };

    for (const existing of slots) {
      if (existing.id === slot.id) continue;
      if (existing.dayOfWeek === slot.dayOfWeek) {
        // Overlap test
        const overlap = (slot.startTime < existing.endTime) && (slot.endTime > existing.startTime);
        if (overlap) {
          const exGroup = groups.find(g => g.id === existing.groupId);
          if (exGroup && exGroup.teacherId === group.teacherId) {
            return {
              success: false,
              error: `تعارض في المواعيد: المعلم لديه حصة أخرى في نفس التوقيت (${exGroup.name})`
            };
          }
        }
      }
    }

    const idx = slots.findIndex(s => s.id === slot.id);
    if (idx !== -1) {
      slots[idx] = slot;
    } else {
      slots.push(slot);
    }
    this.set(STORAGE_KEYS.SCHEDULE_SLOTS, slots);
    return { success: true };
  }

  public getSessions(): SessionInstance[] {
    return this.get<SessionInstance[]>(STORAGE_KEYS.SESSIONS, []);
  }

  public getOrCreateSessionsForDate(dateStr: string): SessionInstance[] {
    const sessions = this.getSessions();
    const existing = sessions.filter(s => s.date === dateStr);
    if (existing.length > 0) {
      return existing;
    }

    // Generate sessions from schedule slots
    const d = new Date(dateStr);
    const dayOfWeek = (d.getDay() + 1) % 7; // Map to Saturday=0...
    const slots = this.getScheduleSlots().filter(s => s.dayOfWeek === dayOfWeek);

    const newSessions: SessionInstance[] = slots.map(slot => ({
      id: `ses_${Date.now()}_${Math.floor(Math.random() * 1000)}_${slot.id}`,
      scheduleSlotId: slot.id,
      groupId: slot.groupId,
      date: dateStr,
      status: 'scheduled'
    }));

    if (newSessions.length > 0) {
      this.set(STORAGE_KEYS.SESSIONS, [...sessions, ...newSessions]);
    }

    return newSessions;
  }

  // --- Attendance ---
  public getAttendanceRecords(): AttendanceRecord[] {
    return this.get<AttendanceRecord[]>(STORAGE_KEYS.ATTENDANCE, []);
  }

  public recordAttendance(
    sessionId: string,
    records: { studentId: string; status: 'present' | 'absent'; note?: string }[],
    recordedBy: string
  ): { absentCount: number; notifiedCount: number } {
    const allAttendance = this.getAttendanceRecords();
    const sessions = this.getSessions();
    const students = this.getStudents();
    const groups = this.getGroups();
    const slots = this.getScheduleSlots();

    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.status = 'recorded';
      session.recordedAt = new Date().toISOString();
      session.recordedBy = recordedBy;
      this.set(STORAGE_KEYS.SESSIONS, sessions);
    }

    const group = session ? groups.find(g => g.id === session.groupId) : null;
    const slot = session ? slots.find(s => s.id === session.scheduleSlotId) : null;
    const sessionTime = slot ? `${slot.startTime}` : 'اليوم';
    const sessionDate = session ? session.date : getTodayDateString();

    let absentCount = 0;
    let notifiedCount = 0;

    for (const item of records) {
      const student = students.find(s => s.id === item.studentId);
      const existingIdx = allAttendance.findIndex(a => a.sessionId === sessionId && a.studentId === item.studentId);
      const prevStatus = existingIdx !== -1 ? allAttendance[existingIdx].status : null;

      if (item.status === 'absent') {
        absentCount++;
      }

      if (existingIdx !== -1) {
        // Update existing record
        const old = allAttendance[existingIdx];
        if (old.status !== item.status) {
          const history = old.history || [];
          history.push({
            status: old.status,
            changedAt: new Date().toISOString(),
            changedBy: recordedBy
          });

          allAttendance[existingIdx] = {
            ...old,
            status: item.status,
            note: item.note,
            history
          };

          // If changed from present to absent, send absence alert
          if (old.status === 'present' && item.status === 'absent' && student) {
            this.sendPushNotification({
              recipientPhone: student.parentPhone,
              recipientRole: 'parent',
              title: 'تنبيه غياب',
              body: `تغيّب الطالب ${student.name} عن حصة ${group?.subject || 'المادة'} اليوم ${sessionDate} الساعة ${sessionTime}.`,
              url: '/#parent-children',
              type: 'absence',
              studentId: student.id
            });
            notifiedCount++;
          } else if (old.status === 'absent' && item.status === 'present' && student) {
            // If corrected to present, send correction alert (ATT-12)
            this.sendPushNotification({
              recipientPhone: student.parentPhone,
              recipientRole: 'parent',
              title: 'تصحيح حالة الحضور',
              body: `تم تصحيح حالة الطالب ${student.name} في حصة ${group?.subject || 'المادة'} بتاريخ ${sessionDate} إلى «حاضر».`,
              url: '/#parent-children',
              type: 'correction',
              studentId: student.id
            });
          }
        }
      } else {
        // New record
        allAttendance.push({
          id: `att_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          sessionId,
          studentId: item.studentId,
          status: item.status,
          note: item.note,
          recordedAt: new Date().toISOString(),
          recordedBy
        });

        // Send absence notification if absent
        if (item.status === 'absent' && student) {
          this.sendPushNotification({
            recipientPhone: student.parentPhone,
            recipientRole: 'parent',
            title: 'تنبيه غياب',
            body: `تغيّب الطالب ${student.name} عن حصة ${group?.subject || 'المادة'} اليوم ${sessionDate} الساعة ${sessionTime}.`,
            url: '/#parent-children',
            type: 'absence',
            studentId: student.id
          });
          notifiedCount++;
        }
      }
    }

    this.set(STORAGE_KEYS.ATTENDANCE, allAttendance);

    this.logAudit(
      'user',
      recordedBy,
      'رصد الحضور والغياب',
      'Session',
      sessionId,
      `تم رصد الحضور للحصة: ${absentCount} غياب، وتم إرسال ${notifiedCount} إشعار`
    );

    return { absentCount, notifiedCount };
  }

  // --- Offline Queue (SW-07, ATT-15) ---
  public getOfflineQueue(): OfflineAttendanceQueueItem[] {
    return this.get<OfflineAttendanceQueueItem[]>(STORAGE_KEYS.OFFLINE_QUEUE, []);
  }

  public queueOfflineAttendance(item: Omit<OfflineAttendanceQueueItem, 'id' | 'timestamp'>): void {
    const queue = this.getOfflineQueue();
    queue.push({
      ...item,
      id: `q_${Date.now()}`,
      timestamp: new Date().toISOString()
    });
    this.set(STORAGE_KEYS.OFFLINE_QUEUE, queue);
  }

  public syncOfflineQueue(): number {
    const queue = this.getOfflineQueue();
    if (queue.length === 0) return 0;

    let synced = 0;
    for (const item of queue) {
      this.recordAttendance(item.sessionId, item.records, item.teacherName);
      synced++;
    }

    this.set(STORAGE_KEYS.OFFLINE_QUEUE, []);
    return synced;
  }

  // --- Notifications & Web Push ---
  public getNotifications(): AppNotification[] {
    return this.get<AppNotification[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  }

  public sendPushNotification(data: Omit<AppNotification, 'id' | 'createdAt' | 'status' | 'isRead'>): AppNotification {
    const notifications = this.getNotifications();
    const newNotif: AppNotification = {
      ...data,
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      status: 'sent',
      isRead: false,
      createdAt: new Date().toISOString()
    };

    notifications.unshift(newNotif);
    this.set(STORAGE_KEYS.NOTIFICATIONS, notifications);

    // If browser supports native Notification and permission granted, trigger system notification
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            title: newNotif.title,
            body: newNotif.body,
            url: newNotif.url,
            studentId: newNotif.studentId
          });
        } else {
          new Notification(newNotif.title, {
            body: newNotif.body,
            icon: '/icons/icon-192.png',
            dir: 'rtl',
            lang: 'ar'
          });
        }
      } catch (err) {
        console.warn('Native notification dispatch failed:', err);
      }
    }

    return newNotif;
  }

  public markNotificationAsRead(id: string): void {
    const notifications = this.getNotifications();
    const notif = notifications.find(n => n.id === id);
    if (notif) {
      notif.isRead = true;
      notif.status = 'read';
      this.set(STORAGE_KEYS.NOTIFICATIONS, notifications);
    }
  }

  public markAllNotificationsAsRead(recipientPhone?: string): void {
    const notifications = this.getNotifications();
    for (const n of notifications) {
      if (!recipientPhone || n.recipientPhone === recipientPhone) {
        n.isRead = true;
        n.status = 'read';
      }
    }
    this.set(STORAGE_KEYS.NOTIFICATIONS, notifications);
  }

  // --- Broadcast Notifications Center ---
  public getBroadcasts(): BroadcastNotification[] {
    return this.get<BroadcastNotification[]>(STORAGE_KEYS.BROADCASTS, []);
  }

  public sendBroadcastNotification(data: {
    title: string;
    body: string;
    category: 'general' | 'academic' | 'activity' | 'honor' | 'urgent';
    targetType: 'all_teachers' | 'specific_teachers' | 'all_parents' | 'grade' | 'grade_class' | 'specific_students';
    targetLabel: string;
    teacherIds?: string[];
    grade?: string;
    classNumber?: number;
    studentIds?: string[];
    senderName: string;
  }): { broadcast: BroadcastNotification; sentCount: number } {
    const teachers = this.getTeachers();
    const students = this.getStudents();
    const parents = this.getParents();

    interface TargetRecipient {
      phone: string;
      role: UserRole;
      name: string;
      studentId?: string;
    }

    const recipientsMap = new Map<string, TargetRecipient>();

    if (data.targetType === 'all_teachers') {
      teachers.filter(t => t.status === 'active').forEach(t => {
        if (t.phone) {
          recipientsMap.set(t.phone, { phone: t.phone, role: 'teacher', name: t.name });
        }
      });
    } else if (data.targetType === 'specific_teachers' && data.teacherIds) {
      teachers.filter(t => t.status === 'active' && data.teacherIds?.includes(t.id)).forEach(t => {
        if (t.phone) {
          recipientsMap.set(t.phone, { phone: t.phone, role: 'teacher', name: t.name });
        }
      });
    } else if (data.targetType === 'all_parents') {
      students.filter(s => s.status === 'active').forEach(s => {
        recipientsMap.set(s.parentPhone, {
          phone: s.parentPhone,
          role: 'parent',
          name: `ولي أمر ${s.name}`,
          studentId: s.id
        });
      });
    } else if (data.targetType === 'grade' && data.grade) {
      students.filter(s => s.status === 'active' && s.grade === data.grade).forEach(s => {
        recipientsMap.set(s.parentPhone, {
          phone: s.parentPhone,
          role: 'parent',
          name: `ولي أمر ${s.name}`,
          studentId: s.id
        });
      });
    } else if (data.targetType === 'grade_class' && data.grade && data.classNumber) {
      students.filter(s => s.status === 'active' && s.grade === data.grade && s.classNumber === data.classNumber).forEach(s => {
        recipientsMap.set(s.parentPhone, {
          phone: s.parentPhone,
          role: 'parent',
          name: `ولي أمر ${s.name}`,
          studentId: s.id
        });
      });
    } else if (data.targetType === 'specific_students' && data.studentIds) {
      students.filter(s => s.status === 'active' && data.studentIds?.includes(s.id)).forEach(s => {
        recipientsMap.set(s.parentPhone, {
          phone: s.parentPhone,
          role: 'parent',
          name: `ولي أمر ${s.name}`,
          studentId: s.id
        });
      });
    }

    const recipientsList = Array.from(recipientsMap.values());
    const sentCount = recipientsList.length;

    // Dispatch individual app notifications
    for (const recipient of recipientsList) {
      this.sendPushNotification({
        recipientPhone: recipient.phone,
        recipientRole: recipient.role,
        recipientName: recipient.name,
        title: data.title,
        body: data.body,
        url: recipient.role === 'teacher' ? '/#teacher-today' : '/#parent-children',
        type: 'broadcast',
        category: data.category,
        studentId: recipient.studentId,
        targetLabel: data.targetLabel
      });
    }

    const broadcast: BroadcastNotification = {
      id: `bc_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      title: data.title,
      body: data.body,
      category: data.category,
      targetType: data.targetType,
      targetLabel: data.targetLabel,
      teacherIds: data.teacherIds,
      grade: data.grade,
      classNumber: data.classNumber,
      studentIds: data.studentIds,
      recipientsCount: sentCount,
      sentAt: new Date().toISOString(),
      senderName: data.senderName
    };

    const broadcasts = this.getBroadcasts();
    broadcasts.unshift(broadcast);
    this.set(STORAGE_KEYS.BROADCASTS, broadcasts);

    this.logAudit(
      'admin',
      data.senderName,
      'إرسال إشعار جماعي',
      'Broadcast',
      broadcast.id,
      `إرسال إشعار بعنوان "${data.title}" إلى ${data.targetLabel} (${sentCount} مستلم)`
    );

    return { broadcast, sentCount };
  }

  // --- Finance: Plans, Invoices, Payments, Receipts ---
  public getFeePlans(): FeePlan[] {
    return this.get<FeePlan[]>(STORAGE_KEYS.FEE_PLANS, []);
  }

  public saveFeePlan(plan: FeePlan): void {
    const plans = this.getFeePlans();
    const idx = plans.findIndex(p => p.id === plan.id);
    if (idx !== -1) {
      plans[idx] = plan;
    } else {
      plans.push(plan);
    }
    this.set(STORAGE_KEYS.FEE_PLANS, plans);
  }

  public getInvoices(): Invoice[] {
    return this.get<Invoice[]>(STORAGE_KEYS.INVOICES, []);
  }

  public saveInvoice(invoice: Invoice): void {
    const invoices = this.getInvoices();
    const idx = invoices.findIndex(i => i.id === invoice.id);
    if (idx !== -1) {
      invoices[idx] = invoice;
    } else {
      invoices.push(invoice);
    }
    this.set(STORAGE_KEYS.INVOICES, invoices);
  }

  public getPayments(): Payment[] {
    return this.get<Payment[]>(STORAGE_KEYS.PAYMENTS, []);
  }

  public getReceipts(): Receipt[] {
    return this.get<Receipt[]>(STORAGE_KEYS.RECEIPTS, []);
  }

  public registerPayment(data: {
    invoiceId: string;
    studentId: string;
    amount: number;
    method: 'cash' | 'bank_transfer' | 'wallet' | 'cheque';
    receivedBy: string;
    note?: string;
  }): { success: boolean; receipt?: Receipt; error?: string } {
    const invoices = this.getInvoices();
    const invoice = invoices.find(i => i.id === data.invoiceId);
    if (!invoice) return { success: false, error: 'المطالبة غير موجودة' };

    const students = this.getStudents();
    const student = students.find(s => s.id === data.studentId);
    if (!student) return { success: false, error: 'الطالب غير موجود' };

    if (data.amount <= 0) return { success: false, error: 'يجب أن يكون المبلغ أكبر من صفر' };

    // Update invoice
    invoice.paidAmount += data.amount;
    invoice.remainingAmount = Math.max(0, invoice.amount - invoice.discount - invoice.paidAmount);
    if (invoice.remainingAmount === 0) {
      invoice.status = 'paid';
    } else {
      invoice.status = 'partial';
    }
    this.set(STORAGE_KEYS.INVOICES, invoices);

    // Generate unique sequential receipt number NPS-YYYY-NNNNNN
    const receipts = this.getReceipts();
    const year = new Date().getFullYear();
    const seq = (receipts.length + 1).toString().padStart(6, '0');
    const serialNumber = `NPS-${year}-${seq}`;

    const receiptId = `rcp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const paymentId = `pay_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const methodLabels: Record<string, string> = {
      cash: 'نقداً',
      bank_transfer: 'تحويل بنكي',
      wallet: 'محفظة إلكترونية (فودافون كاش / إنستاباي)',
      cheque: 'شيك'
    };

    const newReceipt: Receipt = {
      id: receiptId,
      serialNumber,
      paymentId,
      invoiceId: invoice.id,
      studentId: student.id,
      amount: data.amount,
      totalRequired: invoice.amount - invoice.discount,
      totalPaidToDate: invoice.paidAmount,
      remainingBalance: invoice.remainingAmount,
      paymentMethod: methodLabels[data.method] || 'نقداً',
      feeTitle: invoice.title,
      date: getTodayDateString(),
      issuedBy: data.receivedBy,
      status: 'valid'
    };

    const newPayment: Payment = {
      id: paymentId,
      invoiceId: invoice.id,
      studentId: student.id,
      amount: data.amount,
      method: data.method,
      date: getTodayDateString(),
      receivedBy: data.receivedBy,
      receiptId,
      note: data.note
    };

    receipts.push(newReceipt);
    this.set(STORAGE_KEYS.RECEIPTS, receipts);

    const payments = this.getPayments();
    payments.push(newPayment);
    this.set(STORAGE_KEYS.PAYMENTS, payments);

    // Send payment notification to parent
    this.sendPushNotification({
      recipientPhone: student.parentPhone,
      recipientRole: 'parent',
      title: 'تم استلام دفعة مالية',
      body: `تم استلام مبلغ ${data.amount} ج.م للطالب ${student.name}. المتبقي: ${invoice.remainingAmount} ج.م. إيصال رقم ${serialNumber}.`,
      url: '/#parent-financials',
      type: 'payment',
      studentId: student.id
    });

    this.logAudit(
      'sec',
      data.receivedBy,
      'تسجيل دفعة وإصدار إيصال',
      'Receipt',
      serialNumber,
      `تم استلام مبلغ ${data.amount} ج.م من الطالب ${student.name} (${invoice.title})`
    );

    return { success: true, receipt: newReceipt };
  }

  // Cancel receipt with reverse entry (FIN-07)
  public cancelReceipt(receiptId: string, reason: string, cancelledBy: string): { success: boolean; error?: string } {
    const receipts = this.getReceipts();
    const receipt = receipts.find(r => r.id === receiptId);
    if (!receipt) return { success: false, error: 'الإيصال غير موجود' };
    if (receipt.status === 'cancelled') return { success: false, error: 'الإيصال ملغى مسبقاً' };

    // Reverse payment on invoice
    const invoices = this.getInvoices();
    const invoice = invoices.find(i => i.id === receipt.invoiceId);
    if (invoice) {
      invoice.paidAmount = Math.max(0, invoice.paidAmount - receipt.amount);
      invoice.remainingAmount = Math.max(0, invoice.amount - invoice.discount - invoice.paidAmount);
      invoice.status = invoice.paidAmount === 0 ? 'unpaid' : 'partial';
      this.set(STORAGE_KEYS.INVOICES, invoices);
    }

    // Generate reverse receipt number
    const year = new Date().getFullYear();
    const revSeq = `REV-${year}-${receipt.serialNumber}`;
    receipt.status = 'cancelled';
    receipt.cancellationReason = reason;
    receipt.reversedReceiptSerial = revSeq;

    this.set(STORAGE_KEYS.RECEIPTS, receipts);

    this.logAudit(
      'admin',
      cancelledBy,
      'إلغاء إيصال (إيصال عكسي)',
      'Receipt',
      receipt.serialNumber,
      `تم إلغاء الإيصال بموجب الإيصال العكسي ${revSeq}. السبب: ${reason}`
    );

    return { success: true };
  }

  // --- Audit Logs ---
  public getAuditLogs(): AuditLog[] {
    return this.get<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, []);
  }

  public logAudit(userId: string, userName: string, action: string, entity: string, entityId: string, details: string): void {
    const logs = this.getAuditLogs();
    logs.unshift({
      id: `aud_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      userId,
      userName,
      action,
      entity,
      entityId,
      details,
      timestamp: new Date().toISOString()
    });
    // Keep max 500 audit logs
    if (logs.length > 500) logs.length = 500;
    this.set(STORAGE_KEYS.AUDIT_LOGS, logs);
  }

  // --- Backup & Restore ---
  public exportAllData(): string {
    const dump: Record<string, unknown> = {};
    for (const [name, key] of Object.entries(STORAGE_KEYS)) {
      dump[name] = this.get(key, null);
    }
    return JSON.stringify(dump, null, 2);
  }

  public importAllData(jsonStr: string): boolean {
    try {
      const dump = JSON.parse(jsonStr);
      for (const [name, key] of Object.entries(STORAGE_KEYS)) {
        if (dump[name] !== undefined) {
          this.set(key, dump[name]);
        }
      }
      return true;
    } catch {
      return false;
    }
  }
}

export const storage = new StorageService();
