import React, { useState, useEffect } from 'react';
import {
  Shield,
  Search,
  Plus,
  Key,
  UserCheck,
  UserX,
  History,
  AlertCircle,
  Copy,
  Printer
} from 'lucide-react';
import { User, AuditLog, UserRole } from '../../types';
import { storage } from '../../services/storage';
import { formatArabicDate, formatArabicTime } from '../../utils/arabic';

export const UserManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [users, setUsers] = useState<User[]>(() => storage.getUsers());
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => storage.getAuditLogs());
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);

  // New Staff form
  const [staffName, setStaffName] = useState('');
  const [staffUsername, setStaffUsername] = useState('');
  const [staffRole, setStaffRole] = useState<'owner'>('owner');
  const [staffPassword, setStaffPassword] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [formError, setFormError] = useState('');

  // Password reset popup
  const [tempPassInfo, setTempPassInfo] = useState<{ name: string; username: string; pass: string } | null>(null);

  const refreshUsers = () => {
    setUsers(storage.getUsers());
    setAuditLogs(storage.getAuditLogs());
  };

  useEffect(() => {
    window.addEventListener('nps_cloud_sync', refreshUsers);
    return () => window.removeEventListener('nps_cloud_sync', refreshUsers);
  }, []);

  const roleLabels: Record<string, string> = {
    owner: 'المالك / المدير',
    teacher: 'معلم',
    parent: 'ولي أمر'
  };

  // Toggle user status (USR-02, USR-04)
  const handleToggleStatus = (user: User) => {
    // Cannot disable last active owner (USR-04)
    if (user.role === 'owner' && user.status === 'active') {
      const activeOwners = users.filter(u => u.role === 'owner' && u.status === 'active');
      if (activeOwners.length <= 1) {
        alert('لا يمكن تعطيل آخر حساب مالك نشط في النظام!');
        return;
      }
    }

    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    user.status = newStatus;
    storage.saveUsers(users);

    storage.logAudit(
      'admin',
      'المالك',
      newStatus === 'disabled' ? 'تعطيل حساب مستخدم' : 'تفعيل حساب مستخدم',
      'User',
      user.id,
      `تم ${newStatus === 'disabled' ? 'تعطيل' : 'تفعيل'} حساب ${user.displayName} (${user.username})`
    );

    refreshUsers();
  };

  // Reset password (USR-02, PAR-07)
  const handleResetPassword = (user: User) => {
    if (user.role === 'parent') {
      // Resets to phone number
      user.passwordHash = user.phone || user.username;
      user.mustChangePassword = false;
      storage.saveUsers(users);
      storage.logAudit(
        'admin',
        'المالك',
        'إعادة تعيين كلمة مرور ولي الأمر',
        'User',
        user.id,
        `تم إعادة تعيين كلمة مرور ولي الأمر ${user.displayName} إلى رقم الهاتف الأصلي (${user.phone})`
      );
      alert(`تمت إعادة تعيين كلمة مرور ولي الأمر إلى رقم هاتفه: ${user.phone}`);
    } else {
      // Generate 8-char random temporary password
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let temp = '';
      for (let i = 0; i < 8; i++) temp += chars.charAt(Math.floor(Math.random() * chars.length));

      user.passwordHash = temp;
      user.mustChangePassword = true;
      storage.saveUsers(users);
      storage.logAudit(
        'admin',
        'المالك',
        'إعادة تعيين كلمة مرور موظف',
        'User',
        user.id,
        `تم توليد كلمة مرور مؤقتة لحساب ${user.displayName}`
      );

      setTempPassInfo({
        name: user.displayName,
        username: user.username,
        pass: temp
      });
    }
    refreshUsers();
  };

  // Create Staff Handler (USR-03)
  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!staffName || !staffUsername || !staffPassword) {
      setFormError('يرجى تعبئة كافة الحقول المطلوبة');
      return;
    }

    if (users.some(u => u.username.toLowerCase() === staffUsername.trim().toLowerCase())) {
      setFormError('اسم المستخدم موجود مسبقاً، يرجى اختيار اسم آخر');
      return;
    }

    const newUser: User = {
      id: `usr_staff_${Date.now()}`,
      displayName: staffName.trim(),
      username: staffUsername.trim(),
      role: staffRole,
      passwordHash: staffPassword,
      mustChangePassword: false,
      status: 'active',
      phone: staffPhone.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    storage.saveUsers(users);

    storage.logAudit(
      'admin',
      'المالك',
      'إنشاء حساب موظف جديد',
      'User',
      newUser.id,
      `تم إنشاء حساب ${staffName} بصلاحية ${roleLabels[staffRole]}`
    );

    setShowAddStaffModal(false);
    setStaffName('');
    setStaffUsername('');
    setStaffPassword('');
    refreshUsers();
  };

  const filteredUsers = users.filter(u => {
    const name = u.displayName || (u.role === 'owner' ? 'الادمن' : u.username);
    const matchesSearch =
      name.includes(searchTerm) ||
      u.username.includes(searchTerm) ||
      (u.phone && u.phone.includes(searchTerm));
    const matchesRole = !roleFilter || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">إدارة الحسابات وصلاحيات النظام</h2>
          <p className="text-xs text-slate-500">
            التحكم في أدوار المستخدمين، كلمات المرور، ومراجعة سجل النشاط والتدقيق
          </p>
        </div>

        <button
          onClick={() => setShowAddStaffModal(true)}
          className="px-4 py-2 bg-[#1F4E8C] hover:bg-[#163A6B] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
        >
          <Plus className="w-4 h-4" />
          <span>إنشاء حساب موظف / مدير</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center bg-white p-1.5 rounded-2xl border border-slate-200 text-xs font-bold gap-2">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 rounded-xl transition ${
            activeTab === 'users'
              ? 'bg-[#1F4E8C] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          المستخدمون ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 rounded-xl transition flex items-center gap-1.5 ${
            activeTab === 'audit'
              ? 'bg-[#1F4E8C] text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>سجل النشاط والتدقيق (Audit Log)</span>
        </button>
      </div>

      {/* Tab: Users Table (USR-01) */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden space-y-4 p-5">
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث بالاسم أو اسم المستخدم أو الهاتف..."
                className="w-full px-3 py-2 pr-9 text-xs rounded-xl border border-slate-300 outline-hidden"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>

            <div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
              >
                <option value="">كافة الأدوار</option>
                <option value="owner">المالك / المدير</option>
                <option value="teacher">المعلمون</option>
                <option value="parent">أولياء الأمور</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right divide-y divide-slate-200">
              <thead className="bg-slate-50 font-bold text-slate-700">
                <tr>
                  <th className="p-3">الاسم</th>
                  <th className="p-3">الدور</th>
                  <th className="p-3">اسم المستخدم</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3">آخر دخول</th>
                  <th className="p-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/70 transition">
                    <td className="p-3 font-bold text-slate-900">{u.displayName || (u.role === 'owner' ? 'الادمن' : u.username)}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#1F4E8C]">
                        {roleLabels[u.role] || u.role}
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-700 font-semibold">{u.username}</td>
                    <td className="p-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          u.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {u.status === 'active' ? 'نشط' : 'معطّل'}
                      </span>
                    </td>
                    <td className="p-3 text-slate-400 text-[11px]">
                      {u.lastLogin ? formatArabicDate(u.lastLogin) : 'لم يسجل دخول'}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleResetPassword(u)}
                          className="p-1.5 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition"
                          title="إعادة تعيين كلمة المرور"
                        >
                          <Key className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleToggleStatus(u)}
                          className={`p-1.5 rounded-lg transition ${
                            u.status === 'active'
                              ? 'bg-rose-50 text-rose-600 hover:bg-rose-100'
                              : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                          }`}
                          title={u.status === 'active' ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                        >
                          {u.status === 'active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Audit Log */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h3 className="font-bold text-base text-slate-900">سجل تدقيق العمليات (غير قابل للتعديل)</h3>
            <span className="text-xs text-slate-400">آخر {auditLogs.length} عملية</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right divide-y divide-slate-200">
              <thead className="bg-slate-50 font-bold text-slate-700">
                <tr>
                  <th className="p-2.5">المستخدم</th>
                  <th className="p-2.5">العملية</th>
                  <th className="p-2.5">الكيان</th>
                  <th className="p-2.5">التفاصيل</th>
                  <th className="p-2.5">الوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/60">
                    <td className="p-2.5 font-bold text-slate-800">{log.userName}</td>
                    <td className="p-2.5 font-semibold text-[#1F4E8C]">{log.action}</td>
                    <td className="p-2.5 text-slate-500 font-mono text-[11px]">{log.entity}</td>
                    <td className="p-2.5 text-slate-600 leading-relaxed">{log.details}</td>
                    <td className="p-2.5 text-slate-400 text-[11px] whitespace-nowrap">
                      {formatArabicDate(log.timestamp)} - {formatArabicTime(log.timestamp.substring(11, 16))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Staff Modal (USR-03) */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <form onSubmit={handleCreateStaff} className="bg-white rounded-3xl p-6 max-w-md w-full text-right shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900 pb-2 border-b border-slate-200">
              إنشاء حساب موظف جديد
            </h3>

            {formError && (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الاسم الكامل</label>
              <input
                type="text"
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="مثال: أ. مروة الشاذلي"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستخدم للدخول</label>
              <input
                type="text"
                value={staffUsername}
                onChange={(e) => setStaffUsername(e.target.value)}
                placeholder="مثال: marwa أو sec_01"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الدور والصلاحية</label>
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value as any)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
              >
                <option value="owner">مدير / مشرف إداري (صلاحيات كاملة)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">كلمة المرور المبدئية</label>
              <input
                type="password"
                value={staffPassword}
                onChange={(e) => setStaffPassword(e.target.value)}
                placeholder="6 خانات على الأقل"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم الهاتف (اختياري)</label>
              <input
                type="tel"
                value={staffPhone}
                onChange={(e) => setStaffPhone(e.target.value)}
                placeholder="مثال: 01012345678"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 font-mono outline-hidden"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-[#1F4E8C] text-white rounded-xl text-xs font-bold hover:bg-[#163A6B]"
              >
                إنشاء الحساب
              </button>
              <button
                type="button"
                onClick={() => setShowAddStaffModal(false)}
                className="py-2.5 px-4 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Temp Password Dialog */}
      {tempPassInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-right shadow-2xl space-y-4">
            <h4 className="font-bold text-sm text-slate-900">كلمة المرور المؤقتة الجديدة:</h4>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <div>الحساب: <strong>{tempPassInfo.name}</strong></div>
              <div>اسم المستخدم: <strong className="font-mono text-[#1F4E8C]">{tempPassInfo.username}</strong></div>
              <div>كلمة المرور: <strong className="font-mono text-emerald-700 text-sm">{tempPassInfo.pass}</strong></div>
            </div>
            <button
              onClick={() => setTempPassInfo(null)}
              className="w-full py-2 bg-[#1F4E8C] text-white rounded-xl text-xs font-bold hover:bg-[#163A6B]"
            >
              تم
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
