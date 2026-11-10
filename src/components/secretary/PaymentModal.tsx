import React, { useState, useEffect } from 'react';
import { CreditCard, Search, Check, AlertCircle, ArrowRight, User } from 'lucide-react';
import { Student, Invoice, Receipt, User as UserType } from '../../types';
import { storage } from '../../services/storage';
import { formatCurrency } from '../../utils/arabic';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserType;
  onPaymentSuccess: (receipt: Receipt) => void;
  initialStudentId?: string;
}

export const PaymentModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentUser,
  onPaymentSuccess,
  initialStudentId
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [studentInvoices, setStudentInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [amount, setAmount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'wallet' | 'cheque'>('cash');
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const allStudents = storage.getStudents().filter(s => s.status === 'active');

  useEffect(() => {
    if (!isOpen) {
      setSelectedStudent(null);
      setSelectedInvoiceId('');
      setAmount(0);
      setNote('');
      setErrorMsg('');
      return;
    }

    if (initialStudentId) {
      const st = allStudents.find(s => s.id === initialStudentId);
      if (st) handleSelectStudent(st);
    }
  }, [isOpen, initialStudentId]);

  if (!isOpen) return null;

  const handleSelectStudent = (st: Student) => {
    setSelectedStudent(st);
    const invoices = storage.getInvoices().filter(i => i.studentId === st.id && i.remainingAmount > 0);
    setStudentInvoices(invoices);
    if (invoices.length > 0) {
      setSelectedInvoiceId(invoices[0].id);
      setAmount(invoices[0].remainingAmount);
    } else {
      setSelectedInvoiceId('');
      setAmount(0);
    }
    setErrorMsg('');
  };

  const selectedInvoice = studentInvoices.find(i => i.id === selectedInvoiceId);

  // Live balance calculation (FIN-03)
  const currentRemaining = selectedInvoice ? selectedInvoice.remainingAmount : 0;
  const newRemaining = Math.max(0, currentRemaining - (amount || 0));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedStudent) {
      setErrorMsg('يرجى اختيار الطالب أولاً.');
      return;
    }

    if (!selectedInvoiceId) {
      setErrorMsg('يرجى اختيار البند / المطالبة المراد سدادها.');
      return;
    }

    if (amount <= 0) {
      setErrorMsg('المبلغ المدفوع يجب أن يكون أكبر من صفر.');
      return;
    }

    if (amount > currentRemaining) {
      setErrorMsg(`المبلغ المدفوع أكبر من المتبقي على الطالب (${formatCurrency(currentRemaining)}).`);
      return;
    }

    const res = storage.registerPayment({
      invoiceId: selectedInvoiceId,
      studentId: selectedStudent.id,
      amount,
      method: paymentMethod,
      receivedBy: currentUser.displayName,
      note
    });

    if (res.success && res.receipt) {
      onPaymentSuccess(res.receipt);
      onClose();
    } else {
      setErrorMsg(res.error || 'حدث خطأ أثناء تسجيل الدفعة.');
    }
  };

  const matchingStudents = searchTerm.trim()
    ? allStudents.filter(
        s =>
          s.name.includes(searchTerm) ||
          s.code.includes(searchTerm) ||
          s.parentPhone.includes(searchTerm)
      )
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#1F4E8C] text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white/10">
              <CreditCard className="w-5 h-5 text-blue-100" />
            </div>
            <div>
              <h3 className="font-bold text-base">تسجيل دفعة نقدية جديدة</h3>
              <p className="text-xs text-blue-100">إصدار إيصال مالي إلكتروني فوري</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 text-right overflow-y-auto flex-1">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Student Search & Pick */}
          {!selectedStudent ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                البحث عن الطالب (بالاسم، الكود، أو هاتف ولي الأمر):
              </label>
              <div className="relative mb-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="ابحث هنا (مثال: محمد، 1001، 010...)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#1F4E8C] outline-hidden pr-3 pl-10"
                  autoFocus
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>

              {searchTerm && matchingStudents.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">لا يوجد طلاب مطابقين للبحث</p>
              )}

              <div className="max-h-48 overflow-y-auto space-y-1.5 divide-y divide-slate-100">
                {matchingStudents.map(st => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleSelectStudent(st)}
                    className="w-full pt-1.5 text-right p-2.5 rounded-xl hover:bg-blue-50/70 border border-transparent hover:border-blue-200 transition flex items-center justify-between text-xs"
                  >
                    <div>
                      <strong className="text-slate-900 block">{st.name}</strong>
                      <span className="text-slate-500">{st.grade} - فصل {st.classNumber}</span>
                    </div>
                    <span className="font-mono bg-slate-100 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-700">
                      {st.code}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Selected Student Box */
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#1F4E8C] text-white flex items-center justify-center font-bold">
                  {selectedStudent.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-slate-900">{selectedStudent.name}</h4>
                  <p className="text-xs text-slate-500">
                    كود: {selectedStudent.code} • {selectedStudent.grade} - فصل {selectedStudent.classNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedStudent(null)}
                className="text-xs text-[#1F4E8C] font-semibold hover:underline"
              >
                تغيير
              </button>
            </div>
          )}

          {selectedStudent && (
            <>
              {/* Select Invoice */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  البند أو المطالبة المستحقة:
                </label>
                {studentInvoices.length === 0 ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs">
                    الطالب ليس عليه أي مطالبات مستحقة غير مسددة.
                  </div>
                ) : (
                  <select
                    value={selectedInvoiceId}
                    onChange={(e) => {
                      setSelectedInvoiceId(e.target.value);
                      const inv = studentInvoices.find(i => i.id === e.target.value);
                      if (inv) setAmount(inv.remainingAmount);
                    }}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold focus:border-[#1F4E8C] outline-hidden bg-white"
                  >
                    {studentInvoices.map(inv => (
                      <option key={inv.id} value={inv.id}>
                        {inv.title} — المستحق المتبقي: {formatCurrency(inv.remainingAmount)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Amount to pay */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  المبلغ المدفوع الآن (ج.م):
                </label>
                <input
                  type="number"
                  min="1"
                  max={currentRemaining}
                  value={amount || ''}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-emerald-800 focus:border-[#1F4E8C] outline-hidden"
                  placeholder="أدخل المبلغ"
                  required
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  طريقة السداد:
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { id: 'cash', label: 'نقداً (خزينة)' },
                    { id: 'bank_transfer', label: 'تحويل بنكي' },
                    { id: 'wallet', label: 'محفظة (إنستاباي / كاش)' },
                    { id: 'cheque', label: 'شيك بنكي' }
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as any)}
                      className={`p-2.5 rounded-xl border text-center font-semibold transition ${
                        paymentMethod === m.id
                          ? 'border-[#1F4E8C] bg-blue-50 text-[#1F4E8C] font-bold'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Balance Preview (FIN-03) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <div className="flex justify-between text-slate-600">
                  <span>المبلغ المستحق الحالي:</span>
                  <strong className="text-slate-800">{formatCurrency(currentRemaining)}</strong>
                </div>
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>المبلغ المدفوع الآن:</span>
                  <strong>{formatCurrency(amount || 0)}</strong>
                </div>
                <div className="flex justify-between font-bold pt-1 border-t border-slate-200">
                  <span className="text-slate-800">المتبقي على الطالب بعد الدفع:</span>
                  <strong className={newRemaining > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                    {formatCurrency(newRemaining)}
                  </strong>
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  ملاحظات إضافية (اختياري):
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="ملاحظات تظهر على الإيصال..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs outline-hidden"
                />
              </div>
            </>
          )}

          {/* Action Buttons */}
          <div className="pt-3 flex gap-2">
            <button
              type="submit"
              disabled={!selectedStudent || !selectedInvoiceId || amount <= 0}
              className="flex-1 py-3 bg-[#1F4E8C] hover:bg-[#163A6B] disabled:opacity-50 text-white rounded-xl font-bold text-sm shadow-md transition-colors"
            >
              تسجيل الدفعة وإصدار الإيصال
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs"
            >
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
