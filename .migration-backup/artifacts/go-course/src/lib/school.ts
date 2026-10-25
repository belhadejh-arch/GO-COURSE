import type { SchoolRecord } from '@workspace/api-client-react';

export type Role = 'guest' | 'admin' | 'staff' | 'teacher' | 'student';
export type Data = Record<string, unknown>;
export type Opt = { value: string; label: string };
export type Lookup = Record<string, Map<number, SchoolRecord>>;

export const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const lv: Opt[] = LEVELS.map((l) => ({ value: l, label: l }));

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'date' | 'datetime' | 'email' | 'url' | 'time' | 'password'
  | 'select' | 'rel' | 'relmulti' | 'chips' | 'days' | 'file' | 'questions' | 'answers' | 'langlevels' | 'enrollments' | 'account';

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  options?: Opt[];
  entity?: string;
  required?: boolean;
  hint?: string;
  wide?: boolean;
  accept?: string;
  def?: unknown;
  showIf?: (d: Data) => boolean;
  hideFor?: Role[];
  studentOnly?: boolean;
  relFilter?: (r: SchoolRecord, d: Data) => boolean;
  min?: number;
  max?: number;
}

export interface Column {
  label: string;
  key: string;
  kind?: 'text' | 'rel' | 'relmulti' | 'date' | 'datetime' | 'money' | 'days' | 'file' | 'chips';
  entity?: string;
}

export interface QuickAction { label: string; status: string; from: string[]; roles: Role[]; reason?: boolean }

export interface EntityConfig {
  key: string;
  plural: string;
  singular: string;
  titleLabel: string;
  titleOptions?: Opt[];
  hideTitle?: boolean;
  autoTitle?: (d: Data, lk: Lookup) => string;
  statuses: Opt[];
  fields: Field[];
  columns: Column[];
  write: Role[];
  create?: Role[];
  canEdit?: (r: SchoolRecord, role: Role) => boolean;
  archive?: Role[];
  quick?: QuickAction[];
  related: string[];
  hint: string;
}

const ADMIN: Role[] = ['admin', 'staff'];
const TEACH: Role[] = ['admin', 'staff', 'teacher'];

export const STATUS_LABEL: Record<string, string> = {
  active: 'نشط', inactive: 'غير نشط', archived: 'مؤرشف', draft: 'مسودة', published: 'منشور',
  pending: 'قيد المراجعة', confirmed: 'مؤكد', rejected: 'مرفوض', expired: 'منتهٍ', cancelled: 'ملغى',
  paused: 'موقوف', invited: 'مدعو', disabled: 'معطّل', scheduled: 'مجدولة', completed: 'مكتملة', recorded: 'مسجّل', submitted: 'مُسلَّم',
  graded: 'مُقيَّم', issued: 'صادرة', void: 'ملغاة', open: 'مفتوح',
};
const so = (...v: string[]): Opt[] => v.map((x) => ({ value: x, label: STATUS_LABEL[x] ?? x }));

const courseTypes: Opt[] = [
  { value: 'level', label: 'تحسين المستوى' }, { value: 'conversation', label: 'محادثة' }, { value: 'exam', label: 'التحضير للامتحانات الدولية' },
];
const systems: Opt[] = [{ value: 'regular', label: 'عادي' }, { value: 'intensive', label: 'مكثّف' }];
const studyModes: Opt[] = [{ value: 'individual', label: 'فردي' }, { value: 'group', label: 'مع المجموعة' }];
const person = (isTeacher: boolean): Field[] => [
  { key: 'firstName', label: 'الاسم', type: 'text', required: true },
  { key: 'lastName', label: 'اللقب', type: 'text', required: true },
  { key: 'email', label: 'بريد الدخول', type: 'email', required: true, hint: 'يسلّم المدير هذا البريد وكلمة المرور المؤقتة لصاحب الحساب.' },
  { key: 'loginPassword', label: 'كلمة مرور مؤقتة', type: 'password', required: true, hideFor: ['teacher','student','staff'], hint: 'ينشئ النظام كلمة مؤقتة تلقائيًا ويعرضها بعد الحفظ لتسليمها لصاحب الحساب. لا تستخدم بريده الإلكتروني كلمة مرور.' },
  { key: 'phone', label: 'الهاتف', type: 'text', required: true },
  ...(isTeacher ? [
    { key: 'languageIds', label: 'اللغات التي يدرّسها', type: 'relmulti' as const, entity: 'languages', wide: true, required: true },
    { key: 'levels', label: 'المستويات المشتركة', type: 'chips' as const, options: lv, wide: true },
    { key: 'languageLevels', label: 'المستويات لكل لغة', type: 'langlevels' as const, wide: true, hint: 'حدّد مستويات كل لغة يدرّسها الأستاذ.' },
  ] : [
    { key: 'studyMode', label: 'نظام الدراسة', type: 'select' as const, options: studyModes, def: 'group', required: true },
    { key: 'studySystem', label: 'نوع النظام', type: 'select' as const, options: systems, def: 'regular', required: true },
    { key: 'courseType', label: 'نوع الدورة', type: 'select' as const, options: courseTypes, def: 'level', required: true },
    { key: 'languageId', label: 'اللغة', type: 'rel' as const, entity: 'languages', required: true },
    { key: 'level', label: 'المستوى', type: 'select' as const, options: lv, required: true },
    { key: 'examName', label: 'اسم الامتحان الدولي', type: 'text' as const, required: true, showIf: (d: Data) => d.courseType === 'exam' },
    { key: 'proofPath', label: 'وصل الدفع', type: 'file' as const, accept: 'image/jpeg,image/png,image/webp,application/pdf', required: true },
  ]),
  { key: 'photoPath', label: 'الصورة الشخصية', type: 'file', accept: 'image/*' },
  { key: 'notes', label: 'ملاحظات', type: 'textarea', wide: true },
];
const fullName = (d: Data) => `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim();

export const ENTITIES: Record<string, EntityConfig> = {
  languages: {
    key: 'languages', plural: 'اللغات', singular: 'لغة', titleLabel: 'اسم اللغة', statuses: so('active', 'disabled'),
    fields: [{ key: 'code', label: 'رمز اللغة', type: 'text', hint: 'مثال: en أو fr' }],
    columns: [{ label: 'الرمز', key: 'code' }], write: ADMIN, related: [], hint: 'اللغات التي تدرّسها المدرسة.',
  },
  levels: {
    key: 'levels', plural: 'المستويات', singular: 'مستوى', titleLabel: 'المستوى', titleOptions: lv, statuses: so('active', 'disabled'),
    fields: [{ key: 'languageId', label: 'اللغة', type: 'rel', entity: 'languages', required: true }],
    columns: [{ label: 'اللغة', key: 'languageId', kind: 'rel', entity: 'languages' }], write: ADMIN, related: ['languages'],
    hint: 'مستويات الإطار الأوروبي المرجعي من A1 إلى C2.',
  },
  students: {
    key: 'students', plural: 'الطلاب', singular: 'طالب', titleLabel: 'الاسم الكامل', hideTitle: true, autoTitle: fullName,
    statuses: so('active', 'invited', 'disabled'), fields: person(false),
    columns: [{ label: 'البريد', key: 'email' }, { label: 'الهاتف', key: 'phone' }, { label: 'اللغات', key: 'languageIds', kind: 'relmulti', entity: 'languages' }],
    write: ['admin'], related: ['languages', 'courses', 'teachers', 'groups', 'plans'], hint: 'أنشئ الطالب وحسابه، ثم أضفه إلى أي دورة من التسجيلات أو من استمارة الدورة.',
  },
  teachers: {
    key: 'teachers', plural: 'الأساتذة', singular: 'أستاذ', titleLabel: 'الاسم الكامل', hideTitle: true, autoTitle: fullName,
    statuses: so('active', 'invited', 'disabled'), fields: person(true),
    columns: [{ label: 'البريد', key: 'email' }, { label: 'الهاتف', key: 'phone' }, { label: 'اللغات', key: 'languageIds', kind: 'relmulti', entity: 'languages' }],
    write: ['admin'], related: ['languages'], hint: 'هيئة التدريس وحسابات الدخول واللغات التي يغطّيها كل أستاذ.',
  },
  courses: {
    key: 'courses', plural: 'الدورات', singular: 'دورة', titleLabel: 'عنوان الدورة', statuses: so('published', 'draft', 'paused'),
    fields: [
      { key: 'studyMode', label: 'نظام الدراسة', type: 'select', options: studyModes, def: 'group', required: true },
      { key: 'studySystem', label: 'نوع النظام', type: 'select', options: systems, def: 'regular', required: true },
      { key: 'languageId', label: 'اللغة', type: 'rel', entity: 'languages', required: true },
      { key: 'courseType', label: 'نوع الدورة', type: 'select', options: courseTypes, required: true, def: 'level' },
      { key: 'level', label: 'المستوى', type: 'select', options: lv, required: true },
      { key: 'examName', label: 'اسم الاختبار', type: 'text', required: true, showIf: (d) => d.courseType === 'exam' },
      { key: 'targetScore', label: 'الدرجة المستهدفة', type: 'text', showIf: (d) => d.courseType === 'exam' },
      { key: 'examDate', label: 'تاريخ الاختبار', type: 'date', showIf: (d) => d.courseType === 'exam' },
      { key: 'teacherIds', label: 'الأستاذ', type: 'relmulti', entity: 'teachers', wide: true, required: true },
      { key: 'studentIds', label: 'الطلاب', type: 'relmulti', entity: 'students', wide: true, hint: 'يُنشأ التسجيل تلقائيًا للطلاب المختارين. الدورة الفردية تقبل طالبًا واحدًا.' },
      { key: 'weeklySessions', label: 'الحصص الأسبوعية (2-7)', type: 'number', min: 2, max: 7, def: 2, required: true },
      { key: 'totalSessions', label: 'إجمالي الحصص (تُنشأ دروسها تلقائيًا)', type: 'number', min: 1, def: 16, required: true },
      { key: 'startDate', label: 'تاريخ البداية', type: 'date', required: true },
      { key: 'endDate', label: 'تاريخ النهاية', type: 'date' },
      { key: 'days', label: 'أيام الدراسة', type: 'days', wide: true, required: true, hint: 'يجب أن يساوي عدد الأيام عدد الحصص الأسبوعية.' },
      { key: 'time', label: 'الوقت', type: 'time', required: true },
      { key: 'durationMinutes', label: 'مدة الحصة (دقيقة)', type: 'number', min: 15 },
      { key: 'planId', label: 'الباقة', type: 'rel', entity: 'plans' },
      { key: 'description', label: 'الوصف', type: 'textarea', wide: true },
    ],
    columns: [
      { label: 'اللغة', key: 'languageId', kind: 'rel', entity: 'languages' }, { label: 'المستوى', key: 'level' },
      { label: 'الأيام', key: 'days', kind: 'days' }, { label: 'البداية', key: 'startDate', kind: 'date' },
    ],
    quick: [
      { label: 'نشر', status: 'published', from: ['draft', 'paused'], roles: ADMIN },
      { label: 'إيقاف', status: 'paused', from: ['published'], roles: ADMIN },
    ],
    write: ADMIN, related: ['languages', 'levels', 'teachers', 'students', 'plans'], hint: 'إنشاء الدورة وإسناد الأستاذ وتسجيل الطلاب في عملية مترابطة.',
  },
  enrollments: {
    key: 'enrollments', plural: 'التسجيلات', singular: 'تسجيل', titleLabel: 'عنوان التسجيل',
    autoTitle: (d, lk) => `${lk.students?.get(Number(d.studentId))?.title ?? 'طالب'} - ${lk.courses?.get(Number(d.courseId))?.title ?? 'دورة'}`,
    statuses: so('active', 'paused', 'completed', 'cancelled'),
    fields: [
      { key: 'studentId', label: 'الطالب', type: 'rel', entity: 'students', required: true },
      { key: 'courseId', label: 'الدورة', type: 'rel', entity: 'courses', required: true },
      { key: 'teacherId', label: 'الأستاذ', type: 'rel', entity: 'teachers', required: true },
      { key: 'groupId', label: 'المجموعة', type: 'rel', entity: 'groups', relFilter: (r, d) => !d.courseId || Number(r.data.courseId) === Number(d.courseId) },
      { key: 'languageId', label: 'اللغة', type: 'rel', entity: 'languages' },
      { key: 'courseType', label: 'نوع الدورة', type: 'select', options: courseTypes },
      { key: 'level', label: 'المستوى', type: 'select', options: lv },
      { key: 'studySystem', label: 'نظام الدراسة', type: 'select', options: systems },
      { key: 'studyMode', label: 'نظام الدراسة (فردي/مجموعة)', type: 'select', options: studyModes },
      { key: 'weeklySessions', label: 'الحصص الأسبوعية', type: 'number', min: 2, max: 7, required: true },
      { key: 'totalSessions', label: 'إجمالي الحصص', type: 'number', def: 16 },
      { key: 'startDate', label: 'تاريخ البداية', type: 'date', required: true },
      { key: 'time', label: 'الوقت', type: 'time', required: true },
      { key: 'days', label: 'الأيام (بعدد الحصص الأسبوعية)', type: 'days', wide: true, required: true },
      { key: 'planId', label: 'الباقة', type: 'rel', entity: 'plans' },
      { key: 'subscriptionStart', label: 'بداية الاشتراك', type: 'date' },
      { key: 'subscriptionEnd', label: 'نهاية الاشتراك', type: 'date' },
    ],
    columns: [
      { label: 'الطالب', key: 'studentId', kind: 'rel', entity: 'students' }, { label: 'الدورة', key: 'courseId', kind: 'rel', entity: 'courses' },
      { label: 'الأستاذ', key: 'teacherId', kind: 'rel', entity: 'teachers' }, { label: 'البداية', key: 'startDate', kind: 'date' },
    ],
    write: ADMIN, related: ['students', 'courses', 'teachers', 'groups', 'languages', 'plans'], hint: 'ربط الطلاب بالدورات والمجموعات.',
  },
  groups: {
    key: 'groups', plural: 'المجموعات', singular: 'مجموعة', titleLabel: 'اسم المجموعة', statuses: so('active', 'disabled'),
    fields: [
      { key: 'courseId', label: 'الدورة', type: 'rel', entity: 'courses', required: true },
      { key: 'teacherId', label: 'الأستاذ', type: 'rel', entity: 'teachers', required: true },
    ],
    columns: [{ label: 'الدورة', key: 'courseId', kind: 'rel', entity: 'courses' }, { label: 'الأستاذ', key: 'teacherId', kind: 'rel', entity: 'teachers' }],
    write: TEACH, related: ['courses', 'teachers'], hint: 'مجموعات الدراسة داخل كل دورة.',
  },
  sessions: {
    key: 'sessions', plural: 'الحصص', singular: 'حصة', titleLabel: 'عنوان الحصة',
    autoTitle: (d, lk) => lk.courses?.get(Number(d.courseId))?.title ?? 'حصة',
    statuses: so('scheduled', 'completed', 'cancelled'),
    fields: [
      { key: 'courseId', label: 'الدورة', type: 'rel', entity: 'courses', required: true },
      { key: 'teacherId', label: 'الأستاذ', type: 'rel', entity: 'teachers', required: true },
      { key: 'groupId', label: 'المجموعة', type: 'rel', entity: 'groups', relFilter: (r, d) => !d.courseId || Number(r.data.courseId) === Number(d.courseId) },
      { key: 'startsAt', label: 'تبدأ في', type: 'datetime', required: true },
      { key: 'endsAt', label: 'تنتهي في', type: 'datetime', required: true },
      { key: 'meetingUrl', label: 'رابط الحصة', type: 'url', wide: true },
      { key: 'notes', label: 'ملاحظات', type: 'textarea', wide: true },
    ],
    columns: [
      { label: 'الدورة', key: 'courseId', kind: 'rel', entity: 'courses' }, { label: 'الأستاذ', key: 'teacherId', kind: 'rel', entity: 'teachers' },
      { label: 'الموعد', key: 'startsAt', kind: 'datetime' },
    ],
    write: TEACH, related: ['courses', 'teachers', 'groups'], hint: 'جدولة الحصص.',
  },
  lessons: {
    key: 'lessons', plural: 'الدروس', singular: 'درس', titleLabel: 'عنوان الدرس', statuses: so('draft', 'published'),
    fields: [
      { key: 'courseId', label: 'الدورة', type: 'rel', entity: 'courses', required: true },
      { key: 'sessionId', label: 'الحصة', type: 'rel', entity: 'sessions', relFilter: (r, d) => !d.courseId || Number(r.data.courseId) === Number(d.courseId) },
      { key: 'number', label: 'رقم الدرس', type: 'number', min: 1 },
      { key: 'resourcePath', label: 'ملف الدرس', type: 'file' },
      { key: 'recordingUrl', label: 'رابط التسجيل', type: 'url', wide: true },
      { key: 'body', label: 'محتوى الدرس', type: 'textarea', wide: true },
      { key: 'homework', label: 'الواجب', type: 'textarea', wide: true },
    ],
    columns: [{ label: 'الدورة', key: 'courseId', kind: 'rel', entity: 'courses' }, { label: 'الرقم', key: 'number' }, { label: 'الملف', key: 'resourcePath', kind: 'file' }],
    write: TEACH, quick: [
      { label: 'نشر', status: 'published', from: ['draft'], roles: TEACH },
      { label: 'إلغاء النشر', status: 'draft', from: ['published'], roles: TEACH },
    ], related: ['courses', 'sessions'], hint: 'محتوى الدروس والواجبات.',
  },
  resources: {
    key: 'resources', plural: 'المصادر', singular: 'مصدر', titleLabel: 'عنوان المصدر', statuses: so('draft', 'published'),
    fields: [
      { key: 'scope', label: 'مكان العرض', type: 'select', options: [{ value: 'course', label: 'دورة دراسية' }, { value: 'library', label: 'مكتبة الأستاذ' }], def: 'course', hideFor: ['teacher','student'], hint: 'ملفات المكتبة تظهر للأساتذة الذين يدرّسون اللغة المختارة.' },
      { key: 'courseId', label: 'الدورة', type: 'rel', entity: 'courses', required: true, showIf: data => data.scope !== 'library' },
      { key: 'languageId', label: 'اللغة', type: 'rel', entity: 'languages', required: true, showIf: data => data.scope === 'library' },
      { key: 'curriculumName', label: 'المنهاج أو السلسلة', type: 'text', showIf: data => data.scope === 'library' },
      { key: 'level', label: 'المستوى', type: 'select', options: lv },
      { key: 'objectPath', label: 'الملف', type: 'file', required: true, wide: true },
      { key: 'contentType', label: 'نوع الملف', type: 'text', required: true, hint: 'يُملأ تلقائيًا عند رفع الملف.' },
    ],
    columns: [{ label: 'الدورة', key: 'courseId', kind: 'rel', entity: 'courses' }, { label: 'المستوى', key: 'level' }, { label: 'الملف', key: 'objectPath', kind: 'file' }],
    write: TEACH, related: ['courses', 'languages'], hint: 'كتب وملفات ومرفقات تعليمية محمية.',
  },
  assignments: {
    key: 'assignments', plural: 'الواجبات', singular: 'واجب', titleLabel: 'عنوان الواجب', statuses: so('draft', 'published'),
    fields: [
      { key: 'courseId', label: 'الدورة', type: 'rel', entity: 'courses', required: true },
      { key: 'lessonId', label: 'الدرس', type: 'rel', entity: 'lessons', relFilter: (r, d) => !d.courseId || Number(r.data.courseId) === Number(d.courseId) },
      { key: 'dueDate', label: 'آخر موعد للتسليم', type: 'datetime', required: true },
      { key: 'questions', label: 'الأسئلة', type: 'questions', wide: true, required: true },
    ],
    columns: [{ label: 'الدورة', key: 'courseId', kind: 'rel', entity: 'courses' }, { label: 'التسليم', key: 'dueDate', kind: 'datetime' }],
    write: TEACH, quick: [
      { label: 'نشر', status: 'published', from: ['draft'], roles: TEACH },
    ], related: ['courses', 'lessons'], hint: 'واجبات واختبارات قصيرة بأسئلة قابلة للتصحيح.',
  },
  submissions: {
    key: 'submissions', plural: 'التسليمات', singular: 'تسليم', titleLabel: 'عنوان التسليم',
    autoTitle: (d, lk) => lk.assignments?.get(Number(d.assignmentId))?.title ?? 'تسليم',
    statuses: so('submitted', 'graded'),
    fields: [
      { key: 'assignmentId', label: 'الواجب', type: 'rel', entity: 'assignments', required: true, studentOnly: true },
      { key: 'answers', label: 'الإجابات', type: 'answers', wide: true, studentOnly: true },
      { key: 'objectPath', label: 'ملف مرفق', type: 'file', studentOnly: true },
      { key: 'grade', label: 'الدرجة', type: 'number', hideFor: ['student'] },
      { key: 'feedback', label: 'ملاحظات الأستاذ', type: 'textarea', wide: true, hideFor: ['student'] },
    ],
    columns: [{ label: 'الواجب', key: 'assignmentId', kind: 'rel', entity: 'assignments' }, { label: 'الدرجة', key: 'grade' }, { label: 'المرفق', key: 'objectPath', kind: 'file' }],
    write: ['admin', 'staff', 'teacher', 'student'], create: ['student'], canEdit: (r, role) => role !== 'student' || r.status === 'submitted', archive: [], related: ['assignments'], hint: 'تسليمات الطلاب وتقييمها.',
  },
  attendance: {
    key: 'attendance', plural: 'الحضور', singular: 'سجل حضور', titleLabel: 'العنوان',
    autoTitle: (d, lk) => `${lk.students?.get(Number(d.studentId))?.title ?? 'طالب'} - ${lk.sessions?.get(Number(d.sessionId))?.title ?? 'حصة'}`,
    statuses: so('active'),
    fields: [
      { key: 'sessionId', label: 'الحصة', type: 'rel', entity: 'sessions', required: true },
      { key: 'studentId', label: 'الطالب', type: 'rel', entity: 'students', required: true },
      {
        key: 'attendanceStatus', label: 'الحالة', type: 'select', required: true, def: 'present',
        options: [{ value: 'present', label: 'حاضر' }, { value: 'absent', label: 'غائب' }, { value: 'late', label: 'متأخر' }, { value: 'excused', label: 'غياب بعذر' }],
      },
      { key: 'notes', label: 'ملاحظات', type: 'textarea', wide: true },
    ],
    columns: [
      { label: 'الحصة', key: 'sessionId', kind: 'rel', entity: 'sessions' }, { label: 'الطالب', key: 'studentId', kind: 'rel', entity: 'students' },
      { label: 'الحضور', key: 'attendanceStatus', kind: 'chips' },
    ],
    write: TEACH, related: ['sessions', 'students'], hint: 'تسجيل حضور الطلاب لكل حصة.',
  },
  plans: {
    key: 'plans', plural: 'الباقات', singular: 'باقة', titleLabel: 'اسم الباقة', statuses: so('active', 'disabled'),
    fields: [
      { key: 'amount', label: 'المبلغ', type: 'number', required: true, min: 0 },
      { key: 'currency', label: 'العملة', type: 'text', def: 'DZD', required: true },
      { key: 'durationDays', label: 'المدة بالأيام', type: 'number', min: 1, required: true },
      { key: 'courseIds', label: 'الدورات المشمولة', type: 'relmulti', entity: 'courses', wide: true },
    ],
    columns: [{ label: 'المبلغ', key: 'amount', kind: 'money' }, { label: 'المدة (يوم)', key: 'durationDays' }, { label: 'الدورات', key: 'courseIds', kind: 'relmulti', entity: 'courses' }],
    write: ADMIN, related: ['courses'], hint: 'باقات الاشتراك وأسعارها.',
  },
  subscriptions: {
    key: 'subscriptions', plural: 'الاشتراكات', singular: 'اشتراك', titleLabel: 'عنوان الاشتراك',
    autoTitle: (d, lk) => `${lk.students?.get(Number(d.studentId))?.title ?? 'طالب'} - ${lk.plans?.get(Number(d.planId))?.title ?? 'باقة'}`,
    statuses: so('pending', 'active', 'expired', 'cancelled', 'paused'),
    fields: [
      { key: 'studentId', label: 'الطالب', type: 'rel', entity: 'students', required: true },
      { key: 'planId', label: 'الباقة', type: 'rel', entity: 'plans', required: true },
      { key: 'courseId', label: 'الدورة', type: 'rel', entity: 'courses' },
      { key: 'startDate', label: 'البداية', type: 'date', required: true },
      { key: 'endDate', label: 'النهاية', type: 'date', required: true },
      { key: 'amount', label: 'المبلغ', type: 'number', min: 0, required: true },
      { key: 'currency', label: 'العملة', type: 'text', def: 'DZD', required: true },
    ],
    columns: [
      { label: 'الطالب', key: 'studentId', kind: 'rel', entity: 'students' }, { label: 'الباقة', key: 'planId', kind: 'rel', entity: 'plans' },
      { label: 'ينتهي', key: 'endDate', kind: 'date' }, { label: 'المبلغ', key: 'amount', kind: 'money' },
    ],
    write: ADMIN, quick: [
      { label: 'تفعيل', status: 'active', from: ['pending', 'paused', 'expired'], roles: ADMIN },
      { label: 'إيقاف', status: 'paused', from: ['active'], roles: ADMIN },
      { label: 'إلغاء', status: 'cancelled', from: ['pending', 'active', 'paused'], roles: ADMIN },
    ], archive: [], related: ['students', 'plans', 'courses'], hint: 'اشتراكات الطلاب وحالتها.',
  },
  payments: {
    key: 'payments', plural: 'المدفوعات', singular: 'دفعة', titleLabel: 'عنوان الدفعة',
    autoTitle: (d, lk) => `دفعة ${lk.plans?.get(Number(d.planId))?.title ?? ''}`.trim(),
    statuses: so('pending', 'confirmed', 'rejected'),
    fields: [
      { key: 'studentId', label: 'الطالب', type: 'rel', entity: 'students', hideFor: ['student'] },
      { key: 'planId', label: 'الباقة', type: 'rel', entity: 'plans', required: true },
      { key: 'courseId', label: 'الدورة', type: 'rel', entity: 'courses' },
      { key: 'amount', label: 'المبلغ', type: 'number', required: true, min: 0 },
      { key: 'currency', label: 'العملة', type: 'text', def: 'DZD' },
      { key: 'proofPath', label: 'إثبات الدفع', type: 'file', wide: true, hint: 'صورة أو ملف PDF لوصل التحويل.' },
      { key: 'reason', label: 'ملاحظة', type: 'textarea', wide: true },
    ],
    columns: [
      { label: 'الطالب', key: 'studentId', kind: 'rel', entity: 'students' }, { label: 'الباقة', key: 'planId', kind: 'rel', entity: 'plans' },
      { label: 'المبلغ', key: 'amount', kind: 'money' }, { label: 'الإثبات', key: 'proofPath', kind: 'file' },
    ],
    write: ['admin', 'staff', 'student'], quick: [
      { label: 'تأكيد', status: 'confirmed', from: ['pending'], roles: ADMIN },
      { label: 'رفض', status: 'rejected', from: ['pending'], roles: ADMIN, reason: true },
    ], archive: [], related: ['students', 'plans', 'courses'], hint: 'دفعات يدوية بإثبات تحويل تراجعها الإدارة.',
  },
  invoices: {
    key: 'invoices', plural: 'الفواتير', singular: 'فاتورة', titleLabel: 'عنوان الفاتورة',
    autoTitle: (d) => `فاتورة ${d.number ?? ''}`.trim(), statuses: so('published'),
    fields: [
      { key: 'number', label: 'رقم الفاتورة', type: 'text', required: true },
      { key: 'studentId', label: 'الطالب', type: 'rel', entity: 'students', required: true },
      { key: 'paymentId', label: 'الدفعة', type: 'rel', entity: 'payments' },
      { key: 'amount', label: 'المبلغ', type: 'number', required: true, min: 0 },
      { key: 'currency', label: 'العملة', type: 'text', def: 'DZD' },
    ],
    columns: [{ label: 'الرقم', key: 'number' }, { label: 'الطالب', key: 'studentId', kind: 'rel', entity: 'students' }, { label: 'المبلغ', key: 'amount', kind: 'money' }],
    write: [], archive: [], related: ['students', 'payments'], hint: 'فواتير قابلة للطباعة أو الحفظ بصيغة PDF.',
  },
  settings: {
    key: 'settings', plural: 'سياسات المدرسة', singular: 'سياسة', titleLabel: 'اسم السياسة', statuses: so('active', 'disabled'),
    fields: [
      { key: 'value', label: 'قيمة السياسة', type: 'textarea', wide: true },
      { key: 'userId', label: 'الحساب (لتعيين دور)', type: 'account', hint: 'اختر حسابًا حقيقيًا ثم حدّد الدور والصلاحيات.' },
      { key: 'role', label: 'الدور', type: 'select', options: [{ value: 'admin', label: 'مدير' }, { value: 'staff', label: 'موظف' }, { value: 'teacher', label: 'أستاذ' }, { value: 'student', label: 'طالب' }] },
      { key: 'permissions', label: 'الصلاحيات', type: 'chips', wide: true, options: ['languages','levels','students', 'teachers', 'courses', 'enrollments','groups','sessions','lessons','resources','assignments','submissions','attendance','plans','payments', 'subscriptions', 'invoices', 'reports','audit'].flatMap((e) => [{ value: `${e}:read`, label: `${e} - قراءة` }, { value: `${e}:write`, label: `${e} - كتابة` }]) },
    ],
    columns: [{ label: 'القيمة', key: 'value' }, { label: 'الحساب', key: 'userId' }, { label: 'الدور', key: 'role' }], write: ['admin'], related: [], hint: 'سياسات المدرسة وتعيين أدوار الحسابات وصلاحياتها.',
  },
};

export const QTYPES: Opt[] = [
  { value: 'multiple_choice', label: 'اختيار من متعدد' }, { value: 'true_false', label: 'صح / خطأ' }, { value: 'fill_blank', label: 'إكمال الفراغ' },
  { value: 'word_order', label: 'ترتيب كلمات' }, { value: 'matching', label: 'مطابقة' }, { value: 'short_answer', label: 'إجابة قصيرة' },
  { value: 'long_answer', label: 'مقال (تصحيح يدوي)' }, { value: 'file', label: 'رفع ملف (تصحيح يدوي)' }, { value: 'audio', label: 'تسجيل صوتي (تصحيح يدوي)' },
];
export const ENTITY_ROUTES = Object.keys(ENTITIES);

export interface NavItem { href: string; label: string; icon: string; roles: Role[] }
const ALL: Role[] = ['admin', 'staff', 'teacher', 'student'];
export const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'الرئيسية', items: [
    { href: '/dashboard', label: 'لوحة التحكم', icon: 'LayoutDashboard', roles: ALL },
    { href: '/notifications', label: 'الإشعارات', icon: 'Bell', roles: ALL },
    { href: '/chats', label: 'المحادثات', icon: 'MessageCircle', roles: ALL },
    { href: '/profile', label: 'ملفي الشخصي', icon: 'UserCheck', roles: ['teacher','student'] },
    { href: '/library', label: 'مكتبة الأستاذ', icon: 'Library', roles: ['teacher'] },
    { href: '/curriculum-requests', label: 'طلبات المناهج', icon: 'FileCheck2', roles: ['teacher','admin'] },
  ] },
  { group: 'الأكاديمية', items: [
    { href: '/languages', label: 'اللغات', icon: 'Languages', roles: ['admin', 'staff'] },
    { href: '/levels', label: 'المستويات', icon: 'Layers', roles: ['admin', 'staff'] },
    { href: '/courses', label: 'الدورات', icon: 'GraduationCap', roles: ALL },
    { href: '/groups', label: 'المجموعات', icon: 'UsersRound', roles: ['admin', 'staff', 'teacher'] },
    { href: '/sessions', label: 'الحصص', icon: 'CalendarDays', roles: ALL },
    { href: '/lessons', label: 'الدروس', icon: 'BookOpen', roles: ALL },
    { href: '/resources', label: 'المصادر', icon: 'Library', roles: ALL },
    { href: '/assignments', label: 'الواجبات', icon: 'ClipboardList', roles: ALL },
    { href: '/submissions', label: 'التسليمات', icon: 'FileCheck2', roles: ALL },
    { href: '/attendance', label: 'الحضور', icon: 'UserCheck', roles: ALL },
  ] },
  { group: 'الأشخاص', items: [
    { href: '/students', label: 'الطلاب', icon: 'Users', roles: ['admin', 'staff', 'teacher'] },
    { href: '/teachers', label: 'الأساتذة', icon: 'Presentation', roles: ['admin', 'staff'] },
    { href: '/enrollments', label: 'التسجيلات', icon: 'UserPlus', roles: ['admin', 'staff'] },
  ] },
  { group: 'المالية', items: [
    { href: '/plans', label: 'الباقات', icon: 'Tags', roles: ALL },
    { href: '/subscriptions', label: 'الاشتراكات', icon: 'Repeat', roles: ALL },
    { href: '/payments', label: 'المدفوعات', icon: 'Wallet', roles: ['admin', 'staff', 'student'] },
    { href: '/invoices', label: 'الفواتير', icon: 'Receipt', roles: ['admin', 'staff', 'student'] },
  ] },
  { group: 'الإدارة', items: [
    { href: '/reports', label: 'التقارير', icon: 'FileBarChart', roles: ['admin', 'staff'] },
    { href: '/settings', label: 'الإعدادات', icon: 'Settings', roles: ['admin', 'staff'] },
  ] },
];

// ---------- helpers ----------
export const str = (v: unknown) => (v === undefined || v === null ? '' : String(v));
export const nums = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => !Number.isNaN(n)) : []);
export const fileUrl = (p: unknown) => (typeof p === 'string' && p ? `/api/school/storage${p}` : '');
export const fmtDate = (v: unknown) => {
  if (!v) return '';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? str(v) : d.toLocaleDateString('ar-DZ-u-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' });
};
export const fmtDateTime = (v: unknown) => {
  if (!v) return '';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? str(v) : d.toLocaleString('ar-DZ-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' });
};
export const fmtMoney = (amount: unknown, cur: unknown = 'DZD') => {
  const n = Number(amount);
  if (amount === undefined || amount === null || amount === '' || Number.isNaN(n)) return '';
  return `${n.toLocaleString('ar-DZ-u-nu-latn')} ${str(cur) || 'DZD'}`;
};
export const errMsg = (e: unknown): string => {
  const x = e as { data?: { error?: string; message?: string }; message?: string } | undefined;
  return x?.data?.error ?? x?.data?.message ?? x?.message ?? 'حدث خطأ غير متوقع';
};
export const canWrite = (cfg: EntityConfig, role: Role) => cfg.write.includes(role);
