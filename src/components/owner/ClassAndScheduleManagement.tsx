import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Users,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  Search,
  Trash2,
  Send,
  Sparkles,
  MapPin,
  Bell,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { SchoolClass, Group, ScheduleSlot, Teacher, Student, TutoringGroup } from '../../types';
import { storage } from '../../services/storage';
import { ARABIC_DAYS, formatArabicTime, formatArabicDate, getTodayDateString } from '../../utils/arabic';

export const ClassAndScheduleManagement: React.FC = () => {
  const [subTab, setSubTab] = useState<'schedule' | 'groups' | 'tutoring' | 'classes' | 'subjects'>('schedule');
  const [classes, setClasses] = useState<SchoolClass[]>(() => storage.getClasses());
  const [groups, setGroups] = useState<Group[]>(() => storage.getGroups());
  const [tutoringGroups, setTutoringGroups] = useState<TutoringGroup[]>(() => storage.getTutoringGroups());
  const [slots, setSlots] = useState<ScheduleSlot[]>(() => storage.getScheduleSlots());
  const [teachers, setTeachers] = useState<Teacher[]>(() => storage.getTeachers());
  const [students, setStudents] = useState<Student[]>(() => storage.getStudents());
  const [settings, setSettings] = useState(() => storage.getSettings());

  useEffect(() => {
    const onCloudSync = () => {
      setClasses(storage.getClasses());
      setGroups(storage.getGroups());
      setTutoringGroups(storage.getTutoringGroups());
      setSlots(storage.getScheduleSlots());
      setTeachers(storage.getTeachers());
      setStudents(storage.getStudents());
      setSettings(storage.getSettings());
    };
    window.addEventListener('nps_cloud_sync', onCloudSync);
    return () => window.removeEventListener('nps_cloud_sync', onCloudSync);
  }, []);

  // Filter
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState('');

  // New Group Modal
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupSubject, setGroupSubject] = useState('');
  const [groupTeacherId, setGroupTeacherId] = useState('');
  const [groupMode, setGroupMode] = useState<'class' | 'manual'>('class');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedManualStudentIds, setSelectedManualStudentIds] = useState<string[]>([]);

  // New Tutoring Group Modal
  const [showAddTutoringModal, setShowAddTutoringModal] = useState(false);
  const [tutTitle, setTutTitle] = useState('');
  const [tutSubject, setTutSubject] = useState('');
  const [tutTeacherId, setTutTeacherId] = useState('');
  const [tutTargetType, setTutTargetType] = useState<'specific_students' | 'class' | 'grade'>('specific_students');
  const [tutGrade, setTutGrade] = useState('');
  const [tutClassNumber, setTutClassNumber] = useState<number>(1);
  const [tutStudentIds, setTutStudentIds] = useState<string[]>([]);
  const [tutStudentSearch, setTutStudentSearch] = useState('');
  const [tutStudentGradeFilter, setTutStudentGradeFilter] = useState('');
  const [tutDate, setTutDate] = useState(getTodayDateString());
  const [tutStartTime, setTutStartTime] = useState('14:00');
  const [tutEndTime, setTutEndTime] = useState('15:30');
  const [tutRoom, setTutRoom] = useState('');
  const [tutNotes, setTutNotes] = useState('');
  const [tutSendNotifyNow, setTutSendNotifyNow] = useState(true);
  const [tutError, setTutError] = useState('');
  const [tutBanner, setTutBanner] = useState('');
  const [expandedTutoringId, setExpandedTutoringId] = useState<string | null>(null);
  const [confirmDeleteTutId, setConfirmDeleteTutId] = useState<string | null>(null);

  // New Schedule Slot Modal
  const [showAddSlotModal, setShowAddSlotModal] = useState(false);
  const [slotGroupId, setSlotGroupId] = useState('');
  const [slotDay, setSlotDay] = useState<number>(0);
  const [slotStartTime, setSlotStartTime] = useState('08:30');
  const [slotEndTime, setSlotEndTime] = useState('09:45');
  const [slotRoom, setSlotRoom] = useState('');
  const [slotError, setSlotError] = useState('');

  // Add Subject state
  const [newSubjectName, setNewSubjectName] = useState('');

  // Add Class state
  const [newClassGrade, setNewClassGrade] = useState('');
  const [newClassNumber, setNewClassNumber] = useState<number>(1);

  const refreshData = () => {
    setClasses(storage.getClasses());
    setGroups(storage.getGroups());
    setTutoringGroups(storage.getTutoringGroups());
    setSlots(storage.getScheduleSlots());
    setTeachers(storage.getTeachers());
    setStudents(storage.getStudents());
    setSettings(storage.getSettings());
  };

  // Add Group Handler (SCH-03)
  const handleSaveGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName || !groupSubject || !groupTeacherId) return;

    let finalStudentIds: string[] = [];
    if (groupMode === 'class') {
      const classStudents = students.filter(
        st => st.status === 'active' && classes.some(c => selectedClassIds.includes(c.id) && c.grade === st.grade && c.classNumber === st.classNumber)
      );
      finalStudentIds = classStudents.map(s => s.id);
    } else {
      finalStudentIds = selectedManualStudentIds;
    }

    const newGroup: Group = {
      id: `grp_${Date.now()}`,
      name: groupName,
      subject: groupSubject,
      teacherId: groupTeacherId,
      mode: groupMode,
      classIds: groupMode === 'class' ? selectedClassIds : undefined,
      studentIds: finalStudentIds
    };

    storage.saveGroup(newGroup);
    setShowAddGroupModal(false);
    setGroupName('');
    setSelectedClassIds([]);
    setSelectedManualStudentIds([]);
    refreshData();
  };

  // Add Tutoring Group Handler
  const openAddTutoringModal = () => {
    setTutTitle('');
    setTutSubject(settings.subjects[0] || '');
    setTutTeacherId(teachers[0]?.id || '');
    setTutTargetType('specific_students');
    setTutGrade(settings.grades[0] || '');
    setTutClassNumber(1);
    setTutStudentIds([]);
    setTutStudentSearch('');
    setTutStudentGradeFilter('');
    setTutDate(getTodayDateString());
    setTutStartTime('14:00');
    setTutEndTime('15:30');
    setTutRoom('');
    setTutNotes('');
    setTutSendNotifyNow(true);
    setTutError('');
    setShowAddTutoringModal(true);
  };

  const handleSaveTutoringGroup = (e: React.FormEvent) => {
    e.preventDefault();
    setTutError('');

    if (!tutTitle.trim() || !tutSubject || !tutTeacherId || !tutDate || !tutStartTime || !tutEndTime) {
      setTutError('يرجى استكمال اسم المجموعة والمادة والمعلم والتاريخ والوقت.');
      return;
    }

    if (tutStartTime >= tutEndTime) {
      setTutError('وقت الانتهاء يجب أن يكون بعد وقت البدء.');
      return;
    }

    const activeStudents = students.filter(s => s.status === 'active');
    let targetStudentIds: string[] = [];
    let targetLabel = '';

    if (tutTargetType === 'specific_students') {
      targetStudentIds = tutStudentIds;
      targetLabel = `طلاب محددون (${targetStudentIds.length} طالب)`;
    } else if (tutTargetType === 'class') {
      if (!tutGrade || tutClassNumber <= 0) {
        setTutError('يرجى تحديد الصف الدراسي ورقم الفصل.');
        return;
      }
      targetStudentIds = activeStudents
        .filter(s => s.grade === tutGrade && s.classNumber === tutClassNumber)
        .map(s => s.id);
      targetLabel = `${tutGrade} - فصل ${tutClassNumber}`;
    } else {
      if (!tutGrade) {
        setTutError('يرجى تحديد الصف الدراسي.');
        return;
      }
      targetStudentIds = activeStudents
        .filter(s => s.grade === tutGrade)
        .map(s => s.id);
      targetLabel = `${tutGrade} (كامل الصف)`;
    }

    if (targetStudentIds.length === 0) {
      setTutError('لا يوجد طلاب نشطون في النطاق المحدد. يرجى اختيار طلاب أو فصل يحتوي على طلاب.');
      return;
    }

    const newTut: TutoringGroup = {
      id: `tut_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      title: tutTitle.trim(),
      subject: tutSubject,
      teacherId: tutTeacherId,
      targetType: tutTargetType,
      targetLabel,
      grade: tutTargetType !== 'specific_students' ? tutGrade : undefined,
      classNumber: tutTargetType === 'class' ? tutClassNumber : undefined,
      studentIds: targetStudentIds,
      date: tutDate,
      startTime: tutStartTime,
      endTime: tutEndTime,
      room: tutRoom.trim() || undefined,
      notes: tutNotes.trim() || undefined,
      createdAt: new Date().toISOString()
    };

    const res = storage.saveTutoringGroup(newTut, tutSendNotifyNow);
    setShowAddTutoringModal(false);
    setSubTab('tutoring');
    if (tutSendNotifyNow) {
      setTutBanner(
        `تم حفظ مجموعة "${newTut.title}" وإرسال الإشعار بالموعد والتاريخ إلى ${res.teacherNotified ? 'المعلم' : '0 معلم'} و ${res.parentCount} ولي أمر.`
      );
    } else {
      setTutBanner(`تم حفظ مجموعة "${newTut.title}" بنجاح. يمكنك إرسال الإشعار في أي وقت من البطاقة.`);
    }
    refreshData();
  };

  const handleSendTutoringNotification = (groupId: string, title: string) => {
    const res = storage.notifyTutoringGroup(groupId);
    setTutBanner(
      `تم إرسال إشعار مجموعة "${title}" إلى ${res.teacherNotified ? 'المعلم المسؤول' : '0 معلم'} و ${res.parentCount} ولي أمر بنجاح.`
    );
    refreshData();
  };

  const handleDeleteTutoring = (groupId: string) => {
    storage.deleteTutoringGroup(groupId);
    setConfirmDeleteTutId(null);
    setTutBanner('تم حذف مجموعة التقوية بنجاح.');
    refreshData();
  };

  // Add Schedule Slot Handler with Conflict Detection (SCH-05)
  const handleSaveSlot = (e: React.FormEvent) => {
    e.preventDefault();
    setSlotError('');

    if (!slotGroupId || !slotStartTime || !slotEndTime) {
      setSlotError('يرجى تحديد المجموعة ووقت البدء والانتهاء');
      return;
    }

    if (slotStartTime >= slotEndTime) {
      setSlotError('وقت الانتهاء يجب أن يكون بعد وقت البدء');
      return;
    }

    const res = storage.saveScheduleSlot({
      id: `slot_${Date.now()}`,
      groupId: slotGroupId,
      dayOfWeek: slotDay,
      startTime: slotStartTime,
      endTime: slotEndTime,
      room: slotRoom.trim() || undefined
    });

    if (!res.success) {
      setSlotError(res.error || 'تعارض في المواعيد');
      return;
    }

    setShowAddSlotModal(false);
    refreshData();
  };

  // Add Class Handler
  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassGrade || newClassNumber <= 0) return;
    storage.ensureClassExists(newClassGrade, newClassNumber);
    setNewClassGrade('');
    refreshData();
  };

  // Add Subject Handler
  const handleAddSubject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubjectName.trim()) return;
    const clean = newSubjectName.trim();
    if (!settings.subjects.includes(clean)) {
      const updated = [...settings.subjects, clean];
      storage.updateSettings({ subjects: updated });
      setNewSubjectName('');
      refreshData();
    }
  };

  const filteredSlots = selectedTeacherFilter
    ? slots.filter(s => {
        const grp = groups.find(g => g.id === s.groupId);
        return grp && grp.teacherId === selectedTeacherFilter;
      })
    : slots;

  const activeStudentsList = students.filter(s => s.status === 'active');
  const filteredModalStudents = activeStudentsList.filter(st => {
    const matchSearch =
      !tutStudentSearch.trim() ||
      st.name.includes(tutStudentSearch.trim()) ||
      st.code.includes(tutStudentSearch.trim());
    const matchGrade = !tutStudentGradeFilter || st.grade === tutStudentGradeFilter;
    return matchSearch && matchGrade;
  });

  const sortedTutoringGroups = [...tutoringGroups].sort((a, b) => {
    const cmp = b.date.localeCompare(a.date);
    return cmp !== 0 ? cmp : b.startTime.localeCompare(a.startTime);
  });

  const availableClassesForSelectedGrade = Array.from(
    new Set(
      activeStudentsList
        .filter(s => s.grade === tutGrade)
        .map(s => s.classNumber)
        .concat(classes.filter(c => c.grade === tutGrade).map(c => c.classNumber))
    )
  ).sort((a, b) => a - b);

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">إدارة الفصول والمجموعات والجدول الأسبوعي</h2>
          <p className="text-xs text-slate-500">
            ربط المعلمين بالطلاب وجدولة الحصص ومجموعات التقوية الخاصة بتاريخ محدد مع إشعار المعلم وولي الأمر
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={openAddTutoringModal}
            className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
          >
            <Sparkles className="w-4 h-4" />
            <span>مجموعة تقوية بتاريخ محدد</span>
          </button>
          <button
            onClick={() => setShowAddGroupModal(true)}
            className="px-3.5 py-2 bg-[#1F4E8C] hover:bg-[#163A6B] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>إنشاء مجموعة دراسية</span>
          </button>
          <button
            onClick={() => setShowAddSlotModal(true)}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
          >
            <Clock className="w-4 h-4" />
            <span>إضافة موعد بالجدول</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex flex-wrap items-center bg-white p-1.5 rounded-2xl border border-slate-200 text-xs font-bold gap-1 shadow-2xs">
        {[
          { id: 'schedule', label: 'الجدول الأسبوعي العام' },
          { id: 'tutoring', label: `مجموعات التقوية (${tutoringGroups.length})` },
          { id: 'groups', label: `المجموعات الدراسية (${groups.length})` },
          { id: 'classes', label: `الفصول (${classes.length})` },
          { id: 'subjects', label: `المواد التعليمية (${settings.subjects.length})` }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id as 'schedule' | 'groups' | 'tutoring' | 'classes' | 'subjects')}
            className={`px-4 py-2 rounded-xl transition ${
              subTab === t.id
                ? t.id === 'tutoring'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-[#1F4E8C] text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Tutoring Groups (مجموعات التقوية والفصول الخاصة) */}
      {subTab === 'tutoring' && (
        <div className="space-y-4">
          {tutBanner && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="font-bold">{tutBanner}</span>
              </div>
              <button
                onClick={() => setTutBanner('')}
                className="text-emerald-700 hover:text-emerald-900 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {sortedTutoringGroups.length === 0 ? (
            <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center">
                <Sparkles className="w-7 h-7" />
              </div>
              <h3 className="font-bold text-slate-900 text-base">لا توجد مجموعات تقوية أو فصول إضافية مجدولة</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                يمكنك إنشاء مجموعة تقوية لطلاب محددين أو لفصل أو صف كامل في تاريخ ووقت معين وتحديد المعلم وإرسال إشعار فوري لولي الأمر والمعلم.
              </p>
              <button
                onClick={openAddTutoringModal}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>إنشاء أول مجموعة تقوية</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sortedTutoringGroups.map(tg => {
                const tch = teachers.find(t => t.id === tg.teacherId);
                const enrolledStudents = activeStudentsList.filter(s => tg.studentIds.includes(s.id));
                const isExpanded = expandedTutoringId === tg.id;
                const isDeleting = confirmDeleteTutId === tg.id;

                return (
                  <div
                    key={tg.id}
                    className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-3.5 flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              {tg.subject}
                            </span>
                            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#1F4E8C]">
                              {tg.targetType === 'specific_students'
                                ? 'طلاب محددون'
                                : tg.targetType === 'class'
                                ? 'فصل محدد'
                                : 'صف دراسي كامل'}
                            </span>
                          </div>
                          <h3 className="font-extrabold text-base text-slate-900 mt-1.5">{tg.title}</h3>
                        </div>

                        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 shrink-0">
                          {enrolledStudents.length} طالب
                        </span>
                      </div>

                      <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-2 text-slate-700">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-amber-600" />
                            <span>التاريخ:</span>
                          </span>
                          <strong className="text-slate-900">{formatArabicDate(tg.date)}</strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-[#1F4E8C]" />
                            <span>الموعد:</span>
                          </span>
                          <strong className="text-slate-900 font-mono">
                            {formatArabicTime(tg.startTime)} - {formatArabicTime(tg.endTime)}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-emerald-600" />
                            <span>المعلم المسؤول:</span>
                          </span>
                          <strong className="text-slate-900">
                            {tch ? `${tch.name} (${tch.subject})` : 'غير محدد'}
                          </strong>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500 flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                            <span>الفئة المستهدفة:</span>
                          </span>
                          <span className="font-semibold text-slate-800">{tg.targetLabel}</span>
                        </div>
                        {tg.room && (
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 text-rose-500" />
                              <span>القاعة / المكان:</span>
                            </span>
                            <span className="font-semibold text-slate-800">{tg.room}</span>
                          </div>
                        )}
                        {tg.notes && (
                          <div className="pt-1.5 border-t border-slate-200 text-[11px] text-slate-600">
                            <strong>ملاحظات:</strong> {tg.notes}
                          </div>
                        )}
                      </div>

                      {tg.notifiedAt ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold">
                          <Bell className="w-3.5 h-3.5" />
                          <span>تم إرسال الإشعار بتاريخ {formatArabicDate(tg.notifiedAt)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-[11px] text-amber-700 font-semibold">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>لم يتم إرسال الإشعار للمعلم وأولياء الأمور بعد</span>
                        </div>
                      )}

                      {/* Toggle Enrolled Students List */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setExpandedTutoringId(isExpanded ? null : tg.id)}
                          className="text-xs font-bold text-[#1F4E8C] hover:underline flex items-center gap-1"
                        >
                          <span>{isExpanded ? 'إخفاء قائمة الطلاب' : `عرض قائمة الطلاب (${enrolledStudents.length})`}</span>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>

                        {isExpanded && (
                          <div className="mt-2 max-h-40 overflow-y-auto bg-slate-50 rounded-2xl border border-slate-200 p-2.5 space-y-1.5">
                            {enrolledStudents.map((st, idx) => (
                              <div
                                key={st.id}
                                className="flex items-center justify-between text-[11px] py-1 border-b border-slate-100 last:border-0"
                              >
                                <span className="font-semibold text-slate-800">
                                  {idx + 1}. {st.name}
                                </span>
                                <span className="text-slate-500">
                                  {st.grade} ({st.classNumber}) • <span className="font-mono">{st.code}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSendTutoringNotification(tg.id, tg.title)}
                        className="flex-1 py-2 px-3 bg-[#1F4E8C] hover:bg-[#163A6B] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{tg.notifiedAt ? 'إعادة إرسال الإشعار للمعلم وولي الأمر' : 'إرسال الإشعار الآن'}</span>
                      </button>

                      {isDeleting ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleDeleteTutoring(tg.id)}
                            className="py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition"
                          >
                            تأكيد الحذف
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTutId(null)}
                            className="py-2 px-2.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold"
                          >
                            إلغاء
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTutId(tg.id)}
                          className="p-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl transition"
                          title="حذف المجموعة"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Weekly Schedule (SCH-04, SCH-05, SCH-06) */}
      {subTab === 'schedule' && (
        <div className="space-y-4">
          {/* Filter by Teacher */}
          <div className="flex items-center justify-between bg-white p-3.5 rounded-2xl border border-slate-200">
            <span className="text-xs font-bold text-slate-700">تصفية الجدول بحسب المعلم:</span>
            <select
              value={selectedTeacherFilter}
              onChange={(e) => setSelectedTeacherFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white outline-hidden"
            >
              <option value="">كافة المعلمين</option>
              {teachers.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>
              ))}
            </select>
          </div>

          {/* Grid View */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {ARABIC_DAYS.map((dayName, dayIdx) => {
              const daySlots = filteredSlots.filter(s => s.dayOfWeek === dayIdx);
              // Sort by start time
              daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

              return (
                <div key={dayIdx} className="bg-white rounded-3xl p-4 border border-slate-200 shadow-2xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <h3 className="font-bold text-sm text-[#1F4E8C]">{dayName}</h3>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {daySlots.length} حصة
                    </span>
                  </div>

                  <div className="space-y-2">
                    {daySlots.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-6">لا توجد مواعيد</p>
                    ) : (
                      daySlots.map(slot => {
                        const grp = groups.find(g => g.id === slot.groupId);
                        const tch = teachers.find(t => t.id === grp?.teacherId);

                        return (
                          <div
                            key={slot.id}
                            className="p-3 rounded-2xl border border-slate-200 bg-slate-50/70 text-xs space-y-1.5 hover:border-[#1F4E8C] transition"
                          >
                            <div className="flex items-start justify-between">
                              <strong className="text-slate-900">{grp?.name}</strong>
                              <span className="text-[10px] bg-blue-100 text-[#1F4E8C] px-2 py-0.5 rounded font-bold">
                                {grp?.subject}
                              </span>
                            </div>

                            <p className="text-slate-600 text-[11px]">
                              المعلم: <strong className="text-slate-800">{tch?.name}</strong>
                            </p>

                            <div className="flex justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200 font-mono">
                              <span>{formatArabicTime(slot.startTime)} - {formatArabicTime(slot.endTime)}</span>
                              <span>{slot.room || 'فصل اعتيادي'}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Groups (SCH-03) */}
      {subTab === 'groups' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(grp => {
            const tch = teachers.find(t => t.id === grp.teacherId);
            const groupStudents = students.filter(s => grp.studentIds.includes(s.id) && s.status === 'active');

            return (
              <div key={grp.id} className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#1F4E8C]">
                      {grp.subject}
                    </span>
                    <h3 className="font-bold text-base text-slate-900 mt-1">{grp.name}</h3>
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                    {groupStudents.length} طالب
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs space-y-1 text-slate-600">
                  <div className="flex justify-between">
                    <span>المعلم المسؤول:</span>
                    <strong className="text-slate-900">{tch?.name}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>طريقة ضم الطلاب:</span>
                    <span>{grp.mode === 'class' ? 'مرتبطة بفصل مدرسي كامل' : 'اختيار يدوي مخصص'}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Classes (SCH-01) */}
      {subTab === 'classes' && (
        <div className="space-y-4">
          {/* Add Class Form */}
          <form onSubmit={handleAddClass} className="bg-white p-4 rounded-3xl border border-slate-200 flex flex-wrap items-end gap-3 text-right">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">الصف الدراسي</label>
              <select
                value={newClassGrade}
                onChange={(e) => setNewClassGrade(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
                required
              >
                <option value="">-- اختر الصف --</option>
                {settings.grades.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">رقم الفصل</label>
              <input
                type="number"
                min="1"
                value={newClassNumber}
                onChange={(e) => setNewClassNumber(parseInt(e.target.value) || 1)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden w-24"
                required
              />
            </div>

            <button
              type="submit"
              className="py-2 px-5 bg-[#1F4E8C] hover:bg-[#163A6B] text-white text-xs font-bold rounded-xl shadow-xs"
            >
              إضافة الفصل
            </button>
          </form>

          {/* Classes Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {classes.map(cls => {
              const classStudents = students.filter(
                s => s.grade === cls.grade && s.classNumber === cls.classNumber && s.status === 'active'
              );

              return (
                <div key={cls.id} className="bg-white rounded-3xl p-4 border border-slate-200 text-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#1F4E8C] mx-auto flex items-center justify-center font-bold text-lg">
                    {cls.classNumber}
                  </div>
                  <h4 className="font-bold text-xs text-slate-900">{cls.grade}</h4>
                  <span className="text-[11px] text-slate-500 font-semibold block">
                    {classStudents.length} طالب مسجل
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Subjects (SCH-02) */}
      {subTab === 'subjects' && (
        <div className="space-y-4">
          <form onSubmit={handleAddSubject} className="bg-white p-4 rounded-3xl border border-slate-200 flex items-center gap-3 max-w-md">
            <input
              type="text"
              value={newSubjectName}
              onChange={(e) => setNewSubjectName(e.target.value)}
              placeholder="اسم المادة الجديدة (مثال: ألماني، فنون...)"
              className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
              required
            />
            <button
              type="submit"
              className="py-2 px-4 bg-[#1F4E8C] text-white text-xs font-bold rounded-xl"
            >
              إضافة مادة
            </button>
          </form>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {settings.subjects.map((sbj, i) => (
              <div key={i} className="p-3 bg-white rounded-2xl border border-slate-200 text-xs font-bold text-slate-800 flex items-center justify-between">
                <span>{sbj}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Tutoring Group Modal */}
      {showAddTutoringModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <form
            onSubmit={handleSaveTutoringGroup}
            className="bg-white rounded-3xl p-6 max-w-xl w-full text-right shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-base text-slate-900">
                  إنشاء مجموعة تقوية / فصل خاص بتاريخ محدد
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddTutoringModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {tutError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{tutError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم المجموعة أو الفصل</label>
              <input
                type="text"
                value={tutTitle}
                onChange={(e) => setTutTitle(e.target.value)}
                placeholder="مثال: مجموعة تقوية رياضيات - مراجعة الفصل الثاني"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden focus:border-[#1F4E8C]"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المادة الدراسية</label>
                <select
                  value={tutSubject}
                  onChange={(e) => setTutSubject(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
                  required
                >
                  <option value="">-- اختر المادة --</option>
                  {settings.subjects.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المعلم المسؤول</label>
                <select
                  value={tutTeacherId}
                  onChange={(e) => setTutTeacherId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
                  required
                >
                  <option value="">-- اختر المعلم --</option>
                  {teachers.filter(t => t.status === 'active').map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Target Selection */}
            <div className="space-y-2.5">
              <label className="block text-xs font-bold text-slate-700">الفئة المستهدفة</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'specific_students', label: 'طلاب محددون' },
                  { id: 'class', label: 'فصل معين' },
                  { id: 'grade', label: 'صف كامل' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTutTargetType(opt.id as 'specific_students' | 'class' | 'grade')}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition ${
                      tutTargetType === opt.id
                        ? 'bg-amber-50 border-amber-500 text-amber-800'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {tutTargetType === 'specific_students' && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2.5">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={tutStudentSearch}
                        onChange={(e) => setTutStudentSearch(e.target.value)}
                        placeholder="بحث باسم الطالب أو الكود..."
                        className="w-full px-3 py-1.5 pr-8 text-xs rounded-xl border border-slate-300 bg-white outline-hidden"
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2" />
                    </div>
                    <select
                      value={tutStudentGradeFilter}
                      onChange={(e) => setTutStudentGradeFilter(e.target.value)}
                      className="px-2.5 py-1.5 text-xs rounded-xl border border-slate-300 bg-white outline-hidden"
                    >
                      <option value="">كل الصفوف</option>
                      {settings.grades.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-slate-700">
                      المحددون: <strong className="text-[#1F4E8C]">{tutStudentIds.length}</strong> طالب
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const merged = Array.from(new Set([...tutStudentIds, ...filteredModalStudents.map(s => s.id)]));
                          setTutStudentIds(merged);
                        }}
                        className="text-[#1F4E8C] font-bold hover:underline"
                      >
                        تحديد الظاهرين
                      </button>
                      {tutStudentIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setTutStudentIds([])}
                          className="text-rose-600 font-bold hover:underline"
                        >
                          مسح التحديد
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {filteredModalStudents.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">لا يوجد طلاب مطابقين للبحث</p>
                    ) : (
                      filteredModalStudents.map(st => {
                        const checked = tutStudentIds.includes(st.id);
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() =>
                              setTutStudentIds(prev =>
                                prev.includes(st.id) ? prev.filter(x => x !== st.id) : [...prev, st.id]
                              )
                            }
                            className={`w-full p-2 rounded-xl border text-xs text-right flex items-center justify-between transition ${
                              checked
                                ? 'bg-amber-50 border-amber-400 font-bold text-slate-900'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <span>{st.name}</span>
                            <span className="text-[11px] text-slate-500">
                              {st.grade} ({st.classNumber}) • <span className="font-mono">{st.code}</span>
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {tutTargetType === 'class' && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">الصف الدراسي</label>
                    <select
                      value={tutGrade}
                      onChange={(e) => setTutGrade(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-hidden"
                      required
                    >
                      {settings.grades.map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">رقم الفصل</label>
                    <select
                      value={tutClassNumber}
                      onChange={(e) => setTutClassNumber(parseInt(e.target.value, 10))}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-hidden"
                    >
                      {(availableClassesForSelectedGrade.length > 0 ? availableClassesForSelectedGrade : [1, 2, 3, 4]).map(num => (
                        <option key={num} value={num}>فصل {num}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 text-[11px] text-slate-600 font-semibold">
                    عدد الطلاب النشطين في هذا الفصل:{' '}
                    <strong className="text-[#1F4E8C]">
                      {activeStudentsList.filter(s => s.grade === tutGrade && s.classNumber === tutClassNumber).length} طالب
                    </strong>
                  </div>
                </div>
              )}

              {tutTargetType === 'grade' && (
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-2">
                  <label className="block text-[11px] font-bold text-slate-700">الصف الدراسي</label>
                  <select
                    value={tutGrade}
                    onChange={(e) => setTutGrade(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white outline-hidden"
                    required
                  >
                    {settings.grades.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <div className="text-[11px] text-slate-600 font-semibold">
                    عدد الطلاب النشطين في هذا الصف:{' '}
                    <strong className="text-[#1F4E8C]">
                      {activeStudentsList.filter(s => s.grade === tutGrade).length} طالب
                    </strong>
                  </div>
                </div>
              )}
            </div>

            {/* Date & Time */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">التاريخ</label>
                <input
                  type="date"
                  value={tutDate}
                  onChange={(e) => setTutDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">من الساعة</label>
                <input
                  type="time"
                  value={tutStartTime}
                  onChange={(e) => setTutStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">إلى الساعة</label>
                <input
                  type="time"
                  value={tutEndTime}
                  onChange={(e) => setTutEndTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden font-mono"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">القاعة / المكان (اختياري)</label>
                <input
                  type="text"
                  value={tutRoom}
                  onChange={(e) => setTutRoom(e.target.value)}
                  placeholder="مثال: قاعة 202 أو معمل الحاسب"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية (اختياري)</label>
                <input
                  type="text"
                  value={tutNotes}
                  onChange={(e) => setTutNotes(e.target.value)}
                  placeholder="مثال: إحضار كتاب المراجعة"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                />
              </div>
            </div>

            <label className="flex items-center gap-2.5 p-3 rounded-2xl bg-blue-50/70 border border-blue-200 cursor-pointer text-xs font-bold text-[#163A6B]">
              <input
                type="checkbox"
                checked={tutSendNotifyNow}
                onChange={(e) => setTutSendNotifyNow(e.target.checked)}
                className="w-4 h-4 accent-[#1F4E8C] rounded"
              />
              <span>إرسال إشعار فوري بالتاريخ والوقت لولي الأمر والمعلم فور الحفظ</span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition"
              >
                <Send className="w-4 h-4" />
                <span>{tutSendNotifyNow ? 'حفظ وإرسال الإشعار' : 'حفظ المجموعة فقط'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAddTutoringModal(false)}
                className="py-2.5 px-4 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Group Modal (SCH-03) */}
      {showAddGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <form onSubmit={handleSaveGroup} className="bg-white rounded-3xl p-6 max-w-lg w-full text-right shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-base text-slate-900 pb-2 border-b border-slate-200">
              إنشاء مجموعة دراسية جديدة
            </h3>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">اسم المجموعة</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="مثال: لغة عربية - 4/3 أو تقوية رياضيات خاصة"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المادة</label>
                <select
                  value={groupSubject}
                  onChange={(e) => setGroupSubject(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
                  required
                >
                  <option value="">-- اختر المادة --</option>
                  {settings.subjects.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">المعلم المسؤول</label>
                <select
                  value={groupTeacherId}
                  onChange={(e) => setGroupTeacherId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
                  required
                >
                  <option value="">-- اختر المعلم --</option>
                  {teachers.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">طريقة ضم الطلاب</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGroupMode('class')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                    groupMode === 'class'
                      ? 'bg-blue-50 border-[#1F4E8C] text-[#1F4E8C]'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  (أ) ربط بفصل دراسي كامل
                </button>
                <button
                  type="button"
                  onClick={() => setGroupMode('manual')}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                    groupMode === 'manual'
                      ? 'bg-blue-50 border-[#1F4E8C] text-[#1F4E8C]'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  (ب) اختيار طلاب محددين
                </button>
              </div>
            </div>

            {groupMode === 'class' ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">اختر الفصل المرتبط:</label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                  {classes.map(cls => {
                    const isSelected = selectedClassIds.includes(cls.id);
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => {
                          setSelectedClassIds(prev =>
                            prev.includes(cls.id) ? prev.filter(x => x !== cls.id) : [...prev, cls.id]
                          );
                        }}
                        className={`p-2.5 rounded-xl border text-xs text-right transition ${
                          isSelected
                            ? 'bg-blue-100 border-[#1F4E8C] font-bold text-[#1F4E8C]'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        {cls.grade} - فصل {cls.classNumber}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">اختر الطلاب يدوياً:</label>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {students.map(st => {
                    const isSelected = selectedManualStudentIds.includes(st.id);
                    return (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setSelectedManualStudentIds(prev =>
                            prev.includes(st.id) ? prev.filter(x => x !== st.id) : [...prev, st.id]
                          );
                        }}
                        className={`w-full p-2 rounded-xl border text-xs text-right flex justify-between transition ${
                          isSelected ? 'bg-blue-100 border-[#1F4E8C] font-bold' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <span>{st.name}</span>
                        <span className="font-mono text-slate-400">{st.code}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-[#1F4E8C] text-white rounded-xl text-xs font-bold hover:bg-[#163A6B]"
              >
                حفظ المجموعة
              </button>
              <button
                type="button"
                onClick={() => setShowAddGroupModal(false)}
                className="py-2.5 px-4 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Schedule Slot Modal (SCH-04, SCH-05) */}
      {showAddSlotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <form onSubmit={handleSaveSlot} className="bg-white rounded-3xl p-6 max-w-md w-full text-right shadow-2xl space-y-4">
            <h3 className="font-bold text-base text-slate-900 pb-2 border-b border-slate-200">
              إضافة موعد بالجدول الأسبوعي
            </h3>

            {slotError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{slotError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">المجموعة الدراسية</label>
              <select
                value={slotGroupId}
                onChange={(e) => setSlotGroupId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
                required
              >
                <option value="">-- اختر المجموعة --</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name} ({g.subject})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">يوم الأسبوع</label>
              <select
                value={slotDay}
                onChange={(e) => setSlotDay(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden bg-white"
              >
                {ARABIC_DAYS.map((d, i) => (
                  <option key={i} value={i}>{d}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">وقت البدء</label>
                <input
                  type="time"
                  value={slotStartTime}
                  onChange={(e) => setSlotStartTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">وقت الانتهاء</label>
                <input
                  type="time"
                  value={slotEndTime}
                  onChange={(e) => setSlotEndTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden font-mono"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">القاعة / المعمل (اختياري)</label>
              <input
                type="text"
                value={slotRoom}
                onChange={(e) => setSlotRoom(e.target.value)}
                placeholder="مثال: قاعة 101 أو معمل العلوم"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 outline-hidden"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700"
              >
                حفظ الموعد
              </button>
              <button
                type="button"
                onClick={() => setShowAddSlotModal(false)}
                className="py-2.5 px-4 bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
