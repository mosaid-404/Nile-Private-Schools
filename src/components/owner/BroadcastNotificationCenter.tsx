import React, { useState } from 'react';
import {
  Send,
  Bell,
  Users,
  GraduationCap,
  Layers,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Smartphone,
  Eye,
  Check,
  Filter,
  History,
  X,
  Megaphone
} from 'lucide-react';
import { Teacher, Student, SchoolClass, BroadcastNotification, User } from '../../types';
import { storage } from '../../services/storage';
import { formatArabicDate, formatArabicTime } from '../../utils/arabic';

interface Props {
  currentUser: User;
}

export const BroadcastNotificationCenter: React.FC<Props> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'compose' | 'history'>('compose');

  // Form states
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<'general' | 'academic' | 'activity' | 'honor' | 'urgent'>('general');
  const [targetType, setTargetType] = useState<
    'all_teachers' | 'specific_teachers' | 'all_parents' | 'grade' | 'grade_class' | 'specific_students'
  >('all_parents');

  // Specific selections
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [selectedClassNumber, setSelectedClassNumber] = useState<number>(1);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [teacherSearch, setTeacherSearch] = useState('');

  // Status feedback
  const [successInfo, setSuccessInfo] = useState<{ count: number; title: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Data
  const teachers = storage.getTeachers().filter(t => t.status === 'active');
  const students = storage.getStudents().filter(s => s.status === 'active');
  const settings = storage.getSettings();
  const grades = settings.grades;
  const classes = storage.getClasses();
  const broadcasts = storage.getBroadcasts();

  // Compute recipient list based on current target selection
  const computeRecipients = () => {
    if (targetType === 'all_teachers') {
      return teachers.map(t => ({ id: t.id, name: t.name, role: 'معلم', sub: t.subject }));
    }
    if (targetType === 'specific_teachers') {
      return teachers
        .filter(t => selectedTeacherIds.includes(t.id))
        .map(t => ({ id: t.id, name: t.name, role: 'معلم', sub: t.subject }));
    }
    if (targetType === 'all_parents') {
      return students.map(s => ({
        id: s.id,
        name: s.name,
        role: 'ولي أمر',
        sub: `${s.grade} - فصل ${s.classNumber}`
      }));
    }
    if (targetType === 'grade' && selectedGrade) {
      return students
        .filter(s => s.grade === selectedGrade)
        .map(s => ({
          id: s.id,
          name: s.name,
          role: 'ولي أمر',
          sub: `${s.grade} - فصل ${s.classNumber}`
        }));
    }
    if (targetType === 'grade_class' && selectedGrade && selectedClassNumber) {
      return students
        .filter(s => s.grade === selectedGrade && s.classNumber === selectedClassNumber)
        .map(s => ({
          id: s.id,
          name: s.name,
          role: 'ولي أمر',
          sub: `${s.grade} - فصل ${s.classNumber}`
        }));
    }
    if (targetType === 'specific_students') {
      return students
        .filter(s => selectedStudentIds.includes(s.id))
        .map(s => ({
          id: s.id,
          name: s.name,
          role: 'ولي أمر',
          sub: `${s.grade} - فصل ${s.classNumber}`
        }));
    }
    return [];
  };

  const computedRecipients = computeRecipients();

  // Get Target Label for summary
  const getTargetLabel = () => {
    switch (targetType) {
      case 'all_teachers':
        return 'جميع المعلمين وهيئة التدريس';
      case 'specific_teachers':
        return `معلمون محددون (${selectedTeacherIds.length} معلم)`;
      case 'all_parents':
        return 'جميع أولياء الأمور والطلاب بالمدرسة';
      case 'grade':
        return selectedGrade ? `طلاب ${selectedGrade}` : 'صف دراسي كامل';
      case 'grade_class':
        return selectedGrade ? `طلاب ${selectedGrade} - فصل ${selectedClassNumber}` : 'صف وفصل محدد';
      case 'specific_students':
        return `طلاب وأولياء أمور معينون (${selectedStudentIds.length} طالب)`;
      default:
        return 'المستلمون';
    }
  };

  // Quick preset messages
  const applyPreset = (presetTitle: string, presetBody: string, presetCategory: any) => {
    setTitle(presetTitle);
    setBody(presetBody);
    setCategory(presetCategory);
  };

  // Submit Handler
  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccessInfo(null);

    if (!title.trim() || !body.trim()) {
      setFormError('يرجى كتابة عنوان الرسالة ونص الإشعار.');
      return;
    }

    if (computedRecipients.length === 0) {
      setFormError('لم يتم تحديد أي مستلمين، يرجى اختيار جهة الاستهداف المناسبة.');
      return;
    }

    setIsSending(true);

    setTimeout(() => {
      const res = storage.sendBroadcastNotification({
        title: title.trim(),
        body: body.trim(),
        category,
        targetType,
        targetLabel: getTargetLabel(),
        teacherIds: targetType === 'specific_teachers' ? selectedTeacherIds : undefined,
        grade: targetType === 'grade' || targetType === 'grade_class' ? selectedGrade : undefined,
        classNumber: targetType === 'grade_class' ? selectedClassNumber : undefined,
        studentIds: targetType === 'specific_students' ? selectedStudentIds : undefined,
        senderName: currentUser.displayName
      });

      setIsSending(false);
      setSuccessInfo({
        count: res.sentCount,
        title: title.trim()
      });

      // Reset fields
      setTitle('');
      setBody('');
    }, 400);
  };

  const categoryLabels: Record<string, { label: string; bg: string; text: string }> = {
    general: { label: 'تنبيه عام', bg: 'bg-blue-100', text: 'text-blue-800' },
    academic: { label: 'إشعار دراسي', bg: 'bg-emerald-100', text: 'text-emerald-800' },
    activity: { label: 'نشاط وتكريم', bg: 'bg-purple-100', text: 'text-purple-800' },
    urgent: { label: 'عاجل وهام', bg: 'bg-rose-100', text: 'text-rose-800' },
    honor: { label: 'تهنئة وتقدير', bg: 'bg-amber-100', text: 'text-amber-800' }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-100 text-[#1F4E8C] flex items-center justify-center font-bold text-xl shadow-xs">
            <Megaphone className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#163A6B]">
              مركز إرسال الإشعارات والرسائل الجماعية
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              إرسال رسائل وتنبيهات فورية للمعلمين، أولياء الأمور، صفوف معينة، أو طلاب محددين
            </p>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center bg-slate-100 p-1.5 rounded-2xl text-xs font-bold gap-1 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('compose')}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === 'compose'
                ? 'bg-[#1F4E8C] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            إرسال إشعار جديد
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-xl transition-all ${
              activeTab === 'history'
                ? 'bg-[#1F4E8C] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            سجل الإرسال ({broadcasts.length})
          </button>
        </div>
      </div>

      {/* Tab 1: Compose & Send */}
      {activeTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Form (2 cols) */}
          <form onSubmit={handleSend} className="lg:col-span-2 space-y-5 text-right">
            {/* Success Alert */}
            {successInfo && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 flex items-center justify-between text-xs sm:text-sm font-bold shadow-xs">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>
                    تم إرسال الإشعار بنجاح إلى <strong>{successInfo.count} مستلم</strong>!
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessInfo(null)}
                  className="text-emerald-700 hover:text-emerald-900"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Error Alert */}
            {formError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            {/* Section 1: Target Selection */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                  <Users className="w-4 h-4 text-[#1F4E8C]" />
                  <span>تحديد جهة الاستهداف (لمن تريد إرسال الإشعار؟)</span>
                </div>
                <span className="text-xs font-extrabold px-3 py-1 rounded-full bg-blue-50 text-[#1F4E8C]">
                  {computedRecipients.length} مستلم محدد
                </span>
              </div>

              {/* Target Type Selector Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { id: 'all_teachers', label: 'المعلمون فقط (الكل)', desc: 'جميع هيئة التدريس' },
                  { id: 'specific_teachers', label: 'معلمون محددون', desc: 'اختيار معلمين بأسمائهم' },
                  { id: 'all_parents', label: 'كافة أولياء الأمور', desc: 'كل طلاب المدرسة' },
                  { id: 'grade', label: 'صف دراسي كامل', desc: 'مثل: الصف الرابع الابتدائي' },
                  { id: 'grade_class', label: 'صف وفصل محدد', desc: 'مثل: 4 ابتدائي - فصل 3' },
                  { id: 'specific_students', label: 'طلاب / أولياء أمور معينون', desc: 'بحث وتحديد بالاسم' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setTargetType(opt.id as any);
                      if (opt.id === 'grade' || opt.id === 'grade_class') {
                        if (!selectedGrade && grades.length > 0) setSelectedGrade(grades[0]);
                      }
                    }}
                    className={`p-3 rounded-2xl border text-right transition-all cursor-pointer ${
                      targetType === opt.id
                        ? 'border-[#1F4E8C] bg-blue-50/70 font-bold text-[#1F4E8C] shadow-2xs'
                        : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100 text-slate-700'
                    }`}
                  >
                    <div className="font-bold">{opt.label}</div>
                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>

              {/* Conditional Target Filter Controls */}

              {/* 1. Specific Teachers Selection */}
              {targetType === 'specific_teachers' && (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1">
                    <span>اختر المعلمين المطلوبين:</span>
                    <button
                      type="button"
                      onClick={() => setSelectedTeacherIds(teachers.map(t => t.id))}
                      className="text-[#1F4E8C] hover:underline"
                    >
                      تحديد الجميع
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1">
                    {teachers.map(t => {
                      const isSelected = selectedTeacherIds.includes(t.id);
                      return (
                        <label
                          key={t.id}
                          className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 cursor-pointer transition ${
                            isSelected
                              ? 'bg-blue-100 border-[#1F4E8C] text-[#1F4E8C] font-bold'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedTeacherIds(prev =>
                                isSelected ? prev.filter(x => x !== t.id) : [...prev, t.id]
                              );
                            }}
                            className="rounded text-[#1F4E8C]"
                          />
                          <span className="truncate">{t.name} ({t.subject})</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2. Grade Selection */}
              {targetType === 'grade' && (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    اختر الصف الدراسي المطلوب:
                  </label>
                  <select
                    value={selectedGrade}
                    onChange={(e) => setSelectedGrade(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
                  >
                    {grades.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 3. Grade & Class Number Selection */}
              {targetType === 'grade_class' && (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        الصف الدراسي:
                      </label>
                      <select
                        value={selectedGrade}
                        onChange={(e) => setSelectedGrade(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
                      >
                        {grades.map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        رقم الفصل:
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={selectedClassNumber}
                        onChange={(e) => setSelectedClassNumber(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    سيصل الإشعار لجميع أولياء أمور طلاب <strong>{selectedGrade} - فصل {selectedClassNumber}</strong> فقط.
                  </p>
                </div>
              )}

              {/* 4. Specific Students Selection */}
              {targetType === 'specific_students' && (
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>البحث واختيار الطلاب المعنيين:</span>
                    <span className="text-slate-400">محدد: {selectedStudentIds.length} طالب</span>
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      placeholder="ابحث باسم الطالب أو الكود..."
                      className="w-full px-3 py-2 pr-9 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                  </div>

                  <div className="space-y-1 max-h-48 overflow-y-auto divide-y divide-slate-100 pr-1">
                    {students
                      .filter(s => s.name.includes(studentSearch) || s.code.includes(studentSearch))
                      .map(s => {
                        const isSelected = selectedStudentIds.includes(s.id);
                        return (
                          <label
                            key={s.id}
                            className={`pt-1.5 p-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition ${
                              isSelected ? 'bg-blue-100 font-bold text-[#1F4E8C]' : 'hover:bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedStudentIds(prev =>
                                    isSelected ? prev.filter(x => x !== s.id) : [...prev, s.id]
                                  );
                                }}
                                className="rounded text-[#1F4E8C]"
                              />
                              <span>{s.name}</span>
                            </div>
                            <span className="text-[11px] text-slate-400 font-mono">
                              {s.grade} - {s.classNumber}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* Section 2: Message Content */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                  <Bell className="w-4 h-4 text-[#1F4E8C]" />
                  <span>محتوى الرسالة والإشعار</span>
                </div>

                {/* Quick Presets Dropdown/Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
                  <span className="text-[10px] text-slate-400 shrink-0 font-bold">نماذج سريعة:</span>
                  <button
                    type="button"
                    onClick={() =>
                      applyPreset(
                        'إعلان عن جدول الاختبارات الشهرية',
                        'يرجى العلم بأنه تم اعتماد جدول الاختبارات الشهرية للطلاب، وسيبدأ التطبيق الأسبوع القادم بإذن الله.',
                        'academic'
                      )
                    }
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-semibold text-slate-700 whitespace-nowrap"
                  >
                    جدول الاختبارات
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyPreset(
                        'دعوة لحضور اجتماع أولياء الأمور',
                        'يسر إدارة مدارس النيل دعوة سيادتكم لحضور الاجتماع الدوري لأولياء الأمور يوم السبت القادم الساعة 10 صباحاً لمناقشة المستوى الدراسي للأبناء.',
                        'general'
                      )
                    }
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-[10px] font-semibold text-slate-700 whitespace-nowrap"
                  >
                    اجتماع الآباء
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      applyPreset(
                        'تنبيه هام وعاجل',
                        'نحيط سيادتكم علماً بتعديل مواعيد الانصراف ليوم غد نظراً للظروف الجوية.',
                        'urgent'
                      )
                    }
                    className="px-2 py-1 bg-rose-50 hover:bg-rose-100 rounded-lg text-[10px] font-semibold text-rose-700 whitespace-nowrap"
                  >
                    تنبيه عاجل
                  </button>
                </div>
              </div>

              {/* Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    عنوان الإشعار <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="مثال: تنبيه بخصوص موعد الاختبارات الشهرية..."
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 outline-hidden focus:border-[#1F4E8C]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    تصنيف الرسالة
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
                  >
                    <option value="general">📢 تنبيه عام</option>
                    <option value="academic">📚 إشعار دراسي / تعليمي</option>
                    <option value="activity">🏆 نشاط وتكريم مدرسي</option>
                    <option value="urgent">⚠️ تنبيه عاجل وهام</option>
                    <option value="honor">🌟 تهنئة وتقدير</option>
                  </select>
                </div>
              </div>

              {/* Body */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    نص الرسالة والإشعار <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {body.length} حرف
                  </span>
                </div>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="اكتب تفاصيل الرسالة هنا بوضوح لتظهر لولي الأمر أو المعلم في هاتفه وداخل التطبيق..."
                  rows={4}
                  className="w-full p-3 text-xs rounded-2xl border border-slate-300 outline-hidden focus:border-[#1F4E8C] leading-relaxed"
                  required
                />
              </div>

              {/* Action Submit */}
              <div className="pt-2 flex items-center justify-between">
                <div className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  <span>تصل كإشعار فوري (Web Push) + تظهر في مركز الإشعارات داخل التطبيق</span>
                </div>

                <button
                  type="submit"
                  disabled={isSending || computedRecipients.length === 0}
                  className="py-3 px-8 bg-[#1F4E8C] hover:bg-[#163A6B] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>{isSending ? 'جاري الإرسال...' : `إرسال الآن إلى (${computedRecipients.length})`}</span>
                </button>
              </div>
            </div>
          </form>

          {/* Side Panel: Mobile Preview & Recipients Summary */}
          <div className="space-y-5">
            {/* Live Phone Notification Mockup */}
            <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-lg border border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5 text-blue-400" />
                  معاينة فورية على شاشة القفل:
                </span>
                <span className="text-[10px] text-slate-500">الآن</span>
              </div>

              {/* Push notification banner mockup */}
              <div className="bg-slate-800/90 rounded-2xl p-3.5 border border-slate-700/80 shadow-md space-y-1.5 text-right">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-md bg-[#1F4E8C] p-0.5 flex items-center justify-center">
                      <img src="/icons/icon.svg" alt="NPS" className="w-full h-full object-contain" />
                    </div>
                    <span className="font-bold text-xs text-slate-200">مدارس النيل (NPS)</span>
                  </div>
                  <span className="text-[10px] text-slate-400">الآن</span>
                </div>

                <h4 className="font-bold text-xs text-white pt-0.5">
                  {title || 'عنوان الإشعار يظهر هنا'}
                </h4>
                <p className="text-[11px] text-slate-300 leading-snug line-clamp-3">
                  {body || 'نص الرسالة والإشعار المرسل يظهر هنا في شاشة هاتف المستخدم...'}
                </p>
              </div>

              <div className="text-[10px] text-slate-400 text-center leading-relaxed">
                يصل الإشعار إلى الهاتف دون الحاجة لفتح التطبيق، وتُحفظ نسخة دائمة في قائمة التنبيهات.
              </div>
            </div>

            {/* Selected Recipients Preview */}
            <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-3 text-right">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-800">
                  قائمة المستلمين ({computedRecipients.length}):
                </span>
                <span className="text-[10px] text-slate-400 font-semibold">{getTargetLabel()}</span>
              </div>

              {computedRecipients.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  لم يتم اختيار أي مستلمين حتى الآن.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-56 overflow-y-auto divide-y divide-slate-100 pr-1 text-xs">
                  {computedRecipients.slice(0, 30).map((r, i) => (
                    <div key={i} className="pt-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold flex items-center justify-center">
                          {i + 1}
                        </span>
                        <strong className="text-slate-800 truncate max-w-[120px]">{r.name}</strong>
                      </div>
                      <span className="text-[10px] text-slate-400">{r.sub}</span>
                    </div>
                  ))}
                  {computedRecipients.length > 30 && (
                    <p className="text-[10px] text-slate-400 text-center pt-2">
                      وغيرهم ({computedRecipients.length - 30} مستلم إضافي)...
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Broadcast History */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4 text-right">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div>
              <h2 className="text-base font-bold text-slate-900">سجل الإشعارات والرسائل المرسلة</h2>
              <p className="text-xs text-slate-500">أرشيف كامل لكافة الإشعارات الجماعية الصادرة وتفاصيل المستلمين</p>
            </div>
            <span className="text-xs bg-slate-100 px-3 py-1 rounded-full font-bold text-slate-600">
              إجمالي: {broadcasts.length} إشعار
            </span>
          </div>

          {broadcasts.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Megaphone className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm font-medium">لم يتم إرسال أي إشعارات جماعية حتى الآن</p>
            </div>
          ) : (
            <div className="space-y-3">
              {broadcasts.map(bc => {
                const cat = categoryLabels[bc.category] || categoryLabels.general;
                return (
                  <div
                    key={bc.id}
                    className="p-4 rounded-2xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-[#1F4E8C] transition space-y-2"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${cat.bg} ${cat.text}`}>
                          {cat.label}
                        </span>
                        <h3 className="font-bold text-sm text-slate-900">{bc.title}</h3>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1 font-bold text-slate-700">
                          <Users className="w-3.5 h-3.5 text-[#1F4E8C]" />
                          <span>{bc.recipientsCount} مستلم</span>
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{formatArabicDate(bc.sentAt)} - {formatArabicTime(bc.sentAt.substring(11, 16))}</span>
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed bg-white p-3 rounded-xl border border-slate-100">
                      {bc.body}
                    </p>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                      <span>الجهة المستهدفة: <strong className="text-slate-800">{bc.targetLabel}</strong></span>
                      <span>المرسل: <strong className="text-slate-700">{bc.senderName}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
