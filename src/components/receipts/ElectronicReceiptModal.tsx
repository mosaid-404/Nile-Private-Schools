import React, { useRef } from 'react';
import { Printer, Download, Share2, X, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Receipt, Student, Invoice } from '../../types';
import { storage } from '../../services/storage';
import { formatArabicDate, formatCurrency, tafqeet } from '../../utils/arabic';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  receipt: Receipt;
  onCancelReceipt?: (receiptId: string, reason: string) => void;
  canCancel?: boolean;
}

export const ElectronicReceiptModal: React.FC<Props> = ({
  isOpen,
  onClose,
  receipt,
  onCancelReceipt,
  canCancel = false
}) => {
  const [showCancelPrompt, setShowCancelPrompt] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');
  const printRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const settings = storage.getSettings();
  const student = storage.getStudents().find(s => s.id === receipt.studentId);
  const parent = storage.getParents().find(p => p.id === student?.parentId);

  const handlePrint = () => {
    window.print();
  };

  const handleConfirmCancel = () => {
    if (!cancelReason.trim()) return;
    if (onCancelReceipt) {
      onCancelReceipt(receipt.id, cancelReason.trim());
      setShowCancelPrompt(false);
    }
  };

  // Generate SVG QR code data URL representation
  const qrVerificationText = `https://nps.edu.eg/verify?rcp=${receipt.serialNumber}&amount=${receipt.amount}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/65 backdrop-blur-xs">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
        {/* Modal Controls (Hidden in Print) */}
        <div className="bg-[#1F4E8C] text-white p-4 px-6 flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <span className="font-bold text-base">الإيصال المالي الإلكتروني</span>
            <span className="font-mono text-xs bg-white/20 px-2.5 py-0.5 rounded-full font-semibold">
              {receipt.serialNumber}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-[#1F4E8C] text-xs font-bold shadow-xs hover:bg-blue-50 transition"
              title="طباعة الإيصال (A4)"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/10 text-white transition"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Receipt Body (Compliant with Appendix B) */}
        <div ref={printRef} className="p-6 sm:p-8 overflow-y-auto space-y-6 text-right print-page">
          {/* Watermark if Cancelled (FIN-07) */}
          {receipt.status === 'cancelled' && (
            <div className="border-2 border-rose-600 bg-rose-50 text-rose-800 p-3 rounded-2xl text-center font-bold text-sm">
              <span>هذا الإيصال مُلغى بموجب إيصال عكسي رقم: </span>
              <strong className="font-mono">{receipt.reversedReceiptSerial}</strong>
              <div className="text-xs text-rose-600 font-normal mt-0.5">
                سبب الإلغاء: {receipt.cancellationReason}
              </div>
            </div>
          )}

          {/* School Header */}
          <div className="flex items-center justify-between border-b-2 border-[#1F4E8C]/20 pb-4">
            <div className="text-right">
              <h2 className="text-lg font-black text-[#163A6B]">{settings.schoolName}</h2>
              <p className="text-xs text-slate-600 mt-0.5">{settings.address}</p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                هواتف: {settings.phones.join(' - ')}
              </p>
            </div>
            <div className="w-16 h-16 rounded-2xl bg-[#011242] flex items-center justify-center shrink-0 overflow-hidden">
              <img src="/icons/app-logo.png" alt="NPS Logo" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Receipt Info Title & Date */}
          <div className="flex items-center justify-between text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <span className="text-slate-500">رقم الإيصال: </span>
              <strong className="font-mono text-sm text-[#1F4E8C]">{receipt.serialNumber}</strong>
            </div>
            <div>
              <span className="text-slate-500">تاريخ الإصدار: </span>
              <strong>{formatArabicDate(receipt.date)}</strong>
            </div>
          </div>

          {/* Student Info Box */}
          <div className="grid grid-cols-2 gap-3 text-xs p-4 rounded-2xl border border-slate-200 bg-blue-50/20">
            <div>
              <span className="text-slate-500 block mb-0.5">اسم الطالب:</span>
              <strong className="text-sm text-slate-900">{student?.name || '---'}</strong>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">كود الطالب:</span>
              <strong className="font-mono text-sm text-slate-900">{student?.code || '---'}</strong>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">الصف والفصل:</span>
              <strong className="text-slate-900">{student?.grade} - فصل {student?.classNumber}</strong>
            </div>
            <div>
              <span className="text-slate-500 block mb-0.5">ولي الأمر:</span>
              <strong className="text-slate-900">{parent?.displayName || student?.parentPhone}</strong>
            </div>
          </div>

          {/* Payment Breakdown */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-xs text-right divide-y divide-slate-200">
              <thead className="bg-slate-100 font-bold text-slate-700">
                <tr>
                  <th className="p-3">بيان البند والرسوم</th>
                  <th className="p-3 text-left">طريقة السداد</th>
                  <th className="p-3 text-left">المبلغ المدفوع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="p-3 font-semibold text-slate-800">{receipt.feeTitle}</td>
                  <td className="p-3 text-left text-slate-600">{receipt.paymentMethod}</td>
                  <td className="p-3 text-left font-bold text-emerald-700 text-sm">
                    {formatCurrency(receipt.amount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Tafqeet (Amount in words) */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs text-slate-800">
            <span className="text-slate-500">المبلغ بالحروف: </span>
            <strong className="text-[#1F4E8C] font-semibold">{tafqeet(receipt.amount)}</strong>
          </div>

          {/* Balance Summary & QR Code */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div className="sm:col-span-2 space-y-1.5 text-xs text-slate-700 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
              <div className="flex justify-between">
                <span>إجمالي المطلوب:</span>
                <strong>{formatCurrency(receipt.totalRequired)}</strong>
              </div>
              <div className="flex justify-between">
                <span>إجمالي المسدد حتى تاريخه:</span>
                <strong className="text-emerald-700">{formatCurrency(receipt.totalPaidToDate)}</strong>
              </div>
              <div className="flex justify-between font-bold text-sm pt-1 border-t border-slate-200">
                <span>المتبقي بعد الدفعة:</span>
                <strong className={receipt.remainingBalance > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                  {formatCurrency(receipt.remainingBalance)}
                </strong>
              </div>
            </div>

            {/* QR Code Verification box */}
            <div className="flex flex-col items-center justify-center p-3 rounded-2xl border border-slate-200 bg-white text-center">
              <div className="w-20 h-20 bg-slate-100 p-1.5 rounded-xl border flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  {/* Stylized QR pattern */}
                  <rect x="0" y="0" width="30" height="30" fill="#1F4E8C" />
                  <rect x="5" y="5" width="20" height="20" fill="white" />
                  <rect x="10" y="10" width="10" height="10" fill="#1F4E8C" />

                  <rect x="70" y="0" width="30" height="30" fill="#1F4E8C" />
                  <rect x="75" y="5" width="20" height="20" fill="white" />
                  <rect x="80" y="10" width="10" height="10" fill="#1F4E8C" />

                  <rect x="0" y="70" width="30" height="30" fill="#1F4E8C" />
                  <rect x="5" y="75" width="20" height="20" fill="white" />
                  <rect x="10" y="80" width="10" height="10" fill="#1F4E8C" />

                  <rect x="40" y="40" width="20" height="20" fill="#1F4E8C" />
                  <circle cx="50" cy="50" r="4" fill="white" />
                </svg>
              </div>
              <span className="text-[10px] text-slate-400 mt-1 font-mono">مسح للتحقق</span>
            </div>
          </div>

          {/* Signatures Footer */}
          <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-200 text-xs text-slate-700">
            <div>
              <p className="font-semibold text-slate-500 mb-6">الموظف المستلم:</p>
              <p className="font-bold text-slate-900">{receipt.issuedBy}</p>
            </div>
            <div className="text-left">
              <p className="font-semibold text-slate-500 mb-6">ختم الإدارة / الخزينة:</p>
              <div className="w-24 h-12 border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-[10px] text-slate-400 mr-auto">
                خاتم المدرسة
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Actions (Hidden in Print) */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between no-print">
          <div>
            {canCancel && receipt.status === 'valid' && (
              <button
                onClick={() => setShowCancelPrompt(true)}
                className="text-xs text-rose-600 hover:text-rose-800 font-bold"
              >
                إلغاء الإيصال (إيصال عكسي)
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-[#1F4E8C] text-white rounded-xl text-xs font-bold hover:bg-[#163A6B] flex items-center gap-1.5"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-300"
            >
              إغلاق
            </button>
          </div>
        </div>
      </div>

      {/* Cancel Prompt Modal */}
      {showCancelPrompt && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full text-right shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>تأكيد إلغاء الإيصال المالي</span>
            </div>
            <p className="text-xs text-slate-600">
              وفقاً للنظام المالي، لا يُحذف الإيصال وإنما يتم إصدار إيصال عكسي مسجل في سجل التدقيق. يرجى ذكر سبب الإلغاء:
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="اكتب سبب الإلغاء (مثال: خطأ في المبلغ / استرداد الرسوم)..."
              className="w-full p-2.5 rounded-xl border border-slate-300 text-xs outline-hidden focus:border-rose-600"
              rows={3}
              required
            />
            <div className="flex gap-2">
              <button
                onClick={handleConfirmCancel}
                className="flex-1 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold hover:bg-rose-700"
              >
                تأكيد الإلغاء
              </button>
              <button
                onClick={() => setShowCancelPrompt(false)}
                className="py-2 px-3 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
