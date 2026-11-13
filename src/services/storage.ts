import { collection, doc, getDocs, getDocsFromServer, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

function isFirestoreOfflineError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as { code?: string }).code;
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    code === 'unavailable' ||
    msg.includes('client is offline') ||
    msg.includes('failed to get document') ||
    msg.includes('could not reach cloud firestore backend')
  );
}

function logFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  if (isFirestoreOfflineError(error)) {
    console.warn('Firestore Offline Fallback:', JSON.stringify(errInfo));
    return;
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}
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
  BroadcastNotification,
  TutoringGroup
} from '../types';
import { getTodayDateString, cleanEgyptianPhone, formatArabicDate, formatArabicTime } from '../utils/arabic';

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
  TUTORING_GROUPS: 'nps_tutoring_groups',
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
  logoUrl: '/icons/app-logo.png',
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
  private cloudHydrated = false;
  private initialSyncPromise: Promise<void> | null = null;

  private getSyncKeys(): string[] {
    return Object.values(STORAGE_KEYS).filter(
      (k) =>
        k !== STORAGE_KEYS.CURRENT_USER &&
        k !== STORAGE_KEYS.LOGIN_ATTEMPTS &&
        k !== STORAGE_KEYS.OFFLINE_QUEUE &&
        k !== STORAGE_KEYS.INITIALIZED
    );
  }

  private setLocalOnly<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Error saving to localStorage key "${key}":`, e);
    }
  }

  private setLocalIfMissing<T>(key: string, value: T): void {
    if (localStorage.getItem(key) === null) {
      this.setLocalOnly(key, value);
    }
  }

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
          logFirestoreError(err, OperationType.WRITE, `nps_store/${key}`);
        });
      }
    } catch (e) {
      console.error(`Error saving to localStorage key "${key}":`, e);
    }
  }

  private syncCurrentUserFromUsers(): void {
    const current = this.get<User | null>(STORAGE_KEYS.CURRENT_USER, null);
    if (!current) return;
    const users = this.get<User[]>(STORAGE_KEYS.USERS, []);
    const matched = users.find(u => u.id === current.id || u.username === current.username);
    if (matched) {
      this.setLocalOnly(STORAGE_KEYS.CURRENT_USER, matched);
    }
  }

  private normalizeAdminDisplayNameLocally(): void {
    const existingUsers = this.get<User[]>(STORAGE_KEYS.USERS, []);
    let updatedUsers = false;
    const seenIds = new Set<string>();
    const seenUsernames = new Set<string>();
    const dedupedUsers: User[] = [];
    for (let i = 0; i < existingUsers.length; i++) {
      const u = existingUsers[i];
      if (u.username === 'admin' || u.role === 'owner') {
        if (!u.displayName || u.displayName.trim() === '' || u.displayName === 'المالك' || u.displayName === 'مدير النظام (الإدارة)') {
          u.displayName = 'الادمن';
          updatedUsers = true;
        }
      }
      const unameKey = u.username.toLowerCase();
      if (seenIds.has(u.id)) {
        if (seenUsernames.has(unameKey)) {
          // Exact duplicate record, drop it
          updatedUsers = true;
          continue;
        }
        // Distinct account that collided on same millisecond ID: give unique ID
        u.id = `${u.id}_d${i}`;
        updatedUsers = true;
      }
      seenIds.add(u.id);
      seenUsernames.add(unameKey);
      dedupedUsers.push(u);
    }
    if (updatedUsers) {
      this.setLocalOnly(STORAGE_KEYS.USERS, dedupedUsers);
      const current = this.get<User | null>(STORAGE_KEYS.CURRENT_USER, null);
      if (current && (current.username === 'admin' || current.role === 'owner')) {
        current.displayName = 'الادمن';
        this.setLocalOnly(STORAGE_KEYS.CURRENT_USER, current);
      }
    }

    // Migrate old default SVG logo path to the new PNG app logo
    const settings = this.get<SchoolSettings | null>(STORAGE_KEYS.SETTINGS, null);
    if (settings && (!settings.logoUrl || settings.logoUrl === '/icons/icon.svg')) {
      settings.logoUrl = '/icons/app-logo.png';
      this.setLocalOnly(STORAGE_KEYS.SETTINGS, settings);
    }
  }

  private async hydrateFromCloudServer(): Promise<void> {
    try {
      const storeCol = collection(db, 'nps_store');
      let serverSnap;
      const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;

      if (isOnline) {
        try {
          serverSnap = await getDocsFromServer(storeCol);
        } catch (err) {
          if (isFirestoreOfflineError(err)) {
            serverSnap = await getDocs(storeCol);
          } else {
            throw err;
          }
        }
      } else {
        serverSnap = await getDocs(storeCol);
      }

      if (!serverSnap.empty) {
        this.isSyncingFromCloud = true;
        try {
          serverSnap.docs.forEach((docSnap) => {
            const key = docSnap.id;
            const cloudVal = docSnap.data()?.value;
            if (typeof cloudVal === 'string') {
              localStorage.setItem(key, cloudVal);
            }
          });
        } finally {
          this.isSyncingFromCloud = false;
        }
        this.normalizeAdminDisplayNameLocally();
        this.syncCurrentUserFromUsers();
        localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
        this.cloudHydrated = true;
        window.dispatchEvent(new Event('nps_cloud_sync'));
        window.dispatchEvent(new Event('nps_settings_updated'));
      } else if (!serverSnap.metadata.fromCache) {
        // Server confirmed database is genuinely empty (brand-new installation)
        this.ensureLocalDefaults();
        const syncKeys = this.getSyncKeys();
        await Promise.all(
          syncKeys.map((key) => {
            const localVal = localStorage.getItem(key);
            if (!localVal) return Promise.resolve();
            return setDoc(doc(db, 'nps_store', key), {
              value: localVal,
              updatedAt: new Date().toISOString()
            }).catch((err) => {
              logFirestoreError(err, OperationType.WRITE, `nps_store/${key}`);
            });
          })
        );
        localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
        this.cloudHydrated = true;
      }
    } catch (error) {
      logFirestoreError(error, OperationType.LIST, 'nps_store');
    }
  }

  public waitForInitialCloudSync(timeoutMs = 2500): Promise<void> {
    this.ensureLocalDefaults();
    if (!this.initialSyncPromise) {
      this.initialSyncPromise = Promise.race([
        this.hydrateFromCloudServer(),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))
      ]);
    }
    return this.initialSyncPromise;
  }

  public startCloudSync(): () => void {
    // Ensure initial hydration starts if not already triggered
    void this.waitForInitialCloudSync();

    const unsubscribe = onSnapshot(
      collection(db, 'nps_store'),
      (snapshot) => {
        // NEVER overwrite Firestore when snapshot is empty (prevents race/cache wipes)
        if (snapshot.empty) {
          return;
        }

        let changed = false;
        const previousNotificationsRaw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
        const previousNotifIds = new Set<string>(
          previousNotificationsRaw ? (JSON.parse(previousNotificationsRaw) as AppNotification[]).map(n => n.id) : []
        );

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

        this.cloudHydrated = true;
        localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');

        if (changed) {
          this.normalizeAdminDisplayNameLocally();
          this.syncCurrentUserFromUsers();

          // Trigger mobile/browser notification & sound for new notifications targeting current user
          const currentUser = this.getCurrentUser();
          if (currentUser) {
            const latestNotifs = this.getNotifications();
            const newForUser = latestNotifs.filter(n => {
              if (previousNotifIds.has(n.id) || n.isRead) return false;
              if (currentUser.role === 'owner') return false;
              if (n.recipientUserId) return n.recipientUserId === currentUser.id;
              return (
                n.recipientPhone === currentUser.phone ||
                (!n.recipientPhone && n.recipientRole === currentUser.role)
              );
            });
            if (newForUser.length > 0) {
              const latest = newForUser[0];
              this.triggerDeviceNotification(latest.title, latest.body, latest.url);
              this.playNotificationSound();
            }
          }

          window.dispatchEvent(new Event('nps_cloud_sync'));
          window.dispatchEvent(new Event('nps_settings_updated'));
        }
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'nps_store');
      }
    );

    const handleOnline = () => {
      void this.hydrateFromCloudServer();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      unsubscribe();
      window.removeEventListener('online', handleOnline);
    };
  }

  // Non-destructive local defaults: NEVER overwrites existing localStorage keys and NEVER writes to Firestore!
  public ensureLocalDefaults(): void {
    const initialOwner: User = {
      id: 'usr_owner_1',
      username: 'admin',
      displayName: 'الادمن',
      role: 'owner',
      status: 'active',
      passwordHash: 'admin123',
      mustChangePassword: false,
      phone: '01000000000',
      createdAt: new Date().toISOString()
    };

    this.setLocalIfMissing(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
    this.setLocalIfMissing(STORAGE_KEYS.USERS, [initialOwner]);
    this.setLocalIfMissing(STORAGE_KEYS.TEACHERS, []);
    this.setLocalIfMissing(STORAGE_KEYS.CLASSES, []);
    this.setLocalIfMissing(
      STORAGE_KEYS.SUBJECTS,
      DEFAULT_SETTINGS.subjects.map((name, i) => ({ id: `sbj_${i + 1}`, name }))
    );
    this.setLocalIfMissing(STORAGE_KEYS.PARENTS, []);
    this.setLocalIfMissing(STORAGE_KEYS.STUDENTS, []);
    this.setLocalIfMissing(STORAGE_KEYS.GROUPS, []);
    this.setLocalIfMissing(STORAGE_KEYS.SCHEDULE_SLOTS, []);
    this.setLocalIfMissing(STORAGE_KEYS.SESSIONS, []);
    this.setLocalIfMissing(STORAGE_KEYS.ATTENDANCE, []);
    this.setLocalIfMissing(STORAGE_KEYS.NOTIFICATIONS, []);
    this.setLocalIfMissing(STORAGE_KEYS.BROADCASTS, []);
    this.setLocalIfMissing(STORAGE_KEYS.TUTORING_GROUPS, []);
    this.setLocalIfMissing(STORAGE_KEYS.AUDIT_LOGS, []);

    this.normalizeAdminDisplayNameLocally();
  }

  // Initialize Seed Data (kept as safe non-destructive alias)
  public initializeSeedData(): void {
    this.ensureLocalDefaults();
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
    this.set(STORAGE_KEYS.TUTORING_GROUPS, []);
    this.set(STORAGE_KEYS.INVOICES, []);
    this.set(STORAGE_KEYS.PAYMENTS, []);
    this.set(STORAGE_KEYS.RECEIPTS, []);
    this.set(STORAGE_KEYS.OFFLINE_QUEUE, []);

    this.logAudit(
      users[0]?.id || 'admin',
      users[0]?.displayName || 'الادمن',
      'حذف البيانات التجريبية',
      'System',
      'sys',
      'تم حذف كافة البيانات التجريبية والبدء بنظام نظيف'
    );
  }

  // --- Users & Auth ---
  public getUsers(): User[] {
    const users = this.get<User[]>(STORAGE_KEYS.USERS, []);
    let modified = false;
    for (const u of users) {
      if (u.username === 'admin' || u.role === 'owner') {
        if (!u.displayName || u.displayName.trim() === '' || u.displayName === 'المالك' || u.displayName === 'مدير النظام (الإدارة)') {
          u.displayName = 'الادمن';
          modified = true;
        }
      }
    }
    if (modified) {
      if (this.cloudHydrated) {
        this.set(STORAGE_KEYS.USERS, users);
      } else {
        this.setLocalOnly(STORAGE_KEYS.USERS, users);
      }
    }
    return users;
  }

  public saveUsers(users: User[]): void {
    this.set(STORAGE_KEYS.USERS, users);
  }

  public getCurrentUser(): User | null {
    const user = this.get<User | null>(STORAGE_KEYS.CURRENT_USER, null);
    if (user && (user.username === 'admin' || user.role === 'owner')) {
      if (!user.displayName || user.displayName.trim() === '' || user.displayName === 'المالك' || user.displayName === 'مدير النظام (الإدارة)') {
        user.displayName = 'الادمن';
        this.setCurrentUser(user);
      }
    }
    return user;
  }

  public setCurrentUser(user: User | null): void {
    this.set(STORAGE_KEYS.CURRENT_USER, user);
  }

  public checkLoginLockout(username: string): { isLocked: boolean; remainingMinutes?: number } {
    const attempts = this.get<Record<string, { count: number; lockedUntil?: number }>>(STORAGE_KEYS.LOGIN_ATTEMPTS, {}) || {};
    const record = attempts?.[username];
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
    const attempts = this.get<Record<string, { count: number; lockedUntil?: number }>>(STORAGE_KEYS.LOGIN_ATTEMPTS, {}) || {};
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
    const attempts = this.get<Record<string, { count: number; lockedUntil?: number }>>(STORAGE_KEYS.LOGIN_ATTEMPTS, {}) || {};
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
    const parentId = `prt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userId = `usr_prt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
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
    const teacherId = `tch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userId = `usr_tch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Generate automatic longer username TEACHER_0001, TEACHER_0002...
    const count = teachers.length + 1;
    const username = `TEACHER_${count.toString().padStart(4, '0')}`;
    
    // Fixed default password for teachers
    const tempPassword = 'NPS@1234';

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

  // --- Tutoring / Reinforcement Groups (مجموعات التقوية والفصول الخاصة) ---
  public getTutoringGroups(): TutoringGroup[] {
    return this.get<TutoringGroup[]>(STORAGE_KEYS.TUTORING_GROUPS, []);
  }

  public saveTutoringGroup(
    group: TutoringGroup,
    sendNotifications: boolean = true
  ): { group: TutoringGroup; parentCount: number; teacherNotified: boolean } {
    const list = this.getTutoringGroups();
    const idx = list.findIndex(g => g.id === group.id);
    if (idx !== -1) {
      list[idx] = group;
    } else {
      list.unshift(group);
    }
    this.set(STORAGE_KEYS.TUTORING_GROUPS, list);

    let parentCount = 0;
    let teacherNotified = false;
    if (sendNotifications) {
      const res = this.notifyTutoringGroup(group.id);
      parentCount = res.parentCount;
      teacherNotified = res.teacherNotified;
    }

    return { group, parentCount, teacherNotified };
  }

  public notifyTutoringGroup(groupId: string): { parentCount: number; teacherNotified: boolean } {
    const list = this.getTutoringGroups();
    const group = list.find(g => g.id === groupId);
    if (!group) return { parentCount: 0, teacherNotified: false };

    const teacher = this.getTeachers().find(t => t.id === group.teacherId);
    const students = this.getStudents().filter(s => group.studentIds.includes(s.id) && s.status === 'active');

    const dateFormatted = formatArabicDate(group.date);
    const timeRange = `${formatArabicTime(group.startTime)} - ${formatArabicTime(group.endTime)}`;
    const roomPart = group.room ? ` — المكان/القاعة: ${group.room}` : '';
    const notesPart = group.notes ? ` (${group.notes})` : '';

    let teacherNotified = false;
    if (teacher) {
      this.sendPushNotification({
        recipientPhone: teacher.phone || '',
        recipientUserId: teacher.userId,
        recipientRole: 'teacher',
        recipientName: teacher.name,
        title: `مجموعة تقوية: ${group.title}`,
        body: `تم تحديد مجموعة/فصل تقوية لك في مادة ${group.subject} (${group.targetLabel} • ${students.length} طالب) بتاريخ ${dateFormatted} من ${timeRange}${roomPart}${notesPart}.`,
        url: '/#teacher-tutoring',
        type: 'tutoring',
        targetLabel: group.targetLabel
      });
      teacherNotified = true;
    }

    // Group students by parentPhone so a parent with siblings receives one clear notification naming all enrolled kids
    const byParentPhone = new Map<string, Student[]>();
    for (const st of students) {
      if (!st.parentPhone) continue;
      const arr = byParentPhone.get(st.parentPhone) || [];
      arr.push(st);
      byParentPhone.set(st.parentPhone, arr);
    }

    let parentCount = 0;
    byParentPhone.forEach((kids, phone) => {
      const names = kids.map(k => k.name).join(' و ');
      const teacherInfo = teacher ? `${teacher.name} (${teacher.subject})` : 'معلم المادة';
      this.sendPushNotification({
        recipientPhone: phone,
        recipientRole: 'parent',
        recipientName: `ولي أمر ${names}`,
        title: `موعد مجموعة تقوية: ${group.title}`,
        body: `تم تحديد مجموعة تقوية للطالب/ة (${names}) في مادة ${group.subject} مع أ/ ${teacherInfo} بتاريخ ${dateFormatted} من ${timeRange}${roomPart}${notesPart}.`,
        url: '/#parent-tutoring',
        type: 'tutoring',
        studentId: kids[0]?.id,
        targetLabel: group.targetLabel
      });
      parentCount++;
    });

    group.notifiedAt = new Date().toISOString();
    this.set(STORAGE_KEYS.TUTORING_GROUPS, list);

    this.logAudit(
      'admin',
      'الادمن',
      'إرسال إشعار مجموعة تقوية',
      'TutoringGroup',
      group.id,
      `تم إرسال إشعار مجموعة "${group.title}" (${group.date} ${timeRange}) إلى المعلم و ${parentCount} ولي أمر`
    );

    return { parentCount, teacherNotified };
  }

  public deleteTutoringGroup(groupId: string): void {
    const list = this.getTutoringGroups().filter(g => g.id !== groupId);
    this.set(STORAGE_KEYS.TUTORING_GROUPS, list);
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

      const teacherObj = this.getTeachers().find(
        t => t.id === group?.teacherId || t.name === recordedBy
      );
      const subjectLabel = group?.subject || teacherObj?.subject || 'الحصة الدراسية';
      const teacherLabel = teacherObj ? `${teacherObj.name} (${teacherObj.subject})` : recordedBy;

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
              body: `تغيّب الطالب ${student.name} عن حصة ${subjectLabel} مع المعلم ${teacherLabel} اليوم ${sessionDate} الساعة ${sessionTime}.`,
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
              body: `تم تصحيح حالة الطالب ${student.name} في حصة ${subjectLabel} مع المعلم ${teacherLabel} بتاريخ ${sessionDate} إلى «حاضر».`,
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
            body: `تغيّب الطالب ${student.name} عن حصة ${subjectLabel} مع المعلم ${teacherLabel} اليوم ${sessionDate} الساعة ${sessionTime}.`,
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

  public playNotificationSound(): void {
    if (typeof window === 'undefined') return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1174.66, now + 0.12);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.45);
    } catch {
      // Ignore audio autoplay restrictions
    }
  }

  public triggerDeviceNotification(title: string, body: string, url?: string, studentId?: string): void {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.ready
            .then((registration) => {
              registration.showNotification(title, {
                body,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                dir: 'rtl',
                lang: 'ar',
                tag: `nps_${Date.now()}`,
                renotify: true,
                vibrate: [200, 100, 200],
                data: { url: url || '/', studentId }
              } as NotificationOptions);
            })
            .catch(() => {
              new Notification(title, {
                body,
                icon: '/icons/icon-192.png',
                dir: 'rtl',
                lang: 'ar'
              });
            });
        } else {
          new Notification(title, {
            body,
            icon: '/icons/icon-192.png',
            dir: 'rtl',
            lang: 'ar'
          });
        }
      } catch (err) {
        console.warn('Native notification dispatch failed:', err);
      }
    }
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

    const currentUser = this.getCurrentUser();
    if (
      currentUser &&
      ((newNotif.recipientUserId && currentUser.id === newNotif.recipientUserId) ||
        (!newNotif.recipientUserId &&
          (currentUser.phone === newNotif.recipientPhone ||
            (!newNotif.recipientPhone && currentUser.role === newNotif.recipientRole))))
    ) {
      this.triggerDeviceNotification(newNotif.title, newNotif.body, newNotif.url, newNotif.studentId);
      this.playNotificationSound();
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
    const uniqueRecipientPhones = new Set<string>();
    const sentCount = recipientsList.length;

    // Dispatch individual app notifications (deduplicated by unique Set)
    for (const recipient of recipientsList) {
      if (!recipient.phone || uniqueRecipientPhones.has(recipient.phone)) continue;
      uniqueRecipientPhones.add(recipient.phone);

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
