import { useState } from 'react';
import { Link, useParams } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Download, Printer } from 'lucide-react';
import {
  exportSchoolReport,
  useUpdateSchoolRecord,
  getGetSchoolRecordQueryKey,
  getListSchoolAccountsQueryKey,
  getListSchoolRecordsQueryKey,
  useGetSchoolRecord,
  useListSchoolAccounts,
  useListSchoolRecords,
  useReadSchoolNotifications,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/common';
import { EntityPage } from '@/components/entity-page';
import { LogoMark, PublicLayout } from '@/components/layouts';
import { useToast } from '@/hooks/use-toast';
import { useLookups, useMe } from '@/hooks/use-school';
import { ENTITIES, LEVELS, STATUS_LABEL, errMsg, fmtDate, fmtDateTime, fmtMoney, str } from '@/lib/school';

export function NotificationsPage() {
  const q = useListSchoolRecords('notifications');
  const qc = useQueryClient();
  const { toast } = useToast();
  const read = useReadSchoolNotifications();
  const update = useUpdateSchoolRecord();
  const rows = (q.data ?? []).filter((n) => n.status !== 'archived').sort((a, b) => b.id - a.id);
  const unread = rows.filter((n) => !n.data.read).length;
  const markAll = () => read.mutate(undefined, {
    onSuccess: () => { qc.invalidateQueries({ queryKey: getListSchoolRecordsQueryKey('notifications') }); toast({ title: 'تم تعليم الكل كمقروء' }); },
    onError: (e) => toast({ title: 'تعذّر التحديث', description: errMsg(e), variant: 'destructive' }),
  });
  return (
    <div>
      <PageHeader title="الإشعارات" hint={unread ? `لديك ${unread} إشعارات غير مقروءة` : 'أنت على اطلاع بكل شيء'}
        actions={unread > 0 && <Button variant="outline" onClick={markAll} disabled={read.isPending} data-testid="button-mark-read"><CheckCheck className="ms-1 h-4 w-4" />تعليم الكل كمقروء</Button>} />
      {q.isLoading ? <ListSkeleton /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : !rows.length ? (
        <EmptyState title="لا توجد إشعارات" hint="ستصلك هنا تنبيهات الحصص والواجبات والمدفوعات." />
      ) : (
        <ul className="space-y-2">
          {rows.map((n) => {
            const href = str(n.data.href);
            const inner = (
              <div className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${n.data.read ? 'border-card-border bg-card' : 'border-primary/30 bg-primary/5'}`} data-testid={`item-notification-${n.id}`}>
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${n.data.read ? 'bg-muted' : 'bg-primary text-primary-foreground'}`}><Bell className="h-4 w-4" /></span>
                <div className="flex-1"><p className="font-semibold">{str(n.data.message) || n.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{fmtDateTime(n.createdAt)}</p></div>
              </div>
            );
            const markOne=()=>{if(!n.data.read)update.mutate({entity:"notifications",id:n.id,data:{title:n.title,status:n.status,data:{read:true}}},{onSuccess:()=>qc.invalidateQueries({queryKey:getListSchoolRecordsQueryKey("notifications")}),onError:(e)=>toast({title:"تعذّر تحديث الإشعار",description:errMsg(e),variant:"destructive"})});};
            return <li key={n.id}>{href.startsWith('/') ? <Link href={href} onClick={markOne}>{inner}</Link> : <button className="w-full text-start" onClick={markOne}>{inner}</button>}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

export function SettingsPage() {
  const audit = useListSchoolRecords('audit');
  const { role, me } = useMe();
  const accounts = useListSchoolAccounts({ query: { enabled: role === 'admin', queryKey: getListSchoolAccountsQueryKey() } });
  const [tab, setTab] = useState<'settings' | 'accounts' | 'audit'>('settings');
  const rows = (audit.data ?? []).slice().sort((a, b) => b.id - a.id).slice(0, 100);
  return (
    <div>
      <PageHeader title="الإعدادات" hint="سياسات المدرسة، أدوار الحسابات وصلاحياتها، وسجل التدقيق." />
      {me?.id && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-card-border bg-card px-4 py-3 text-sm" data-testid="own-id">
          <span className="text-muted-foreground">معرّف حسابك:</span><code dir="ltr" className="rounded-lg bg-muted px-2 py-1 font-mono text-xs" data-testid="text-own-id">{me.id}</code>
          <Button size="sm" variant="outline" onClick={() => navigator.clipboard?.writeText(String(me.id))} data-testid="button-copy-id">نسخ</Button>
        </div>
      )}
      <div className="mb-5 inline-flex rounded-xl bg-secondary p-1">
        {([['settings', 'السياسات والأدوار'], ...(role === 'admin' ? [['accounts', 'الحسابات'] as const] : []), ['audit', 'سجل التدقيق']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`tab-${k}`} className={`rounded-lg px-4 py-1.5 text-sm font-bold ${tab === k ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{l}</button>
        ))}
      </div>
      {tab === 'settings' ? (
        <>
          {role !== 'admin' && <p className="mb-3 rounded-xl bg-accent/25 px-4 py-2 text-sm">التعديل على الإعدادات متاح لمالك المدرسة فقط.</p>}
          <EntityPage entity="settings" embedded />
        </>
      ) : tab === 'accounts' ? (
        accounts.isLoading ? <ListSkeleton /> : accounts.isError ? <ErrorState message={errMsg(accounts.error)} onRetry={() => accounts.refetch()} /> : !(accounts.data ?? []).length ? <EmptyState title="لا توجد حسابات" hint="تظهر الحسابات هنا بعد تسجيل المستخدمين." /> : (
          <div className="overflow-x-auto rounded-2xl border border-card-border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="bg-secondary/60 text-xs"><th className="px-4 py-3 text-start">الاسم</th><th className="px-4 py-3 text-start">البريد</th><th className="px-4 py-3 text-start">الدور</th><th className="px-4 py-3 text-start">الصلاحيات</th><th className="px-4 py-3 text-start">الحالة</th></tr></thead>
              <tbody>{(accounts.data ?? []).map((a) => <tr key={a.id} className="border-t border-border" data-testid={`row-account-${a.id}`}><td className="px-4 py-2.5 font-semibold">{a.name}</td><td className="px-4 py-2.5 text-muted-foreground" dir="ltr">{a.email}</td><td className="px-4 py-2.5">{a.role}</td><td className="px-4 py-2.5 text-xs text-muted-foreground">{a.permissions.join('، ') || '—'}</td><td className="px-4 py-2.5">{a.enabled ? 'مفعّل' : 'معطّل'}</td></tr>)}</tbody>
            </table>
          </div>
        )
      ) : audit.isLoading ? <ListSkeleton /> : audit.isError ? <ErrorState message={errMsg(audit.error)} onRetry={() => audit.refetch()} /> : !rows.length ? (
        <EmptyState title="السجل فارغ" hint="تُسجَّل هنا العمليات الإدارية الحساسة." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-card-border bg-card">
          <table className="w-full min-w-[480px] text-sm">
            <thead><tr className="bg-secondary/60 text-xs"><th className="px-4 py-3 text-start">الإجراء</th><th className="px-4 py-3 text-start">المنفّذ</th><th className="px-4 py-3 text-start">الوقت</th></tr></thead>
            <tbody>{rows.map((r) => <tr key={r.id} className="border-t border-border" data-testid={`row-audit-${r.id}`}><td className="px-4 py-2.5 font-semibold">{str(r.data.action) || r.title}</td><td className="px-4 py-2.5 text-muted-foreground">{str(r.data.actor)}</td><td className="px-4 py-2.5 text-muted-foreground">{fmtDateTime(r.createdAt)}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const REPORTABLE = ['students', 'teachers', 'courses', 'enrollments', 'subscriptions', 'payments', 'invoices', 'attendance', 'submissions', 'sessions', 'audit'];
export function ReportsPage() {
  const { toast } = useToast();
  const [busy, setBusy] = useState('');
  const [f, setF] = useState<Record<string, string>>({});
  const { lookup } = useLookups(['languages', 'teachers', 'courses']);
  const names: Record<string, string> = { ...Object.fromEntries(Object.values(ENTITIES).map((e) => [e.key, e.plural])), audit: 'سجل التدقيق' };
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));
  const sel = (k: string, label: string, opts: { value: string | number; label: string }[]) => (
    <select className="field-input w-auto" value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} data-testid={`report-${k}`}>
      <option value="">{label}</option>{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
  const list = (k: string) => Array.from(lookup[k]?.values() ?? []).map((r) => ({ value: r.id, label: r.title }));
  const run = async (entity: string) => {
    setBusy(entity);
    try {
      const params: Record<string, string | number> = { entity };
      for (const [k, v] of Object.entries(f)) if (v) params[k] = ['languageId', 'teacherId', 'courseId'].includes(k) ? Number(v) : v;
      const csv = await exportSchoolReport(params as { entity: string });
      const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${entity}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast({ title: 'تم تنزيل التقرير' });
    } catch (e) { toast({ title: 'تعذّر التصدير', description: errMsg(e), variant: 'destructive' }); } finally { setBusy(''); }
  };
  return (
    <div>
      <PageHeader title="التقارير" hint="صدّر بيانات المدرسة بصيغة CSV؛ المرشّحات تُطبَّق على الخادم." />
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-card-border bg-card p-3" data-testid="report-filters">
        <input className="field-input w-48" placeholder="بحث" value={f.search ?? ''} onChange={(e) => set('search', e.target.value)} data-testid="report-search" />
        {sel('status', 'كل الحالات', ['active', 'draft', 'published', 'pending', 'confirmed', 'rejected', 'paused', 'completed', 'cancelled', 'archived'].map((v) => ({ value: v, label: STATUS_LABEL[v] ?? v })))}
        {sel('languageId', 'كل اللغات', list('languages'))}
        {sel('teacherId', 'كل الأساتذة', list('teachers'))}
        {sel('courseId', 'كل الدورات', list('courses'))}
        {sel('level', 'كل المستويات', LEVELS.map((l) => ({ value: l, label: l })))}
        {sel('studySystem', 'كل الأنظمة', [{ value: 'regular', label: 'عادي' }, { value: 'intensive', label: 'مكثّف' }])}
        {sel('courseType', 'كل الأنواع', [{ value: 'level', label: 'مستوى' }, { value: 'conversation', label: 'محادثة' }, { value: 'exam', label: 'اختبار' }])}
        <label className="flex items-center gap-1 text-xs text-muted-foreground">من<input type="date" className="field-input w-auto" value={f.from ?? ''} onChange={(e) => set('from', e.target.value)} data-testid="report-from" /></label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">إلى<input type="date" className="field-input w-auto" value={f.to ?? ''} onChange={(e) => set('to', e.target.value)} data-testid="report-to" /></label>
        <Button size="sm" variant="ghost" onClick={() => setF({})} data-testid="report-clear">مسح</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTABLE.map((e) => (
          <div key={e} className="flex items-center justify-between rounded-2xl border border-card-border bg-card p-4 shadow-sm">
            <span className="font-bold">{names[e]}</span>
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run(e)} data-testid={`button-export-${e}`}><Download className="ms-1.5 h-4 w-4" />{busy === e ? 'جارٍ التصدير' : 'CSV'}</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InvoicePage() {
  const id = Number(useParams<{ id: string }>().id);
  const q = useGetSchoolRecord('invoices', id, { query: { enabled: !Number.isNaN(id), queryKey: getGetSchoolRecordQueryKey('invoices', id) } });
  const students = useListSchoolRecords('students');
  const inv = q.data;
  const student = students.data?.find((s) => s.id === Number(inv?.data.studentId));
  return (
    <div>
      <div className="no-print mb-5 flex items-center justify-between">
        <Link href="/invoices" className="text-sm font-bold text-primary hover:underline" data-testid="link-back-invoices">الرجوع إلى الفواتير</Link>
        <Button onClick={() => window.print()} data-testid="button-print"><Printer className="ms-1.5 h-4 w-4" />طباعة / حفظ PDF</Button>
      </div>
      {q.isLoading ? <ListSkeleton rows={4} /> : q.isError || !inv ? <ErrorState message={q.error ? errMsg(q.error) : 'الفاتورة غير موجودة'} onRetry={() => q.refetch()} /> : (
        <article className="mx-auto max-w-2xl rounded-3xl border border-card-border bg-card p-8 shadow-lg" data-testid="invoice-sheet">
          <div className="flex items-start justify-between border-b border-border pb-6">
            <div className="flex items-center gap-3"><LogoMark s={56} /><div><p className="text-xl font-extrabold">GO COURSE</p><p className="text-xs text-muted-foreground">New language, new life</p></div></div>
            <div className="text-end"><p className="text-xs text-muted-foreground">فاتورة رقم</p><p className="text-lg font-extrabold" data-testid="text-invoice-number">{str(inv.data.number)}</p><p className="text-xs text-muted-foreground">{fmtDate(inv.createdAt)}</p></div>
          </div>
          <dl className="grid gap-4 py-6 sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">الطالب</dt><dd className="font-bold">{student?.title ?? '—'}</dd></div>
            <div><dt className="text-xs text-muted-foreground">الحالة</dt><dd className="font-bold">{inv.status === 'void' ? 'ملغاة' : 'صادرة'}</dd></div>
          </dl>
          <div className="flex items-center justify-between rounded-2xl bg-secondary p-5"><span className="font-bold">المبلغ الإجمالي</span><span className="text-2xl font-extrabold text-primary" data-testid="text-invoice-amount">{fmtMoney(inv.data.amount, inv.data.currency)}</span></div>
        </article>
      )}
    </div>
  );
}

const DOCS: Record<string, { title: string; sections: [string, string][] }> = {
  terms: { title: 'الشروط والأحكام', sections: [
    ['استخدام المنصة', 'تُستخدم منصة GO COURSE لإدارة التعلّم داخل المدرسة، ويلتزم كل مستخدم بالحفاظ على سرية حسابه واستخدامه للغرض التعليمي فقط.'],
    ['الاشتراكات والدفع', 'يتم تفعيل الاشتراك بعد مراجعة إدارة المدرسة لإثبات الدفع. تُحدَّد الأسعار والمدة في كل باقة، ويحق للإدارة رفض الدفعة مع ذكر السبب.'],
    ['المحتوى التعليمي', 'المواد والتسجيلات الخاصة بالدورات محمية، ولا يجوز مشاركتها أو إعادة نشرها خارج المدرسة.'],
    ['تعديل الشروط', 'يجوز للمدرسة تحديث هذه الشروط، وسيُعلَن عن أي تغيير جوهري عبر الإشعارات.'],
  ] },
  privacy: { title: 'سياسة الخصوصية', sections: [
    ['البيانات التي نجمعها', 'الاسم والبريد الإلكتروني والهاتف واللغات والمستويات المطلوبة، إضافةً إلى بيانات الحضور والواجبات والمدفوعات اللازمة لإدارة التعلّم.'],
    ['كيف نحمي بياناتك', 'تُفرض الصلاحيات على الخادم، وتُخزَّن الصور والمرفقات في تخزين خاص لا يصل إليه إلا أصحاب الصلاحية.'],
    ['مشاركة البيانات', 'لا نبيع بياناتك. يطّلع عليها فقط الأساتذة والإدارة بحسب ما يلزم لدوراتك.'],
    ['حقوقك', 'يمكنك طلب تصحيح بياناتك أو أرشفتها بالتواصل مع إدارة المدرسة.'],
  ] },
  support: { title: 'الدعم', sections: [
    ['كيف أبدأ؟', 'أنشئ حساب طالب من صفحة التسجيل، ثم تصفّح الباقات وارفع إثبات الدفع من صفحة المدفوعات ليتم تفعيل اشتراكك.'],
    ['لم تصلني دعوة البريد', 'تحقق من مجلد الرسائل غير المرغوبة، ثم اطلب من الإدارة إعادة إرسال الدعوة من ملفك.'],
    ['مشكلة في الدفع', 'إذا رُفضت دفعتك فستجد السبب في صفحة المدفوعات؛ يمكنك رفع إثبات جديد.'],
    ['تواصل مع الإدارة', 'للمساعدة تواصل مع إدارة المدرسة عبر وسائل التواصل المعتمدة لديها.'],
  ] },
};
export function DocPage({ doc }: { doc: 'terms' | 'privacy' | 'support' }) {
  const d = DOCS[doc];
  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl px-4 py-12">
        <PageHeader title={d.title} />
        <div className="space-y-4">
          {d.sections.map(([h, t], i) => (
            <section key={h} className="rise rounded-2xl border border-card-border bg-card p-5" style={{ animationDelay: `${i * 70}ms` }}>
              <h2 className="font-extrabold">{h}</h2><p className="mt-1.5 text-sm leading-7 text-muted-foreground">{t}</p>
            </section>
          ))}
        </div>
      </div>
    </PublicLayout>
  );
}
