import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, BadgeCheck, BookOpen, Check, Clock3, CreditCard, LoaderCircle, ShieldCheck } from 'lucide-react';
import {
  getListSchoolRecordsQueryKey, useCalculateRegistrationQuote, useCreateRegistrationRequest,
  useGetRegistrationOptions, useListSchoolRecords,
} from '@workspace/api-client-react';
import type { RegistrationQuote } from '@workspace/api-client-react';
import { PublicLayout } from '@/components/layouts';
import { errMsg } from '@/lib/school';

type FormState = {
  fullName: string; phone: string; email: string; country: 'algeria' | 'outside_algeria'; goals: string;
  languageId: string; courseType: 'level' | 'conversation' | 'exam'; levelAssessment: string; currentLevel: string;
  targetLevel: string; studyMode: string; studySystem: string; weeklySessions: string; totalSessions: string;
  duration: string; examName: string; targetScore: string; examDate: string; schedulePreferences: string;
  paymentMethod: string; paymentMethodOther: string;
};
const initial: FormState = {
  fullName: '', phone: '', email: '', country: 'algeria', goals: '', languageId: '', courseType: 'level',
  levelAssessment: '', currentLevel: '', targetLevel: '', studyMode: '', studySystem: '', weeklySessions: '',
  totalSessions: '', duration: '', examName: '', targetScore: '', examDate: '', schedulePreferences: '',
  paymentMethod: '', paymentMethodOther: '',
};
const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const courseLabels = { level: 'تحسين المستوى', conversation: 'المحادثة', exam: 'التحضير لاختبار' };

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block min-w-0"><span className="mb-2 block text-sm font-bold text-foreground">{label}</span>{children}{hint && <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{hint}</span>}</label>;
}
function Select({ value, onChange, children, testId, disabled = false }: { value: string; onChange: (value: string) => void; children: ReactNode; testId: string; disabled?: boolean }) {
  return <select className="field-input min-h-11" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} disabled={disabled}>{children}</select>;
}
function QuoteCard({ quote, loading, languageTitle, pending }: { quote: RegistrationQuote | null; loading: boolean; languageTitle: string; pending: string }) {
  const quotePending = !!pending || quote?.status === 'needs_review' || (!!quote && quote.amount == null);
  const approved = quote?.status === 'approved' || quote?.status === 'admin_approved';
  return <aside className="quote-card sticky top-5 overflow-hidden rounded-[1.7rem] border border-card-border bg-card shadow-md">
    <div className="quote-ribbon" />
    <div className="p-6 sm:p-7">
      <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary"><CreditCard className="h-5 w-5" /></span><div><p className="text-xs font-bold text-muted-foreground">ملخص الرسوم الرسمية</p><h2 className="text-lg font-extrabold">عرضك المبدئي</h2></div></div>
      <div className="mt-7 min-h-32 border-y border-border py-5" aria-live="polite" data-testid="quote-summary">
        {loading ? <div className="space-y-3"><div className="skeleton h-7 w-2/3" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-4/5" /></div>
          : quotePending ? <><p className="flex items-center gap-2 font-extrabold text-amber-800"><Clock3 className="h-4 w-4" />بانتظار اعتماد الإدارة</p><p className="mt-3 text-sm leading-7 text-muted-foreground">{quote?.message || pending || 'سيتم مراجعة السعر وإبلاغك به قبل تأكيد التسجيل.'}</p></>
          : quote?.amount != null ? <><p className="text-sm font-semibold text-muted-foreground">{languageTitle || quote.languageTitle}</p><p className="mt-1 text-3xl font-extrabold tracking-tight text-primary">{quote.amount.toLocaleString('ar')} <span className="text-base">{quote.currency}</span></p><p className="mt-1 text-sm text-muted-foreground">{quote.unit === 'monthly' ? 'لكل شهر' : quote.unit === 'level' ? 'للمستوى' : quote.unit === 'package' ? 'للباقة' : 'وحدة غير محددة'}{quote.duration ? ` · ${quote.duration}` : ''}</p></>
          : <p className="text-sm leading-7 text-muted-foreground">اختر اللغة ونوع البرنامج والتفاصيل المتاحة للاطلاع على السعر المعتمد.</p>}
      </div>
      {quote && <div className="mt-4 grid gap-x-4 gap-y-3 text-xs sm:grid-cols-2">
        <p><span className="text-muted-foreground">اللغة: </span><strong>{languageTitle || quote.languageTitle}</strong></p>
        <p><span className="text-muted-foreground">البرنامج: </span><strong>{courseLabels[quote.courseType]}</strong></p>
        {quote.studyMode && <p><span className="text-muted-foreground">نمط الدراسة: </span><strong>{quote.studyMode === 'individual' ? 'فردي VIP' : 'جماعي'}</strong></p>}
        {quote.studySystem && <p><span className="text-muted-foreground">النظام: </span><strong>{quote.studySystem === 'intensive' ? 'مكثف' : 'عادي'}</strong></p>}
        {quote.weeklySessions != null && <p><span className="text-muted-foreground">أسبوعيًا: </span><strong>{quote.weeklySessions.toLocaleString('ar')} حصص</strong></p>}
        {quote.totalSessions != null && <p><span className="text-muted-foreground">الإجمالي: </span><strong>{quote.totalSessions.toLocaleString('ar')} حصة</strong></p>}
        {quote.duration && <p><span className="text-muted-foreground">المدة: </span><strong>{quote.duration}</strong></p>}
        <p><span className="text-muted-foreground">العملة: </span><strong>{quote.currency || 'تحددها الإدارة'}</strong></p>
        <p><span className="text-muted-foreground">وحدة التسعير: </span><strong>{quote.unit === 'monthly' ? 'شهري' : quote.unit === 'level' ? 'للمستوى' : quote.unit === 'package' ? 'للباقة' : 'تحددها الإدارة'}</strong></p>
        <p><span className="text-muted-foreground">حالة السعر: </span><strong>{approved ? (quote.status === 'admin_approved' ? 'معتمد من الإدارة' : 'محسوب وفق تسعيرة معتمدة') : 'السعر قيد تأكيد الإدارة'}</strong></p>
      </div>}
      <div className="mt-5 flex gap-3 text-xs leading-6 text-muted-foreground"><ShieldCheck className="mt-1 h-4 w-4 shrink-0 text-primary" /><p>هذا عرض من بيانات التسعير الرسمية. أي سعر قيد المراجعة لن يُقدّر أو يُحتسب تلقائيًا.</p></div>
    </div>
    <div className="bg-secondary/70 px-6 py-4 text-xs font-semibold text-secondary-foreground">اختيار طريقة الدفع تفضيل للتنسيق اليدوي فقط، وليس إثباتًا أو إتمامًا للدفع.</div>
  </aside>;
}

export default function SignUpPage() {
  const options = useGetRegistrationOptions();
  const languages = useListSchoolRecords('languages');
  const quoteMutation = useCalculateRegistrationQuote();
  const create = useCreateRegistrationRequest();
  const [form, setForm] = useState<FormState>(initial);
  const [quote, setQuote] = useState<RegistrationQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [receipt, setReceipt] = useState<{
    requestNo: string;
    quote: RegistrationQuote;
    status: 'pending_review' | 'accepted' | 'rejected' | 'needs_info';
    paymentStatus: 'awaiting_verification' | 'verified' | 'rejected';
  } | null>(null);
  const [validation, setValidation] = useState('');
  const idempotencyRef = useRef({ fingerprint: '', key: '' });
  const quoteVersionRef = useRef(0);
  const quoteMutateRef = useRef(quoteMutation.mutate);
  quoteMutateRef.current = quoteMutation.mutate;
  const set = (key: keyof FormState, value: string) => setForm((s) => ({ ...s, [key]: value }));
  const activePricing = useMemo(() => (options.data?.pricingOptions ?? []).filter((x) => x.active), [options.data]);
  const availableLanguages = useMemo(() => (languages.data ?? []).filter((language) => language.status !== 'draft' && language.status !== 'archived' && activePricing.some((option) => option.languageId == null || option.languageId === language.id)), [languages.data, activePricing]);
  const languageId = Number(form.languageId);
  const countryPricing = useMemo(() => activePricing.filter((x) => x.country === form.country && (x.languageId == null || x.languageId === languageId) && x.courseType === form.courseType), [activePricing, form.country, form.courseType, languageId]);
  const modeOptions = useMemo(() => [...new Set(countryPricing.map((x) => x.studyMode).filter(Boolean))], [countryPricing]);
  const systemOptions = useMemo(() => [...new Set(countryPricing.filter((x) => !form.studyMode || x.studyMode === form.studyMode).map((x) => x.studySystem).filter(Boolean))], [countryPricing, form.studyMode]);
  const packages = useMemo(() => countryPricing.filter((x) => x.totalSessions != null), [countryPricing]);
  const intensiveWeekly = useMemo(() => [...new Set(countryPricing.filter((x) => x.studySystem === 'intensive' && (!form.studyMode || x.studyMode === form.studyMode)).map((x) => x.weeklySessions).filter((n): n is number => n != null))].sort((a, b) => a - b), [countryPricing, form.studyMode]);
  const eligibleMethods = useMemo(() => (options.data?.paymentMethods ?? []).filter((method) => method.countries.includes(form.country)), [options.data, form.country]);

  useEffect(() => {
    const version = ++quoteVersionRef.current;
    setQuote(null); setQuoteError('');
    if (!form.languageId || !form.studyMode) return;
    if (form.courseType === 'level' && (!form.studySystem || (form.studySystem === 'intensive' && !form.weeklySessions))) return;
    if (form.courseType === 'exam' && !form.totalSessions) return;
    const request = {
      country: form.country, languageId, courseType: form.courseType as 'level' | 'conversation' | 'exam',
      studyMode: form.studyMode as 'group' | 'individual',
      ...(form.courseType === 'level' ? { studySystem: form.studySystem as 'regular' | 'intensive', weeklySessions: form.studySystem === 'regular' ? 2 : Number(form.weeklySessions) } : {}),
      ...(form.courseType === 'exam' ? { totalSessions: Number(form.totalSessions) } : {}),
    };
    const timer = window.setTimeout(() => quoteMutateRef.current({ data: request }, {
      onSuccess: (result) => { if (version === quoteVersionRef.current) { setQuote(result); setQuoteError(''); } },
      onError: (error) => { if (version === quoteVersionRef.current) setQuoteError(errMsg(error)); },
    }), 280);
    return () => { window.clearTimeout(timer); quoteVersionRef.current += 1; };
  }, [form.country, form.languageId, form.courseType, form.studyMode, form.studySystem, form.weeklySessions, form.totalSessions, languageId]);

  useEffect(() => {
    if (!form.languageId) return;
    if (form.studyMode && !countryPricing.some((option) => option.studyMode === form.studyMode)) set('studyMode', '');
    if (form.studySystem && !systemOptions.includes(form.studySystem as never)) {
      set('studySystem', '');
      set('weeklySessions', '');
    }
    if (form.totalSessions && !packages.some((option) => String(option.totalSessions) === form.totalSessions)) set('totalSessions', '');
    if (form.paymentMethod && !eligibleMethods.some((method) => method.code === form.paymentMethod)) set('paymentMethod', '');
  }, [form.languageId, form.country, form.courseType, form.studyMode, form.studySystem, form.totalSessions, form.paymentMethod, countryPricing, systemOptions, packages, eligibleMethods]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setValidation('');
    if (form.fullName.trim().length < 2) { setValidation('يرجى إدخال الاسم الكامل بشكل صحيح.'); return; }
    if (form.phone.trim().length < 7 || form.phone.trim().length > 32) { setValidation('يرجى إدخال رقم هاتف دولي صحيح مع مفتاح الدولة.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setValidation('يرجى إدخال بريد إلكتروني صحيح.'); return; }
    if (!form.fullName.trim() || !form.phone.trim() || !form.email.trim() || !form.languageId || !form.paymentMethod || !form.studyMode) {
      setValidation('يرجى إكمال الاسم ورقم الهاتف والبريد واللغة ونمط الدراسة وطريقة الدفع.'); return;
    }
    if (form.courseType === 'level' && (!form.levelAssessment || (form.levelAssessment === 'known' && !form.currentLevel) || !form.targetLevel || !form.studySystem || !form.weeklySessions)) {
      setValidation('يرجى إكمال تقييم المستوى والمستوى المستهدف وتفاصيل الدراسة.'); return;
    }
    if (form.courseType === 'conversation' && !form.goals.trim()) { setValidation('يرجى كتابة هدفك من تحسين المحادثة.'); return; }
    if (form.courseType === 'exam' && (!form.totalSessions || !form.examName.trim())) {
      setValidation('يرجى اختيار الاختبار وحجم الباقة المتاح.'); return;
    }
    if (!quote) { setValidation('انتظر تحديث عرض السعر قبل إرسال الطلب.'); return; }
    if (form.paymentMethod === 'other' && !form.paymentMethodOther.trim()) { setValidation('يرجى توضيح طريقة الدفع المقترحة.'); return; }
    const payloadFields = {
      fullName: form.fullName.trim(), phone: form.phone.trim(), email: form.email.trim(),
      country: form.country, goals: form.goals.trim() || undefined, languageId, courseType: form.courseType,
      ...(form.courseType === 'level' ? {
        levelAssessment: form.levelAssessment as 'beginner' | 'placement_test' | 'known',
        ...(form.levelAssessment === 'known' ? { currentLevel: form.currentLevel as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' } : {}),
        targetLevel: form.targetLevel as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2',
        studyMode: form.studyMode as 'group' | 'individual', studySystem: form.studySystem as 'regular' | 'intensive',
        weeklySessions: form.studySystem === 'regular' ? 2 : Number(form.weeklySessions), schedulePreferences: form.schedulePreferences.trim() || undefined,
      } : {
        studyMode: form.studyMode as 'group' | 'individual',
        ...(form.courseType === 'conversation' ? { schedulePreferences: form.schedulePreferences.trim() || undefined } : {}),
        ...(form.courseType === 'exam' ? {
          ...(form.currentLevel ? { currentLevel: form.currentLevel as 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' } : {}),
          totalSessions: Number(form.totalSessions), examName: form.examName.trim(), targetScore: form.targetScore.trim() || undefined,
          examDate: form.examDate || undefined, schedulePreferences: form.schedulePreferences.trim() || undefined,
        } : {}),
      }),
      paymentMethod: form.paymentMethod as 'ccp' | 'baridi_mob' | 'edahabia_cib' | 'international_manual' | 'other',
      ...(form.paymentMethod === 'other' ? { paymentMethodOther: form.paymentMethodOther.trim() } : {}),
    };
    const fingerprint = JSON.stringify(payloadFields);
    if (idempotencyRef.current.fingerprint !== fingerprint) {
      idempotencyRef.current = { fingerprint, key: crypto.randomUUID() };
    }
    create.mutate({ data: { idempotencyKey: idempotencyRef.current.key, ...payloadFields } }, {
      onSuccess: (result) => setReceipt({ requestNo: result.requestNo, quote: result.quote, status: result.status, paymentStatus: result.paymentStatus }),
    });
  }

  const control = (key: keyof FormState, testId: string, type = 'text', placeholder = '') => <input className="field-input min-h-11" type={type} value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} data-testid={testId} />;
  const selectOptions = (key: keyof FormState, testId: string, values: [string, string][], placeholder: string, disabled = false) => <Select value={form[key]} onChange={(v) => set(key, v)} testId={testId} disabled={disabled}><option value="">{placeholder}</option>{values.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</Select>;
  function retryQuote() {
    if (!form.languageId || !form.studyMode || (form.courseType === 'level' && (!form.studySystem || (form.studySystem === 'intensive' && !form.weeklySessions))) || (form.courseType === 'exam' && !form.totalSessions)) return;
    const version = ++quoteVersionRef.current;
    setQuoteError('');
    quoteMutation.mutate({ data: {
      country: form.country, languageId, courseType: form.courseType, studyMode: form.studyMode as 'group' | 'individual',
      ...(form.courseType === 'level' ? { studySystem: form.studySystem as 'regular' | 'intensive', weeklySessions: form.studySystem === 'regular' ? 2 : Number(form.weeklySessions) } : {}),
      ...(form.courseType === 'exam' ? { totalSessions: Number(form.totalSessions) } : {}),
    } }, {
      onSuccess: (result) => { if (version === quoteVersionRef.current) { setQuote(result); setQuoteError(''); } },
      onError: (error) => { if (version === quoteVersionRef.current) setQuoteError(errMsg(error)); },
    });
  }

  return <PublicLayout><main dir="rtl" className="signup-page min-h-[100dvh] px-4 pb-16 pt-7 sm:px-6 lg:pt-12">
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="link-home"><ArrowLeft className="h-4 w-4 rotate-180" />العودة إلى GO COURSE</Link>
      <header className="signup-hero mt-6 overflow-hidden rounded-[2rem] px-6 py-8 text-white sm:px-10 sm:py-11">
        <div className="hero-grid" aria-hidden="true" />
        <div className="relative z-10 max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold"><BookOpen className="h-3.5 w-3.5" />بوابة التسجيل الرسمية</span>
          <h1 className="mt-5 text-3xl font-extrabold leading-tight sm:text-5xl">خطوتك الأولى<br className="sm:hidden" /> تبدأ بلغتك.</h1>
          <p className="mt-3 max-w-xl text-sm leading-7 text-white/75 sm:text-base">أرسل طلب الالتحاق، وراجع تفاصيل البرنامج والسعر الرسمي قبل الإرسال. ستتواصل الإدارة معك لاستكمال إجراءات الدفع يدويًا.</p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs font-semibold text-white/80"><span className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-accent" />أسعار من بيانات المدرسة</span><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" />لا يتم إنشاء حساب تلقائيًا</span></div>
        </div>
        <div className="hero-orbit" aria-hidden="true"><span>GO</span><i /><b /></div>
      </header>
      {receipt ? <section className="success-card mx-auto mt-8 max-w-3xl rounded-[1.8rem] border border-primary/20 bg-card p-7 shadow-md sm:p-10" role="status" data-testid="status-registration-success">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground"><Check className="h-7 w-7" /></span>
        <p className="mt-6 text-sm font-bold text-primary">تم استلام طلب التسجيل</p><h2 className="mt-2 text-2xl font-extrabold">رقم الطلب <span dir="ltr">{receipt.requestNo}</span></h2>
        <div className="mt-5 rounded-2xl bg-secondary/70 p-5"><p className="text-sm font-bold">ملخص اختياراتك والسعر</p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <p><span className="text-muted-foreground">اللغة: </span>{availableLanguages.find((language) => language.id === Number(form.languageId))?.title ?? receipt.quote.languageTitle}</p>
            <p><span className="text-muted-foreground">البرنامج: </span>{courseLabels[form.courseType]}</p>
            {receipt.quote.studyMode && <p><span className="text-muted-foreground">النمط: </span>{receipt.quote.studyMode === 'individual' ? 'فردي VIP' : 'جماعي'}</p>}
            {receipt.quote.studySystem && <p><span className="text-muted-foreground">النظام: </span>{receipt.quote.studySystem === 'intensive' ? 'مكثف' : 'عادي'}</p>}
            {receipt.quote.weeklySessions != null && <p><span className="text-muted-foreground">أسبوعيًا: </span>{receipt.quote.weeklySessions.toLocaleString('ar')} حصص</p>}
            {receipt.quote.totalSessions != null && <p><span className="text-muted-foreground">إجمالي الحصص: </span>{receipt.quote.totalSessions.toLocaleString('ar')}</p>}
            {receipt.quote.duration && <p><span className="text-muted-foreground">المدة: </span>{receipt.quote.duration}</p>}
          </div>
          <p className="mt-3 text-sm leading-7">{receipt.quote.message}</p>
          {receipt.quote.amount != null && <p className="mt-2 text-xl font-extrabold text-primary">{receipt.quote.amount.toLocaleString('ar')} {receipt.quote.currency} · {receipt.quote.unit === 'monthly' ? 'شهري' : receipt.quote.unit === 'level' ? 'للمستوى' : 'للباقة'}</p>}
        </div>
        <p className="mt-5 text-sm leading-7 text-muted-foreground">
          حالة الطلب: <strong>{receipt.status === 'pending_review' ? 'بانتظار مراجعة الإدارة' : receipt.status === 'accepted' ? 'مقبول' : receipt.status === 'rejected' ? 'مرفوض' : 'بانتظار معلومات إضافية'}</strong>.
          حالة الدفع: <strong>{receipt.paymentStatus === 'awaiting_verification' ? 'بانتظار التحقق اليدوي' : receipt.paymentStatus === 'verified' ? 'تم التحقق' : 'مرفوض'}</strong>.
          اختيار وسيلة الدفع لا يعني إتمام الدفع. لم يتم إنشاء حساب لك.
        </p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 font-bold text-primary-foreground" data-testid="link-success-home">العودة إلى الموقع</Link>
      </section> : <div className="mt-7 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form onSubmit={submit} className="space-y-5">
          {(options.isLoading || languages.isLoading) && <div className="rounded-2xl border bg-card p-5" aria-live="polite"><div className="skeleton h-5 w-40" /><div className="mt-4 skeleton h-11 w-full" /><p className="mt-3 text-xs text-muted-foreground">جارٍ تحميل اللغات وخيارات التسجيل من المدرسة…</p></div>}
          {(options.isError || languages.isError) && <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm"><p className="font-bold text-destructive">تعذّر تحميل خيارات التسجيل</p><p className="mt-1 text-muted-foreground">{options.error ? errMsg(options.error) : languages.error ? errMsg(languages.error) : ''}</p><button type="button" className="mt-3 font-bold text-primary underline" onClick={() => { void options.refetch(); void languages.refetch(); }}>إعادة المحاولة</button></div>}
          <section className="form-section rounded-[1.6rem] border border-card-border bg-card p-5 shadow-sm sm:p-7">
            <div className="section-heading"><span>01</span><div><h2>بيانات التواصل</h2><p>حتى نتمكن من متابعة طلبك معك</p></div></div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="الاسم الكامل *">{control('fullName', 'input-full-name', 'text', 'كما يظهر في الوثائق')}</Field>
              <Field label="رقم الهاتف الدولي *">{control('phone', 'input-phone', 'tel', '+213 ...')}<span className="mt-1 block text-xs text-muted-foreground" dir="rtl">أدخل مفتاح الدولة مع الرقم</span></Field>
              <Field label="البريد الإلكتروني *">{control('email', 'input-email', 'email', 'name@example.com')}</Field>
              <Field label="بلد الإقامة *">{selectOptions('country', 'select-country', [['algeria', 'الجزائر'], ['outside_algeria', 'خارج الجزائر']], 'اختر بلد الإقامة')}</Field>
              {form.courseType !== 'conversation' && <div className="sm:col-span-2"><Field label="ما هدفك من تعلم اللغة؟" hint="اختياري، يساعدنا على فهم ما تبحث عنه"><textarea className="field-input min-h-24 resize-y" maxLength={3000} value={form.goals} onChange={(e) => set('goals', e.target.value)} placeholder="اكتب نبذة قصيرة عن هدفك…" data-testid="input-goals" /></Field></div>}
            </div>
          </section>
          <section className="form-section rounded-[1.6rem] border border-card-border bg-card p-5 shadow-sm sm:p-7">
            <div className="section-heading"><span>02</span><div><h2>البرنامج الدراسي</h2><p>تُعرض هنا الخيارات المتاحة بحسب التسعير المنشور</p></div></div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label="اللغة *">{selectOptions('languageId', 'select-language', availableLanguages.map((l) => [String(l.id), l.title]), languages.isLoading ? 'جارٍ تحميل اللغات…' : 'اختر اللغة', options.isLoading || languages.isLoading)}{!languages.isLoading && !availableLanguages.length && <span className="mt-2 block text-xs text-muted-foreground">لا توجد لغة متاحة للتسجيل حاليًا.</span>}</Field>
              <Field label="نوع البرنامج *">{selectOptions('courseType', 'select-course-type', Object.entries(courseLabels), 'اختر نوع البرنامج')}</Field>
              <Field label="نمط الدراسة *">{selectOptions('studyMode', 'select-study-mode', modeOptions.map((m) => [m!, m === 'group' ? 'جماعي' : 'فردي']), 'اختر النمط', !form.languageId || !modeOptions.length)}</Field>
            </div>
            {form.courseType === 'level' && <div className="mt-6 border-t border-border pt-6">
              <h3 className="mb-4 text-sm font-extrabold">تفاصيل تحسين المستوى</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="تقييم مستواك الحالي *">{selectOptions('levelAssessment', 'select-level-assessment', [['beginner', 'مبتدئ تمامًا'], ['placement_test', 'أرغب باختبار تحديد المستوى'], ['known', 'أعرف مستواي']], 'اختر طريقة التقييم')}</Field>
                {form.levelAssessment === 'known' && <Field label="المستوى الحالي *">{selectOptions('currentLevel', 'select-current-level', levels.map((v) => [v, v]), 'اختر مستواك')}</Field>}
                <Field label="المستوى الذي تريد الوصول إليه *">{selectOptions('targetLevel', 'select-target-level', levels.map((v) => [v, v]), 'اختر المستوى المستهدف')}</Field>
                <Field label="نظام الدراسة *">{selectOptions('studySystem', 'select-study-system', systemOptions.map((s) => [s!, s === 'regular' ? 'عادي' : 'مكثّف']), 'اختر النظام', !form.studyMode || !systemOptions.length)}</Field>
                {form.studySystem === 'regular' && <Field label="الدروس أسبوعيًا *"><Select value={form.weeklySessions || '2'} onChange={(v) => set('weeklySessions', v)} testId="select-weekly-sessions"><option value="2">درسان أسبوعيًا</option></Select></Field>}
                {form.studySystem === 'intensive' && <Field label="الدروس أسبوعيًا *">{selectOptions('weeklySessions', 'select-intensive-sessions', intensiveWeekly.map((n) => [String(n), `${n} دروس أسبوعيًا`]), 'اختر عدد الدروس')}</Field>}
                <div className="sm:col-span-2"><Field label="الأوقات المفضلة" hint="اختياري"><input className="field-input min-h-11" value={form.schedulePreferences} onChange={(e) => set('schedulePreferences', e.target.value)} maxLength={500} placeholder="مثال: مساءً خلال أيام الأسبوع" data-testid="input-schedule-preferences" /></Field></div>
              </div>
              {!systemOptions.length && form.languageId && form.studyMode && <p className="mt-4 rounded-xl bg-secondary/70 p-3 text-xs leading-6 text-muted-foreground">لا توجد تفاصيل تسعير لهذا الخيار بعد. تواصل مع الإدارة للمساعدة.</p>}
            </div>}
            {form.courseType === 'conversation' && <div className="mt-6 border-t border-border pt-6">
              <h3 className="mb-4 text-sm font-extrabold">تفاصيل تحسين المحادثة</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-secondary/70 p-4 text-sm leading-6 text-muted-foreground">يُعرض عدد الحصص والمدة من برنامج المدرسة، ولا تُضاف خيارات غير معتمدة.</div>
                <Field label="الأوقات المناسبة" hint="اختياري"><input className="field-input min-h-11" value={form.schedulePreferences} onChange={(e) => set('schedulePreferences', e.target.value)} maxLength={500} placeholder="مثال: مساءً خلال أيام الأسبوع" data-testid="input-conversation-schedule" /></Field>
                <div className="sm:col-span-2"><Field label="هدف تحسين المحادثة *" hint="اكتب ما تريد تحسينه، مثل الطلاقة أو النطق"><textarea className="field-input min-h-24 resize-y" maxLength={3000} value={form.goals} onChange={(e) => set('goals', e.target.value)} placeholder="ما الذي تريد التركيز عليه؟" data-testid="input-conversation-goal" /></Field></div>
              </div>
            </div>}
            {form.courseType === 'exam' && <div className="mt-6 border-t border-border pt-6">
              <h3 className="mb-4 text-sm font-extrabold">تفاصيل التحضير للاختبار</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="اسم الاختبار *"><input className="field-input min-h-11" value={form.examName} onChange={(e) => set('examName', e.target.value)} maxLength={100} placeholder="مثال: IELTS" data-testid="input-exam-name" /></Field>
                <Field label="حجم الباقة *">{selectOptions('totalSessions', 'select-package-size', [...new Set(packages.map((x) => x.totalSessions).filter((v): v is number => v != null))].sort((a, b) => a - b).map((n) => [String(n), `${n} حصة`]), 'اختر باقة متاحة', !form.studyMode)}</Field>
                <Field label="المستوى الحالي">{selectOptions('currentLevel', 'select-exam-current-level', levels.map((v) => [v, v]), 'اختياري')}</Field>
                <Field label="الدرجة المستهدفة">{control('targetScore', 'input-target-score', 'text', 'اختياري')}</Field>
                <Field label="تاريخ الاختبار">{control('examDate', 'input-exam-date', 'date')}</Field>
                <div className="sm:col-span-2"><Field label="الأوقات المناسبة" hint="اختياري"><input className="field-input min-h-11" value={form.schedulePreferences} onChange={(e) => set('schedulePreferences', e.target.value)} maxLength={500} placeholder="مثال: صباحًا أو مساءً" data-testid="input-exam-schedule" /></Field></div>
              </div>
              {!packages.length && form.languageId && form.studyMode && <p className="mt-4 text-xs text-muted-foreground">لا توجد باقات اختبار منشورة لهذا الاختيار.</p>}
            </div>}
          </section>
          <section className="form-section rounded-[1.6rem] border border-card-border bg-card p-5 shadow-sm sm:p-7">
            <div className="section-heading"><span>03</span><div><h2>تفضيل الدفع</h2><p>للتنسيق اليدوي بعد مراجعة الطلب فقط</p></div></div>
            <p className="mt-5 rounded-xl border border-accent/40 bg-accent/15 p-4 text-xs leading-6">اختر الطريقة التي تفضلها. هذا الاختيار لا يسدد الرسوم، ولا يرسل إشعارًا بإتمام الدفع.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {eligibleMethods.map((method) => <label key={method.code} className={`payment-choice ${form.paymentMethod === method.code ? 'is-selected' : ''}`}><input type="radio" name="payment-method" value={method.code} checked={form.paymentMethod === method.code} onChange={() => set('paymentMethod', method.code)} data-testid={`radio-payment-${method.code}`} /><span><strong>{method.label}</strong><small>{method.manualOnly ? 'تنسيق يدوي مع الإدارة' : 'تفضيل للتنسيق مع الإدارة'}</small></span></label>)}
            </div>
            {!eligibleMethods.length && <p className="mt-3 text-sm text-muted-foreground">لا توجد طرق دفع مهيأة لبلد الإقامة المختار.</p>}
            {form.paymentMethod === 'other' && <div className="mt-4"><Field label="اذكر طريقة الدفع المقترحة *"><input className="field-input min-h-11" value={form.paymentMethodOther} onChange={(e) => set('paymentMethodOther', e.target.value)} maxLength={120} data-testid="input-payment-other" /></Field></div>}
          </section>
          {validation && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-bold text-destructive" data-testid="status-validation-error">{validation}</p>}
          {quoteError && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm"><span>تعذر تحديث عرض السعر: {quoteError}</span><button type="button" className="font-bold text-primary underline" onClick={retryQuote} data-testid="button-retry-quote">إعادة المحاولة</button></div>}
          {create.isError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">تعذّر إرسال الطلب: {errMsg(create.error)}</p>}
          <button type="submit" disabled={create.isPending || options.isLoading || languages.isLoading} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-extrabold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60" data-testid="button-submit-registration">{create.isPending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}{create.isPending ? 'جارٍ إرسال الطلب…' : 'إرسال طلب الالتحاق'}</button>
          <p className="text-center text-xs leading-6 text-muted-foreground">بإرسال الطلب، فأنت تطلب مراجعة الالتحاق فقط. لا يتم إنشاء حساب أو إتمام أي عملية دفع.</p>
        </form>
        <div className="space-y-4">
          <QuoteCard quote={quote} loading={quoteMutation.isPending} languageTitle={availableLanguages.find((l) => l.id === languageId)?.title ?? ''} pending={quoteError} />
          <div className="rounded-[1.4rem] border border-card-border bg-card/75 p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p className="text-sm leading-7 text-muted-foreground"><strong className="text-foreground">ماذا يحدث بعد الإرسال؟</strong><br />تراجع الإدارة بياناتك والسعر الرسمي، ثم تنسق معك الخطوات التالية. لا يعني إرسال هذا النموذج قبولك النهائي.</p></div></div>
        </div>
      </div>}
    </div>
  </main></PublicLayout>;
}
