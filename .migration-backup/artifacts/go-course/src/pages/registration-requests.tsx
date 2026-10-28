import { useMemo, useState, type ReactNode } from 'react';
import { AlertCircle, ArrowDownUp, BadgeCheck, Check, ChevronDown, ClipboardList, CircleDollarSign, FileCheck2, LoaderCircle, Search, ShieldAlert, UserRound, X } from 'lucide-react';
import {
  getListRegistrationPricingRulesQueryKey, getListRegistrationRequestsQueryKey, getListSchoolRecordsQueryKey,
  useConvertRegistrationRequest, useListRegistrationPricingRules, useListRegistrationRequests, useListSchoolRecords,
  useUpdateRegistrationPricingRule, useUpdateRegistrationRequest,
} from '@workspace/api-client-react';
import type { RegistrationAdminRequest, RegistrationPricingRule } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useMe } from '@/hooks/use-school';
import { errMsg, fileUrl } from '@/lib/school';

const stateLabels: Record<string, string> = { pending_review: 'قيد المراجعة', accepted: 'مقبول', rejected: 'مرفوض', needs_info: 'بحاجة إلى معلومات' };
const paymentLabels: Record<string, string> = { awaiting_payment: 'بانتظار اعتماد السعر/الدفع', awaiting_verification: 'بانتظار التحقق من الوصل', verified: 'تم التحقق', rejected: 'مرفوض' };
const paymentMethodLabels: Record<string, string> = { ccp: 'CCP', baridi_mob: 'بريدي موب', edahabia_cib: 'الذهبية / CIB', international_manual: 'دفع دولي يدوي', other: 'وسيلة أخرى' };
const typeLabels: Record<string, string> = { level: 'تحسين مستوى', conversation: 'محادثة', exam: 'تحضير اختبار' };
const modeLabels: Record<string, string> = { group: 'جماعي', individual: 'فردي' };
const systemLabels: Record<string, string> = { regular: 'عادي', intensive: 'مكثّف' };
const countryLabels: Record<string, string> = { algeria: 'الجزائر', outside_algeria: 'خارج الجزائر' };
const unitLabels: Record<string, string> = { monthly: 'شهري', level: 'للمستوى', package: 'للباقة' };
const badgeClass = (status: string) => status === 'accepted' || status === 'verified' ? 'status-good' : status === 'rejected' ? 'status-bad' : status === 'needs_info' ? 'status-warn' : 'status-pending';

function SelectField({ label, value, onChange, children, testId }: { label: string; value: string; onChange: (v: string) => void; children: ReactNode; testId: string }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">{label}</span><select className="field-input min-h-10 text-sm" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>{children}</select></label>;
}
function Stat({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div className={`admin-stat ${accent ? 'admin-stat-accent' : ''}`}><span>{label}</span><strong>{value.toLocaleString('ar')}</strong></div>;
}
function Quote({ request }: { request: RegistrationAdminRequest }) {
  const quote = request.quote;
  return <div className="quote-snapshot">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-muted-foreground">لقطة السعر المسجلة وقت الطلب</p><p className="mt-1 text-lg font-extrabold">{quote.languageTitle} · {typeLabels[quote.courseType]}</p></div><span className={`status-pill ${quote.status === 'approved' ? 'status-good' : quote.status === 'needs_review' ? 'status-warn' : 'status-pending'}`}>{quote.status === 'approved' ? 'سعر معتمد' : quote.status === 'needs_review' ? 'يحتاج مراجعة' : 'اعتماد إداري'}</span></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div><small>المبلغ</small><strong>{quote.amount == null ? 'بانتظار الإدارة' : `${quote.amount.toLocaleString('ar')} ${quote.currency}`}</strong></div>
      <div><small>وحدة السعر</small><strong>{unitLabels[quote.unit] ?? quote.unit}{quote.duration ? ` · ${quote.duration}` : ''}</strong></div>
      <div><small>مرجع التسعير</small><strong dir="ltr">{quote.sourceVersion}</strong></div>
    </div>
    {quote.message && <p className="mt-3 text-xs leading-6 text-muted-foreground">{quote.message}</p>}
  </div>;
}
function RowDetail({ request }: { request: RegistrationAdminRequest }) {
  const details: [string, string][] = [
    ['البلد', countryLabels[request.country] ?? request.country], ['البريد', request.email], ['الهاتف', request.phone],
    ['اللغة', request.languageTitle], ['نوع البرنامج', typeLabels[request.courseType]],
    ['تقييم المستوى', request.levelAssessment === 'beginner' ? 'مبتدئ' : request.levelAssessment === 'placement_test' ? 'اختبار تحديد مستوى' : request.levelAssessment === 'known' ? `معروف · ${request.currentLevel ?? ''}` : '—'],
    ['المستوى المستهدف', request.targetLevel ?? '—'], ['نمط الدراسة', modeLabels[request.studyMode ?? ''] ?? '—'],
    ['النظام', systemLabels[request.studySystem ?? ''] ?? '—'], ['الدروس أسبوعيًا', request.weeklySessions?.toLocaleString('ar') ?? '—'],
    ['إجمالي الحصص', request.totalSessions?.toLocaleString('ar') ?? '—'], ['المدة', request.duration ?? '—'],
    ['الاختبار', request.examName ?? '—'], ['الدرجة المستهدفة', request.targetScore ?? '—'],
    ['تاريخ الاختبار', request.examDate ?? '—'], ['الأوقات المفضلة', request.schedulePreferences ?? '—'],
    ['طريقة الدفع', request.paymentMethodOther ? `${paymentMethodLabels[request.paymentMethod] ?? request.paymentMethod} · ${request.paymentMethodOther}` : paymentMethodLabels[request.paymentMethod] ?? request.paymentMethod],
    ['رقم الملف الطلابي', request.studentProfileId?.toLocaleString('ar') ?? 'لم يُنشأ'], ['رقم التسجيل', request.enrollmentId?.toLocaleString('ar') ?? 'لم يُنشأ'],
    ['تاريخ الطلب', new Date(request.createdAt).toLocaleString('ar')],
  ];
  return <div className="mt-5 grid gap-x-5 gap-y-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-3">
    {details.map(([label, value]) => <div key={label} className="min-w-0"><p className="text-[11px] font-bold text-muted-foreground">{label}</p><p className="mt-1 break-words text-sm font-semibold" dir={label === 'البريد' || label === 'الهاتف' ? 'ltr' : undefined}>{value}</p></div>)}
    <div className="sm:col-span-2 lg:col-span-3"><p className="text-[11px] font-bold text-muted-foreground">وصل الدفع</p>{request.paymentReceipt ? <a href={fileUrl(request.paymentReceipt.objectPath)} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary/10 px-3 text-sm font-bold text-primary hover:bg-primary/15" data-testid={`link-payment-receipt-${request.id}`}><FileCheck2 className="h-4 w-4" />عرض الوصل · {(request.paymentReceipt.size / (1024 * 1024)).toFixed(2)} MB</a> : <p className="mt-1 text-sm font-semibold text-muted-foreground">لا يوجد وصل مرفق</p>}</div>
    {request.goals && <div className="sm:col-span-2 lg:col-span-3"><p className="text-[11px] font-bold text-muted-foreground">أهداف الطالب</p><p className="mt-1 text-sm leading-7">{request.goals}</p></div>}
    {request.adminNote && <div className="sm:col-span-2 lg:col-span-3 rounded-xl bg-secondary/60 p-3"><p className="text-[11px] font-bold text-muted-foreground">ملاحظة الإدارة</p><p className="mt-1 text-sm leading-6">{request.adminNote}</p></div>}
  </div>;
}

export default function RegistrationRequestsPage() {
  const { role } = useMe();
  const isAdmin = role === 'admin';
  const requestsQuery = useListRegistrationRequests({ query: { enabled: isAdmin, queryKey: getListRegistrationRequestsQueryKey() } });
  const rulesQuery = useListRegistrationPricingRules({ query: { enabled: isAdmin, queryKey: getListRegistrationPricingRulesQueryKey() } });
  const coursesQuery = useListSchoolRecords('courses', { query: { enabled: isAdmin, queryKey: getListSchoolRecordsQueryKey('courses') } });
  const groupsQuery = useListSchoolRecords('groups', { query: { enabled: isAdmin, queryKey: getListSchoolRecordsQueryKey('groups') } });
  const languagesQuery = useListSchoolRecords('languages', { query: { enabled: isAdmin, queryKey: getListSchoolRecordsQueryKey('languages') } });
  const updateRequest = useUpdateRegistrationRequest();
  const convert = useConvertRegistrationRequest();
  const updateRule = useUpdateRegistrationPricingRule();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [modeFilter, setModeFilter] = useState('');
  const [systemFilter, setSystemFilter] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [overrideAmount, setOverrideAmount] = useState('');
  const [overrideCurrency, setOverrideCurrency] = useState('');
  const [overrideUnit, setOverrideUnit] = useState('monthly');
  const [conversionCourse, setConversionCourse] = useState('');
  const [conversionGroup, setConversionGroup] = useState('');
  const [startDate, setStartDate] = useState('');
  const [receipt, setReceipt] = useState<{ requestNo: string; studentProfileId: number; enrollmentId: number; courseTitle: string } | null>(null);
  const [actionError, setActionError] = useState('');
  const [ruleEdit, setRuleEdit] = useState<number | null>(null);
  const [ruleForm, setRuleForm] = useState({ amount: '', currency: '', unit: 'monthly', duration: '', lessonHours: '', needsReview: false, reviewNote: '', active: true, reason: '' });
  const [ruleError, setRuleError] = useState('');
  const [ruleSuccess, setRuleSuccess] = useState('');
  const rows = requestsQuery.data ?? [];
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const publishedCourses = (coursesQuery.data ?? []).filter((course) => course.status === 'published');
  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      const text = [row.requestNo, row.fullName, row.phone, row.email, row.languageTitle].join(' ').toLocaleLowerCase();
      return (!needle || text.includes(needle)) && (!statusFilter || row.status === statusFilter) &&
        (!languageFilter || String(row.languageId) === languageFilter) &&
        (!typeFilter || row.courseType === typeFilter) && (!modeFilter || row.studyMode === modeFilter) && (!systemFilter || row.studySystem === systemFilter);
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [rows, search, statusFilter, typeFilter, languageFilter, modeFilter, systemFilter]);

  function openRequest(row: RegistrationAdminRequest) {
    setSelectedId(row.id); setReason(''); setActionError(''); setAdminNote(row.adminNote ?? '');
    setReceipt(null);
    setOverrideAmount(row.quote.amount == null ? '' : String(row.quote.amount));
    setOverrideCurrency(row.quote.currency); setOverrideUnit(row.quote.unit === 'unknown' ? 'monthly' : row.quote.unit);
    setConversionCourse(''); setConversionGroup(''); setStartDate('');
  }
  function updateStatus(status: 'accepted' | 'rejected' | 'needs_info') {
    if (!selected) return;
    if (status === 'rejected' && reason.trim().length < 3) { setActionError('أدخل سببًا واضحًا للرفض.'); return; }
    if (status === 'needs_info' && adminNote.trim().length < 3) { setActionError('اكتب المعلومات المطلوبة من الطالب في ملاحظة الإدارة.'); return; }
    updateRequest.mutate({ id: selected.id, data: { status, ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) } }, {
      onSuccess: () => { void qc.invalidateQueries({ queryKey: getListRegistrationRequestsQueryKey() }); setActionError(''); },
      onError: (error) => setActionError(errMsg(error)),
    });
  }
  function verifyPayment(paymentStatus: 'verified' | 'rejected') {
    if (!selected) return;
    if (paymentStatus === 'rejected' && reason.trim().length < 3) { setActionError('أدخل سبب رفض التحقق من الدفع.'); return; }
    updateRequest.mutate({ id: selected.id, data: { paymentStatus, ...(adminNote.trim() ? { adminNote: adminNote.trim() } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) } }, {
      onSuccess: () => { void qc.invalidateQueries({ queryKey: getListRegistrationRequestsQueryKey() }); setActionError(''); },
      onError: (error) => setActionError(errMsg(error)),
    });
  }
  function saveOverride() {
    if (!selected) return;
    const amount = overrideAmount.trim() ? Number(overrideAmount) : null;
    if (amount != null && (!Number.isFinite(amount) || amount < 0)) { setActionError('أدخل مبلغًا صحيحًا أو اتركه فارغًا.'); return; }
    if (overrideCurrency.trim().length !== 3) { setActionError('أدخل رمز العملة الرسمي المكوّن من ثلاثة أحرف.'); return; }
    if (reason.trim().length < 3) { setActionError('سبب تعديل السعر مطلوب (3 أحرف على الأقل).'); return; }
    updateRequest.mutate({ id: selected.id, data: { finalAmount: amount, finalCurrency: overrideCurrency.toUpperCase(), finalUnit: overrideUnit as 'monthly' | 'level' | 'package', adminNote: adminNote.trim() || undefined, reason: reason.trim() } }, {
      onSuccess: () => { void qc.invalidateQueries({ queryKey: getListRegistrationRequestsQueryKey() }); setActionError(''); },
      onError: (error) => setActionError(errMsg(error)),
    });
  }
  function convertRequest() {
    if (!selected || !conversionCourse || !startDate) { setActionError('اختر دورة منشورة وتاريخ بداية التسجيل.'); return; }
    if (selected.status !== 'accepted' || selected.paymentStatus !== 'verified') { setActionError('يجب قبول الطلب والتحقق من الدفع قبل التحويل.'); return; }
    const course = publishedCourses.find((x) => x.id === Number(conversionCourse));
    if (!course) { setActionError('الدورة المحددة غير متاحة أو لم تعد منشورة.'); return; }
    convert.mutate({ id: selected.id, data: { courseId: Number(conversionCourse), ...(conversionGroup ? { groupId: Number(conversionGroup) } : {}), startDate } }, {
      onSuccess: (result) => { setReceipt(result); setActionError(''); void qc.invalidateQueries({ queryKey: getListRegistrationRequestsQueryKey() }); },
      onError: (error) => setActionError(errMsg(error)),
    });
  }
  function openRule(rule: RegistrationPricingRule) {
    setRuleEdit(rule.id); setRuleError(''); setRuleSuccess('');
    setRuleForm({ amount: rule.amount == null ? '' : String(rule.amount), currency: rule.currency, unit: rule.unit, duration: rule.duration ?? '', lessonHours: rule.lessonHours == null ? '' : String(rule.lessonHours), needsReview: rule.needsReview, reviewNote: rule.reviewNote, active: rule.active, reason: '' });
  }
  function saveRule(rule: RegistrationPricingRule) {
    if (ruleForm.reason.trim().length < 3) { setRuleError('سبب التغيير مطلوب (3 أحرف على الأقل).'); return; }
    const amount = ruleForm.amount.trim() ? Number(ruleForm.amount) : null;
    const hours = ruleForm.lessonHours.trim() ? Number(ruleForm.lessonHours) : null;
    if ((amount != null && !Number.isFinite(amount)) || (hours != null && !Number.isFinite(hours))) { setRuleError('تحقق من صحة المبلغ وعدد الساعات.'); return; }
    updateRule.mutate({ id: rule.id, data: { amount, currency: ruleForm.currency.toUpperCase(), unit: ruleForm.unit as 'monthly' | 'level' | 'package', duration: ruleForm.duration.trim() || null, lessonHours: hours, needsReview: ruleForm.needsReview, reviewNote: ruleForm.reviewNote.trim(), active: ruleForm.active, reason: ruleForm.reason.trim() } }, {
      onSuccess: () => { void qc.invalidateQueries({ queryKey: getListRegistrationPricingRulesQueryKey() }); setRuleEdit(null); setRuleSuccess(`تم حفظ قاعدة التسعير رقم ${rule.id} مع سبب التغيير.`); },
      onError: (error) => setRuleError(errMsg(error)),
    });
  }

  if (!isAdmin) return <main dir="rtl" className="mx-auto max-w-3xl px-4 py-16"><div className="rounded-[1.7rem] border border-card-border bg-card p-8 text-center shadow-sm"><ShieldAlert className="mx-auto h-10 w-10 text-primary" /><h1 className="mt-4 text-2xl font-extrabold">هذه الصفحة لإدارة المدرسة</h1><p className="mt-2 text-sm leading-7 text-muted-foreground">لا يمكن عرض طلبات التسجيل أو بيانات التسعير إلا للمستخدمين المخولين.</p></div></main>;
  return <main dir="rtl" className="admin-registrations min-h-[100dvh] px-4 pb-16 pt-7 sm:px-6 lg:px-9">
    <div className="mx-auto max-w-[1440px]">
      <header className="admin-header">
        <div><p className="eyebrow">GO COURSE · إدارة التسجيل</p><h1>طلبات التسجيل</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">مراجعة طلبات الزوار ووصلات الدفع ولقطات الأسعار، ثم تحويل الطلب المعتمد إلى تسجيل أكاديمي.</p></div>
        <div className="header-stamp"><ClipboardList className="h-5 w-5" /><span>لوحة متابعة داخلية</span></div>
      </header>
      <section className="stats-strip" aria-label="ملخص الطلبات">
        <Stat label="كل الطلبات" value={rows.length} /><Stat label="قيد المراجعة" value={rows.filter((x) => x.status === 'pending_review').length} accent /><Stat label="بانتظار الدفع أو التحقق" value={rows.filter((x) => x.paymentStatus === 'awaiting_payment' || x.paymentStatus === 'awaiting_verification').length} /><Stat label="تم تحويله" value={rows.filter((x) => x.enrollmentId != null).length} />
      </section>
      <section className="mt-7 rounded-[1.5rem] border border-card-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-extrabold">سجل الطلبات</h2><p className="mt-1 text-xs text-muted-foreground">بحث وفلترة على الطلبات الحقيقية المحفوظة</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold">{visible.length.toLocaleString('ar')} طلب</span></div>
        <div className="filter-grid">
          <label className="search-field"><Search className="h-4 w-4" /><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="رقم الطلب أو اسم الطالب أو الهاتف أو البريد أو اللغة" aria-label="بحث في الطلبات" data-testid="input-search-requests" /></label>
          <SelectField label="الحالة" value={statusFilter} onChange={setStatusFilter} testId="filter-status"><option value="">كل الحالات</option>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <SelectField label="اللغة" value={languageFilter} onChange={setLanguageFilter} testId="filter-language"><option value="">كل اللغات</option>{(languagesQuery.data ?? []).map((language) => <option key={language.id} value={String(language.id)}>{language.title}</option>)}</SelectField>
          <SelectField label="نوع البرنامج" value={typeFilter} onChange={setTypeFilter} testId="filter-course-type"><option value="">كل البرامج</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <SelectField label="نمط الدراسة" value={modeFilter} onChange={setModeFilter} testId="filter-study-mode"><option value="">كل الأنماط</option>{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
          <SelectField label="النظام" value={systemFilter} onChange={setSystemFilter} testId="filter-study-system"><option value="">كل الأنظمة</option>{Object.entries(systemLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectField>
        </div>
        {requestsQuery.isLoading ? <div className="mt-5 space-y-3" aria-label="جارٍ تحميل الطلبات">{[1, 2, 3].map((n) => <div key={n} className="skeleton h-20 rounded-xl" />)}</div>
          : requestsQuery.isError ? <div role="alert" className="mt-5 rounded-xl bg-destructive/5 p-5 text-sm"><p className="font-bold text-destructive">تعذّر تحميل الطلبات</p><p className="mt-1">{errMsg(requestsQuery.error)}</p><button className="mt-3 font-bold text-primary underline" onClick={() => requestsQuery.refetch()}>إعادة المحاولة</button></div>
          : !visible.length ? <div className="empty-requests mt-5"><ClipboardList className="h-8 w-8" /><p className="mt-3 font-extrabold">{rows.length ? 'لا توجد نتائج مطابقة' : 'لا توجد طلبات مسجلة بعد'}</p><p className="mt-1 text-sm">{rows.length ? 'غيّر كلمات البحث أو خيارات التصفية.' : 'ستظهر هنا طلبات الالتحاق الواردة من نموذج التسجيل.'}</p></div>
          : <div className="mt-4 space-y-2.5">{visible.map((row) => <button type="button" key={row.id} onClick={() => openRequest(row)} className={`request-list-row ${selectedId === row.id ? 'request-row-active' : ''}`} data-testid={`button-open-request-${row.id}`}>
            <span className="request-avatar">{row.fullName.trim().slice(0, 1)}</span><span className="min-w-0 flex-1 text-right"><span className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong className="truncate">{row.fullName}</strong><small dir="ltr">{row.requestNo}</small></span><span className="mt-1 block truncate text-xs text-muted-foreground">{row.languageTitle} · {typeLabels[row.courseType]} · {row.phone}</span></span>
            <span className="hidden items-center gap-2 sm:flex"><span className={`status-pill ${badgeClass(row.status)}`}>{stateLabels[row.status] ?? row.status}</span><span className={`status-pill ${badgeClass(row.paymentStatus)}`}>{paymentLabels[row.paymentStatus] ?? row.paymentStatus}</span></span>
            <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground" />
          </button>)}</div>}
      </section>
      {selected && <section className="request-detail mt-5 rounded-[1.6rem] border border-card-border bg-card p-5 shadow-md sm:p-7" aria-label={`تفاصيل الطلب ${selected.requestNo}`}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary"><UserRound className="h-5 w-5" /></span><div><p className="text-xs font-bold text-muted-foreground">طلب التسجيل</p><h2 className="text-xl font-extrabold">{selected.fullName}</h2><p className="mt-1 text-sm text-muted-foreground" dir="ltr">{selected.requestNo}</p></div></div><div className="flex flex-wrap gap-2"><span className={`status-pill ${badgeClass(selected.status)}`}>{stateLabels[selected.status] ?? selected.status}</span><span className={`status-pill ${badgeClass(selected.paymentStatus)}`}>{paymentLabels[selected.paymentStatus] ?? selected.paymentStatus}</span><button type="button" className="icon-close" onClick={() => { setSelectedId(null); setActionError(''); }} aria-label="إغلاق تفاصيل الطلب" data-testid="button-close-request"><X className="h-4 w-4" /></button></div></div>
        <RowDetail request={selected} /><div className="mt-5"><Quote request={selected} /></div>
        <div className="mt-6 grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
          <section className="admin-action-panel">
            <div className="panel-heading"><ArrowDownUp className="h-4 w-4 text-primary" /><div><h3>مراجعة القرار والدفع</h3><p>كل تغيير يُحفظ على سجل الطلب</p></div></div>
            <label className="mt-4 block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">ملاحظة الإدارة</span><textarea className="field-input min-h-20" maxLength={2000} value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="ملاحظة داخلية أو ما يلزم استكماله" data-testid="input-admin-note" /></label>
            <label className="mt-4 block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">سبب الإجراء أو تغيير السعر</span><textarea className="field-input min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} placeholder="يسجل السبب في سجل المراجعة" data-testid="input-action-reason" /></label>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <button className="action-button action-approve" disabled={updateRequest.isPending || selected.status === 'accepted'} onClick={() => updateStatus('accepted')} data-testid="button-accept-request"><Check className="h-4 w-4" />قبول الطلب</button>
              <button className="action-button action-neutral" disabled={updateRequest.isPending || selected.status === 'needs_info'} onClick={() => updateStatus('needs_info')} data-testid="button-request-info">طلب معلومات</button>
              <button className="action-button action-reject" disabled={updateRequest.isPending || selected.status === 'rejected'} onClick={() => updateStatus('rejected')} data-testid="button-reject-request"><X className="h-4 w-4" />رفض الطلب</button>
            </div>
            <div className="mt-5 border-t border-border pt-4"><p className="text-xs font-extrabold">التحقق من الدفع</p><p className="mt-1 text-xs leading-5 text-muted-foreground">تسجيل التحقق يدويًا لا ينفذ عملية دفع ولا يرسل بريدًا إلكترونيًا.</p>
              <div className="mt-3 flex flex-wrap gap-2"><button className="action-button action-approve" disabled={updateRequest.isPending || selected.paymentStatus === 'verified'} onClick={() => verifyPayment('verified')} data-testid="button-verify-payment"><BadgeCheck className="h-4 w-4" />تأكيد التحقق</button><button className="action-button action-reject" disabled={updateRequest.isPending || selected.paymentStatus === 'rejected'} onClick={() => verifyPayment('rejected')} data-testid="button-reject-payment">رفض التحقق</button></div>
            </div>
            <div className="mt-5 border-t border-border pt-4"><div className="panel-heading"><CircleDollarSign className="h-4 w-4 text-primary" /><div><h3>اعتماد سعر نهائي</h3><p>تغيير السعر يتطلب سببًا موثقًا</p></div></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3"><label><span className="mb-1.5 block text-xs font-bold text-muted-foreground">المبلغ (فارغ للمراجعة)</span><input className="field-input min-h-10" type="number" min="0" step="any" value={overrideAmount} onChange={(e) => setOverrideAmount(e.target.value)} data-testid="input-final-amount" /></label><label><span className="mb-1.5 block text-xs font-bold text-muted-foreground">العملة</span><input className="field-input min-h-10 uppercase" maxLength={3} value={overrideCurrency} onChange={(e) => setOverrideCurrency(e.target.value)} data-testid="input-final-currency" /></label><SelectField label="الوحدة" value={overrideUnit} onChange={setOverrideUnit} testId="select-final-unit"><option value="monthly">شهري</option><option value="level">للمستوى</option><option value="package">للباقة</option></SelectField></div>
              <button className="action-button action-neutral mt-3" disabled={updateRequest.isPending} onClick={saveOverride} data-testid="button-save-quote-override">{updateRequest.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}حفظ السعر المعتمد</button>
            </div>
            {actionError && <p role="alert" className="mt-4 rounded-xl bg-destructive/5 p-3 text-sm text-destructive" data-testid="status-admin-action-error"><AlertCircle className="me-1 inline h-4 w-4" />{actionError}</p>}
          </section>
          <section className="admin-action-panel">
            <div className="panel-heading"><FileCheck2 className="h-4 w-4 text-primary" /><div><h3>التحويل إلى تسجيل أكاديمي</h3><p>متاح بعد قبول الطلب والتحقق من الدفع</p></div></div>
            {selected.status !== 'accepted' || selected.paymentStatus !== 'verified' ? <p className="mt-5 rounded-xl bg-secondary/70 p-4 text-sm leading-6 text-muted-foreground">أكمل قبول الطلب والتحقق من الدفع أولًا. لن ينشأ ملف طالب أو تسجيل قبل استيفاء الشرطين.</p> : selected.enrollmentId ? <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm"><p className="font-bold text-primary">تم تحويل الطلب إلى تسجيل</p><p className="mt-2">رقم التسجيل: {selected.enrollmentId.toLocaleString('ar')} · ملف الطالب: {selected.studentProfileId?.toLocaleString('ar') ?? '—'}</p></div> : <>
              <label className="mt-5 block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">الدورة المنشورة *</span><select className="field-input min-h-11" value={conversionCourse} onChange={(e) => setConversionCourse(e.target.value)} data-testid="select-conversion-course"><option value="">{coursesQuery.isLoading ? 'جارٍ تحميل الدورات…' : 'اختر دورة منشورة'}</option>{publishedCourses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}</select></label>
              <label className="mt-4 block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">المجموعة (اختياري)</span><select className="field-input min-h-11" value={conversionGroup} onChange={(e) => setConversionGroup(e.target.value)} data-testid="select-conversion-group"><option value="">بدون مجموعة</option>{(groupsQuery.data ?? []).filter((group) => group.status !== 'archived' && group.status !== 'disabled').map((group) => <option value={group.id} key={group.id}>{group.title}</option>)}</select></label>
              <label className="mt-4 block"><span className="mb-1.5 block text-xs font-bold text-muted-foreground">تاريخ البداية *</span><input className="field-input min-h-11" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-conversion-start-date" /></label>
              <button className="action-button action-approve mt-4 w-full" disabled={convert.isPending || coursesQuery.isLoading || !publishedCourses.length} onClick={convertRequest} data-testid="button-convert-request">{convert.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}تحويل الطلب</button>
            </>}
            {receipt && <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4" role="status" data-testid="status-conversion-result"><p className="font-extrabold text-primary">اكتمل التحويل</p><p className="mt-2 text-sm leading-6">{receipt.courseTitle}</p><p className="text-xs text-muted-foreground">رقم الطلب {receipt.requestNo} · ملف الطالب {receipt.studentProfileId} · التسجيل {receipt.enrollmentId}</p></div>}
            {convert.isError && <p role="alert" className="mt-4 rounded-xl bg-destructive/5 p-3 text-sm text-destructive">{errMsg(convert.error)}</p>}
          </section>
        </div>
      </section>}
      {receipt && !selected && <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm" role="status">تم التحويل بنجاح: {receipt.courseTitle} · تسجيل #{receipt.enrollmentId}</div>}
      <section className="mt-8 rounded-[1.5rem] border border-card-border bg-card p-5 shadow-sm sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">مرجع الرسوم</p><h2 className="mt-1 text-xl font-extrabold">قواعد التسعير الرسمية</h2><p className="mt-1 text-sm text-muted-foreground">تعرض القواعد كما وردت من الخدمة. التغييرات تحفظ مع السبب وسجل التحديث.</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold">{(rulesQuery.data ?? []).length.toLocaleString('ar')} قاعدة</span></div>
        {ruleSuccess && <p role="status" className="mt-4 rounded-xl bg-primary/5 p-3 text-sm text-primary" data-testid="status-rule-success">{ruleSuccess}</p>}
        {rulesQuery.isLoading ? <div className="mt-5 space-y-3">{[1, 2].map((n) => <div key={n} className="skeleton h-16 rounded-xl" />)}</div>
          : rulesQuery.isError ? <div role="alert" className="mt-4 rounded-xl bg-destructive/5 p-4 text-sm"><p>تعذّر تحميل قواعد التسعير: {errMsg(rulesQuery.error)}</p><button className="mt-2 font-bold text-primary underline" onClick={() => rulesQuery.refetch()}>إعادة المحاولة</button></div>
          : !(rulesQuery.data ?? []).length ? <div className="empty-requests mt-4"><CircleDollarSign className="h-8 w-8" /><p className="mt-3 font-bold">لا توجد قواعد تسعير</p><p className="mt-1 text-sm">لم تُرجع الخدمة قواعد تسعير حاليًا.</p></div>
          : <div className="mt-5 space-y-3">{rulesQuery.data!.map((rule) => <article key={rule.id} className="pricing-rule" data-testid={`pricing-rule-${rule.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{countryLabels[rule.country]} · {typeLabels[rule.courseType]}</h3><span className={`status-pill ${rule.active ? 'status-good' : 'status-bad'}`}>{rule.active ? 'نشطة' : 'غير نشطة'}</span>{rule.needsReview && <span className="status-pill status-warn">تحتاج مراجعة</span>}</div><p className="mt-1 text-xs text-muted-foreground">{rule.languageId == null ? 'كل اللغات' : languagesQuery.data?.find((language) => language.id === rule.languageId)?.title ?? `لغة #${rule.languageId}`} · {rule.studyMode ? modeLabels[rule.studyMode] : 'كل الأنماط'} · {rule.studySystem ? systemLabels[rule.studySystem] : 'كل الأنظمة'} · {rule.weeklySessions ? `${rule.weeklySessions} أسبوعيًا` : rule.totalSessions ? `${rule.totalSessions} حصة` : '—'}</p></div><button className="action-button action-neutral" onClick={() => openRule(rule)} data-testid={`button-edit-pricing-${rule.id}`}>تعديل موثق</button></div>
            <div className="mt-3 grid gap-3 text-xs sm:grid-cols-4"><p><span className="block text-muted-foreground">السعر</span><strong className="mt-1 block text-sm">{rule.amount == null ? 'قيد المراجعة' : `${rule.amount.toLocaleString('ar')} ${rule.currency}`} · {unitLabels[rule.unit]}</strong></p><p><span className="block text-muted-foreground">المدة / ساعات الحصة</span><strong className="mt-1 block text-sm">{rule.duration ?? '—'}{rule.lessonHours != null ? ` · ${rule.lessonHours} ساعة` : ''}</strong></p><p><span className="block text-muted-foreground">مصدر السعر</span><strong className="mt-1 block text-sm" dir="ltr">{rule.sourceVersion} · ص {rule.sourcePage}</strong></p><p><span className="block text-muted-foreground">آخر تحديث</span><strong className="mt-1 block text-sm">{new Date(rule.updatedAt).toLocaleDateString('ar')}</strong></p></div>
            {rule.reviewNote && <p className="mt-3 rounded-lg bg-secondary/60 p-3 text-xs leading-6">{rule.reviewNote}</p>}
            {ruleEdit === rule.id && <div className="rule-editor mt-4">
              <h4 className="font-extrabold">تعديل القاعدة #{rule.id}</h4><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label><span className="field-label">المبلغ</span><input className="field-input min-h-10" type="number" step="any" value={ruleForm.amount} onChange={(e) => setRuleForm((v) => ({ ...v, amount: e.target.value }))} data-testid={`input-rule-amount-${rule.id}`} /></label>
                <label><span className="field-label">العملة</span><input className="field-input min-h-10 uppercase" maxLength={3} value={ruleForm.currency} onChange={(e) => setRuleForm((v) => ({ ...v, currency: e.target.value }))} data-testid={`input-rule-currency-${rule.id}`} /></label>
                <SelectField label="وحدة السعر" value={ruleForm.unit} onChange={(unit) => setRuleForm((v) => ({ ...v, unit }))} testId={`select-rule-unit-${rule.id}`}><option value="monthly">شهري</option><option value="level">للمستوى</option><option value="package">للباقة</option></SelectField>
                <label><span className="field-label">المدة</span><input className="field-input min-h-10" value={ruleForm.duration} onChange={(e) => setRuleForm((v) => ({ ...v, duration: e.target.value }))} data-testid={`input-rule-duration-${rule.id}`} /></label>
                <label><span className="field-label">ساعات الحصة</span><input className="field-input min-h-10" type="number" step="any" value={ruleForm.lessonHours} onChange={(e) => setRuleForm((v) => ({ ...v, lessonHours: e.target.value }))} data-testid={`input-rule-hours-${rule.id}`} /></label>
                <label className="sm:col-span-2"><span className="field-label">ملاحظة المراجعة</span><input className="field-input min-h-10" value={ruleForm.reviewNote} onChange={(e) => setRuleForm((v) => ({ ...v, reviewNote: e.target.value }))} data-testid={`input-rule-note-${rule.id}`} /></label>
                <label className="sm:col-span-2"><span className="field-label">سبب التغيير *</span><input className="field-input min-h-10" value={ruleForm.reason} onChange={(e) => setRuleForm((v) => ({ ...v, reason: e.target.value }))} data-testid={`input-rule-reason-${rule.id}`} /></label>
                <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={ruleForm.needsReview} onChange={(e) => setRuleForm((v) => ({ ...v, needsReview: e.target.checked }))} data-testid={`check-rule-review-${rule.id}`} />تحتاج مراجعة</label>
                <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={ruleForm.active} onChange={(e) => setRuleForm((v) => ({ ...v, active: e.target.checked }))} data-testid={`check-rule-active-${rule.id}`} />قاعدة نشطة</label>
              </div>
              {ruleError && <p role="alert" className="mt-3 text-sm text-destructive">{ruleError}</p>}
              <div className="mt-4 flex gap-2"><button className="action-button action-approve" disabled={updateRule.isPending} onClick={() => saveRule(rule)} data-testid={`button-save-rule-${rule.id}`}>{updateRule.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}حفظ التعديل</button><button className="action-button action-neutral" onClick={() => { setRuleEdit(null); setRuleError(''); }} data-testid={`button-cancel-rule-${rule.id}`}>إلغاء</button></div>
            </div>}
          </article>)}</div>}
        {updateRule.isError && <p role="alert" className="mt-4 text-sm text-destructive">{errMsg(updateRule.error)}</p>}
      </section>
    </div>
  </main>;
}
