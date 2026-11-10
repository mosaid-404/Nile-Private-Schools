import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Printer,
  Calendar,
  AlertCircle,
  FileText,
  DollarSign,
  TrendingUp,
  Clock,
  Send,
  CheckCircle,
  Download,
  Filter,
  Layers,
  Archive
} from 'lucide-react';
import { User, Receipt, Invoice, Student, FeePlan } from '../../types';
import { storage } from '../../services/storage';
import { formatCurrency, formatArabicDate, getTodayDateString } from '../../utils/arabic';
import { PaymentModal } from './PaymentModal';
import { ElectronicReceiptModal } from '../receipts/ElectronicReceiptModal';

interface Props {
  currentUser: User;
}

export const SecretaryDashboard: React.FC<Props> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'receipts' | 'overdue' | 'plans' | 'closing'>('overview');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [feePlans, setFeePlans] = useState<FeePlan[]>([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [overdueSearch, setOverdueSearch] = useState('');
  const [reminderSentStudentId, setReminderSentStudentId] = useState<string | null>(null);

  // New Fee Plan form states
  const [planName, setPlanName] = useState('');
  const [planAmount, setPlanAmount] = useState<number>(0);
  const [planType, setPlanType] = useState<'monthly' | 'session' | 'annual' | 'custom'>('monthly');
  const [planPeriod, setPlanPeriod] = useState('شهري');

  const todayStr = getTodayDateString();

  const loadData = () => {
    setReceipts(storage.getReceipts());
    setInvoices(storage.getInvoices());
    setStudents(storage.getStudents());
    setFeePlans(storage.getFeePlans());
  };

  useEffect(() => {
    loadData();
  }, []);

  // Financial KPI calculations
  const todayReceipts = receipts.filter(r => r.date === todayStr && r.status === 'valid');
  const todayTotal = todayReceipts.reduce((acc, r) => acc + r.amount, 0);

  const monthReceipts = receipts.filter(r => r.date.startsWith(todayStr.substring(0, 7)) && r.status === 'valid');
  const monthTotal = monthReceipts.reduce((acc, r) => acc + r.amount, 0);

  const totalRemaining = invoices.reduce((acc, inv) => acc + inv.remainingAmount, 0);
  const overdueInvoices = invoices.filter(inv => inv.remainingAmount > 0 && inv.dueDate < todayStr);
  const overdueCount = overdueInvoices.length;

  // Send Payment Reminder Notification (FIN-08)
  const handleSendReminder = (student: Student, invoice: Invoice) => {
    storage.sendPushNotification({
      recipientPhone: student.parentPhone,
      recipientRole: 'parent',
      title: 'تذكير بالرسوم الدراسية',
      body: `نحيطكم علماً بوجود مبلغ مستحق قدره ${invoice.remainingAmount} ج.م للطالب ${student.name} (${invoice.title}). يرجى المبادرة بالسداد.`,
      url: '/#parent-financials',
      type: 'reminder',
      studentId: student.id
    });

    setReminderSentStudentId(student.id);
    setTimeout(() => setReminderSentStudentId(null), 3000);
  };

  // Add Fee Plan & Auto-generate Invoices (FIN-01)
  const handleCreateFeePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planName || planAmount <= 0) return;

    const newPlan: FeePlan = {
      id: `plan_${Date.now()}`,
      name: planName,
      type: planType,
      amount: planAmount,
      periodicity: planPeriod
    };

    storage.saveFeePlan(newPlan);

    // Auto generate invoices for all active students (FIN-01)
    const activeStudents = students.filter(s => s.status === 'active');
    for (const st of activeStudents) {
      storage.saveInvoice({
        id: `inv_${Date.now()}_${st.id}`,
        studentId: st.id,
        feePlanId: newPlan.id,
        title: newPlan.name,
        amount: newPlan.amount,
        discount: 0,
        dueDate: todayStr,
        paidAmount: 0,
        remainingAmount: newPlan.amount,
        status: 'unpaid',
        createdAt: new Date().toISOString()
      });
    }

    setPlanName('');
    setPlanAmount(0);
    loadData();
    alert(`تم إنشاء خطة الرسوم وتوليد المطالبات لـ ${activeStudents.length} طالب بنجاح!`);
  };

  // Filter receipts
  const filteredReceipts = receipts.filter(r => {
    const st = students.find(s => s.id === r.studentId);
    return (
      r.serialNumber.includes(searchTerm) ||
      (st && st.name.includes(searchTerm)) ||
      r.issuedBy.includes(searchTerm)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6">
      {/* Header & Main Action */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-cyan-100 text-cyan-800 flex items-center justify-center font-bold text-xl shadow-xs">
            <CreditCard className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#163A6B]">
              إدارة الحسابات والرسوم المدرسية
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              متابعة التحصيلات، إصدار الإيصالات الإلكترونية، وإدارة المتأخرات
            </p>
          </div>
        </div>

        {/* Primary Action: Quick Payment (FIN-03) */}
        <button
          onClick={() => setShowPaymentModal(true)}
          className="py-3 px-6 rounded-2xl bg-[#1F4E8C] hover:bg-[#163A6B] text-white text-sm font-bold shadow-md shadow-blue-900/15 flex items-center justify-center gap-2 transition-all self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          <span>تسجيل دفعة نقدية جديدة</span>
        </button>
      </div>

      {/* KPI Cards (Section 11.3) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Today Collections */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-600">تحصيلات اليوم</span>
            <DollarSign className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-lg sm:text-2xl font-black text-emerald-700">
            {formatCurrency(todayTotal)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{todayReceipts.length} إيصال اليوم</p>
        </div>

        {/* Month Collections */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-600">تحصيلات الشهر</span>
            <TrendingUp className="w-4 h-4 text-[#1F4E8C]" />
          </div>
          <div className="text-lg sm:text-2xl font-black text-[#1F4E8C]">
            {formatCurrency(monthTotal)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{monthReceipts.length} إيصال هذا الشهر</p>
        </div>

        {/* Total Remaining Debt */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-600">إجمالي المتبقي</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-lg sm:text-2xl font-black text-amber-700">
            {formatCurrency(totalRemaining)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">مستحقات الطلاب غير المسددة</p>
        </div>

        {/* Overdue Count */}
        <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold text-slate-600">المتأخرون عن السداد</span>
            <AlertCircle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-lg sm:text-2xl font-black text-rose-700">
            {overdueCount} طالب
          </div>
          <p className="text-[11px] text-slate-400 mt-1">تجاوزوا تاريخ الاستحقاق</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-bold">
        {[
          { id: 'overview', label: 'لوحة المالية والتحصيلات' },
          { id: 'receipts', label: `سجل الإيصالات (${receipts.length})` },
          { id: 'overdue', label: `المتأخرون (${overdueCount})` },
          { id: 'plans', label: 'خطط الرسوم والمطالبات' },
          { id: 'closing', label: 'إقفال اليوم (الخزينة)' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 rounded-xl whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'bg-[#1F4E8C] text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Receipts List */}
          <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">آخر الإيصالات الصادرة</h2>
              <button
                onClick={() => setActiveTab('receipts')}
                className="text-xs font-bold text-[#1F4E8C] hover:underline"
              >
                عرض كافة الإيصالات ←
              </button>
            </div>

            <div className="space-y-2.5">
              {receipts.slice(0, 5).map(rcp => {
                const st = students.find(s => s.id === rcp.studentId);
                return (
                  <div
                    key={rcp.id}
                    onClick={() => setSelectedReceipt(rcp)}
                    className="p-3.5 rounded-2xl border border-slate-200 hover:border-[#1F4E8C] flex items-center justify-between text-xs cursor-pointer transition bg-slate-50/50 hover:bg-white"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-slate-900">{st?.name}</strong>
                        <span className="font-mono text-[11px] text-[#1F4E8C] font-bold">
                          {rcp.serialNumber}
                        </span>
                        {rcp.status === 'cancelled' && (
                          <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold">
                            مُلغى
                          </span>
                        )}
                      </div>
                      <p className="text-slate-500 mt-0.5">
                        {rcp.feeTitle} • {formatArabicDate(rcp.date)} • {rcp.paymentMethod}
                      </p>
                    </div>

                    <div className="text-left">
                      <strong className="text-emerald-700 font-extrabold text-sm block">
                        {formatCurrency(rcp.amount)}
                      </strong>
                      <span className="text-[10px] text-slate-400">بواسطة: {rcp.issuedBy}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Overdue Sidebar */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">المتأخرون عن السداد</h2>
              <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                {overdueCount} متأخر
              </span>
            </div>

            <div className="space-y-3">
              {overdueInvoices.slice(0, 4).map(inv => {
                const st = students.find(s => s.id === inv.studentId);
                if (!st) return null;
                return (
                  <div key={inv.id} className="p-3 rounded-2xl bg-rose-50/50 border border-rose-200 text-xs space-y-1.5">
                    <div className="flex justify-between font-bold text-slate-900">
                      <span>{st.name}</span>
                      <span className="text-rose-700">{formatCurrency(inv.remainingAmount)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex justify-between">
                      <span>{inv.title}</span>
                      <span>استحقاق: {inv.dueDate}</span>
                    </div>
                    <button
                      onClick={() => handleSendReminder(st, inv)}
                      className="w-full mt-1 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] flex items-center justify-center gap-1 transition"
                    >
                      <Send className="w-3 h-3" />
                      <span>{reminderSentStudentId === st.id ? 'تم الإرسال!' : 'إرسال تذكير فوري'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Receipts List (FIN-06) */}
      {activeTab === 'receipts' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">سجل الإيصالات الإلكترونية</h2>
              <p className="text-xs text-slate-500">كافة الإيصالات المالية الصادرة مع إمكانية الطباعة والإلغاء العكسي</p>
            </div>

            <div className="relative">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث برقم الإيصال أو اسم الطالب..."
                className="px-3 py-2 pr-9 rounded-xl border border-slate-300 text-xs focus:border-[#1F4E8C] outline-hidden w-64"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right divide-y divide-slate-200">
              <thead className="bg-slate-50 font-bold text-slate-700">
                <tr>
                  <th className="p-3">رقم الإيصال</th>
                  <th className="p-3">الطالب</th>
                  <th className="p-3">البند</th>
                  <th className="p-3">المبلغ</th>
                  <th className="p-3">طريقة الدفع</th>
                  <th className="p-3">التاريخ</th>
                  <th className="p-3">الموظف</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReceipts.map(rcp => {
                  const st = students.find(s => s.id === rcp.studentId);
                  return (
                    <tr key={rcp.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 font-mono font-bold text-[#1F4E8C]">{rcp.serialNumber}</td>
                      <td className="p-3 font-semibold text-slate-900">{st?.name}</td>
                      <td className="p-3 text-slate-600">{rcp.feeTitle}</td>
                      <td className="p-3 font-bold text-emerald-700">{formatCurrency(rcp.amount)}</td>
                      <td className="p-3 text-slate-600">{rcp.paymentMethod}</td>
                      <td className="p-3 text-slate-500">{formatArabicDate(rcp.date)}</td>
                      <td className="p-3 text-slate-600">{rcp.issuedBy}</td>
                      <td className="p-3">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            rcp.status === 'valid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {rcp.status === 'valid' ? 'ساري' : 'مُلغى'}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => setSelectedReceipt(rcp)}
                          className="px-2.5 py-1 rounded-lg bg-blue-50 text-[#1F4E8C] font-semibold text-[11px] hover:bg-blue-100 transition"
                        >
                          عرض الإيصال
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Overdue List (FIN-08) */}
      {activeTab === 'overdue' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">قائمة الطلاب المتأخرين عن السداد</h2>
              <p className="text-xs text-slate-500">إرسال تنبيهات فورية لأولياء الأمور مباشرة داخل التطبيق</p>
            </div>

            <div className="relative">
              <input
                type="text"
                value={overdueSearch}
                onChange={(e) => setOverdueSearch(e.target.value)}
                placeholder="بحث في المتأخرين..."
                className="px-3 py-2 pr-9 rounded-xl border border-slate-300 text-xs focus:border-[#1F4E8C] outline-hidden w-64"
              />
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right divide-y divide-slate-200">
              <thead className="bg-slate-50 font-bold text-slate-700">
                <tr>
                  <th className="p-3">الطالب</th>
                  <th className="p-3">الصف والفصل</th>
                  <th className="p-3">هاتف ولي الأمر</th>
                  <th className="p-3">المطالبة</th>
                  <th className="p-3">المبلغ المتبقي</th>
                  <th className="p-3">تاريخ الاستحقاق</th>
                  <th className="p-3 text-center">إرسال تذكير</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overdueInvoices.map(inv => {
                  const st = students.find(s => s.id === inv.studentId);
                  if (!st) return null;
                  return (
                    <tr key={inv.id} className="hover:bg-rose-50/30">
                      <td className="p-3 font-bold text-slate-900">{st.name}</td>
                      <td className="p-3 text-slate-600">{st.grade} - {st.classNumber}</td>
                      <td className="p-3 font-mono text-slate-700">{st.parentPhone}</td>
                      <td className="p-3 text-slate-700">{inv.title}</td>
                      <td className="p-3 font-bold text-rose-700">{formatCurrency(inv.remainingAmount)}</td>
                      <td className="p-3 text-slate-500">{inv.dueDate}</td>
                      <td className="p-3 text-center">
                        <button
                          onClick={() => handleSendReminder(st, inv)}
                          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 mx-auto transition"
                        >
                          <Send className="w-3 h-3" />
                          <span>{reminderSentStudentId === st.id ? 'تم الإرسال!' : 'إرسال تذكير'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Fee Plans & Invoicing (FIN-01) */}
      {activeTab === 'plans' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Plan Form */}
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-base font-bold text-slate-900">إنشاء خطة رسوم جديدة</h2>
            <form onSubmit={handleCreateFeePlan} className="space-y-3 text-right">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الخطة / البند</label>
                <input
                  type="text"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder="مثال: اشتراك شهر ديسمبر 2026"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المبلغ المطلوب (ج.م)</label>
                <input
                  type="number"
                  min="1"
                  value={planAmount || ''}
                  onChange={(e) => setPlanAmount(parseFloat(e.target.value) || 0)}
                  placeholder="مثال: 800"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">نوع الرسوم</label>
                <select
                  value={planType}
                  onChange={(e) => setPlanType(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
                >
                  <option value="monthly">اشتراك شهري</option>
                  <option value="session">رسوم حصص / تقوية</option>
                  <option value="annual">مصروفات دراسية سنوية</option>
                  <option value="custom">رسوم أخرى مخصصة</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-[#1F4E8C] text-white rounded-xl font-bold text-xs hover:bg-[#163A6B] shadow-xs mt-2"
              >
                حفظ الخطة وتوليد المطالبات لجميع الطلاب
              </button>
            </form>
          </div>

          {/* Existing Plans */}
          <div className="lg:col-span-2 bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
            <h2 className="text-base font-bold text-slate-900">خطط الرسوم المعتمدة</h2>
            <div className="space-y-3">
              {feePlans.map(p => (
                <div key={p.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">{p.name}</h3>
                    <p className="text-slate-500 mt-0.5">{p.description || `الدورية: ${p.periodicity}`}</p>
                  </div>
                  <strong className="text-base font-black text-[#1F4E8C]">
                    {formatCurrency(p.amount)}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Daily Closing (FIN-10) */}
      {activeTab === 'closing' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">إقفال اليوم ومطابقة الخزينة</h2>
              <p className="text-xs text-slate-500">مطابقة التحصيلات اليومية الفعلية حسب طريقة السداد لتسليم العهدة</p>
            </div>
            <button
              onClick={() => window.print()}
              className="px-3.5 py-1.5 bg-[#1F4E8C] text-white text-xs font-bold rounded-xl flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة كشف الإقفال</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              {
                title: 'نقداً (خزينة)',
                amount: todayReceipts.filter(r => r.paymentMethod.includes('نقداً')).reduce((a, b) => a + b.amount, 0),
                count: todayReceipts.filter(r => r.paymentMethod.includes('نقداً')).length
              },
              {
                title: 'تحويلات بنكية',
                amount: todayReceipts.filter(r => r.paymentMethod.includes('تحويل')).reduce((a, b) => a + b.amount, 0),
                count: todayReceipts.filter(r => r.paymentMethod.includes('تحويل')).length
              },
              {
                title: 'محافظ إلكترونية',
                amount: todayReceipts.filter(r => r.paymentMethod.includes('محفظة')).reduce((a, b) => a + b.amount, 0),
                count: todayReceipts.filter(r => r.paymentMethod.includes('محفظة')).length
              },
              {
                title: 'شيكات',
                amount: todayReceipts.filter(r => r.paymentMethod.includes('شيك')).reduce((a, b) => a + b.amount, 0),
                count: todayReceipts.filter(r => r.paymentMethod.includes('شيك')).length
              }
            ].map((box, i) => (
              <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-right">
                <span className="text-xs font-bold text-slate-600 block mb-1">{box.title}</span>
                <strong className="text-lg font-black text-slate-900">{formatCurrency(box.amount)}</strong>
                <span className="text-[10px] text-slate-400 block mt-1">{box.count} حركة دفع</span>
              </div>
            ))}
          </div>

          <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between text-xs">
            <span className="font-bold text-emerald-900">إجمالي المبالغ الواجب مطابقتها بالخزينة لليوم:</span>
            <strong className="text-lg font-black text-emerald-800">{formatCurrency(todayTotal)}</strong>
          </div>
        </div>
      )}

      {/* Modals */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        currentUser={currentUser}
        onPaymentSuccess={(rcp) => {
          loadData();
          setSelectedReceipt(rcp);
        }}
      />

      {selectedReceipt && (
        <ElectronicReceiptModal
          isOpen={true}
          receipt={selectedReceipt}
          onClose={() => setSelectedReceipt(null)}
          onCancelReceipt={(id, reason) => {
            storage.cancelReceipt(id, reason, currentUser.displayName);
            loadData();
            setSelectedReceipt(null);
          }}
          canCancel={currentUser.role === 'owner' || currentUser.role === 'secretary'}
        />
      )}
    </div>
  );
};
