import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Activity, CalendarClock, GraduationCap, Users, Wallet, Repeat, Presentation, ClipboardList, FileCheck2 } from 'lucide-react';
import { useGetSchoolSummary, useListSchoolRecords } from '@workspace/api-client-react';
import type { SchoolRecord } from '@workspace/api-client-react';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StatusBadge } from '@/components/common';
import { Skeleton } from '@/components/ui/skeleton';
import { useMe } from '@/hooks/use-school';
import { errMsg, fmtDateTime, fmtMoney } from '@/lib/school';

function Stat({ icon, label, value, tint, i, loading }: { icon: ReactNode; label: string; value: ReactNode; tint: string; i: number; loading?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="relative overflow-hidden rounded-2xl border border-card-border bg-card p-5 shadow-sm">
      <div className={`absolute -start-6 -top-6 h-20 w-20 rounded-full opacity-60 ${tint}`} />
      <div className="relative">
        <span className={`inline-grid h-10 w-10 place-items-center rounded-xl ${tint}`}>{icon}</span>
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
        {loading ? <Skeleton className="mt-1 h-8 w-20" /> : <p className="text-3xl font-extrabold" data-testid={`stat-${label}`}>{value}</p>}
      </div>
    </motion.div>
  );
}

function Panel({ title, children, href, linkLabel }: { title: string; children: ReactNode; href?: string; linkLabel?: string }) {
  return (
    <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between"><h2 className="font-extrabold">{title}</h2>{href && <Link href={href} className="text-xs font-bold text-primary hover:underline">{linkLabel ?? 'عرض الكل'}</Link>}</div>
      {children}
    </section>
  );
}

function SessionList({ items, loading }: { items: SchoolRecord[]; loading?: boolean }) {
  if (loading) return <ListSkeleton rows={3} />;
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground" data-testid="text-no-sessions">لا توجد حصص قادمة مجدولة.</p>;
  return (
    <ul className="space-y-2">
      {items.slice(0, 6).map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 px-3 py-2.5" data-testid={`item-session-${s.id}`}>
          <div><p className="text-sm font-bold">{s.title}</p><p className="text-xs text-muted-foreground">{fmtDateTime(s.data.startsAt)}</p></div>
          {typeof s.data.meetingUrl === 'string' && s.data.meetingUrl && <a href={s.data.meetingUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">انضم</a>}
        </li>
      ))}
    </ul>
  );
}

const upcoming = (list: SchoolRecord[]) => list.filter((s) => s.status !== 'archived' && s.status !== 'cancelled' && new Date(String(s.data.startsAt)).getTime() >= Date.now() - 3600_000).sort((a, b) => String(a.data.startsAt).localeCompare(String(b.data.startsAt)));

function StaffDashboard() {
  const q = useGetSchoolSummary();
  const s = q.data;
  const max = Math.max(1, ...(s?.languageCounts.map((l) => l.count) ?? [1]));
  if (q.isError) return <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} />;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat i={0} loading={q.isLoading} label="الطلاب" value={s?.students} tint="bg-primary/15 text-primary" icon={<Users className="h-5 w-5" />} />
        <Stat i={1} loading={q.isLoading} label="الأساتذة" value={s?.teachers} tint="bg-[hsl(var(--chart-2)/0.25)] text-secondary-foreground" icon={<Presentation className="h-5 w-5" />} />
        <Stat i={2} loading={q.isLoading} label="الدورات" value={s?.courses} tint="bg-accent/35 text-accent-foreground" icon={<GraduationCap className="h-5 w-5" />} />
        <Stat i={3} loading={q.isLoading} label="اشتراكات نشطة" value={s?.activeSubscriptions} tint="bg-[hsl(var(--chart-4)/0.2)] text-destructive" icon={<Repeat className="h-5 w-5" />} />
        <Stat i={4} loading={q.isLoading} label="الإيرادات" value={s ? fmtMoney(s.revenue, s.currency) : ''} tint="bg-primary/15 text-primary" icon={<Wallet className="h-5 w-5" />} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Panel title="الحصص القادمة" href="/sessions"><SessionList items={s?.upcomingSessions ?? []} loading={q.isLoading} /></Panel>
        <Panel title="الطلاب حسب اللغة">
          {q.isLoading ? <ListSkeleton rows={3} /> : s?.languageCounts.length ? (
            <ul className="space-y-3">
              {s.languageCounts.map((l, i) => (
                <li key={l.name} data-testid={`bar-language-${i}`}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{l.name}</span><span className="text-muted-foreground">{l.count}</span></div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-secondary"><motion.div initial={{ width: 0 }} animate={{ width: `${(l.count / max) * 100}%` }} transition={{ duration: 0.8 }} className="h-full rounded-full bg-gradient-to-l from-primary to-[hsl(var(--chart-2))]" /></div>
                </li>
              ))}
            </ul>
          ) : <p className="py-6 text-center text-sm text-muted-foreground">لم يُسجَّل طلاب في لغات بعد.</p>}
        </Panel>
      </div>
      <div className="mt-4">
        <Panel title="آخر النشاطات" href="/reports" linkLabel="التقارير">
          {q.isLoading ? <ListSkeleton rows={3} /> : s?.activity.length ? (
            <ul className="divide-y divide-border">
              {s.activity.slice(0, 8).map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm" data-testid={`item-activity-${a.id}`}>
                  <Activity className="h-4 w-4 text-primary" /><span className="flex-1 font-semibold">{a.title}</span><span className="text-xs text-muted-foreground">{fmtDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="py-6 text-center text-sm text-muted-foreground">ستظهر هنا عمليات المدرسة فور حدوثها.</p>}
        </Panel>
      </div>
    </>
  );
}

function TeacherDashboard() {
  const courses = useListSchoolRecords('courses');
  const sessions = useListSchoolRecords('sessions');
  const subs = useListSchoolRecords('submissions');
  const asg = useListSchoolRecords('assignments');
  const pending = (subs.data ?? []).filter((x) => x.status === 'submitted').length;
  const live = (l?: SchoolRecord[]) => (l ?? []).filter((x) => x.status !== 'archived').length;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat i={0} loading={courses.isLoading} label="دوراتي" value={live(courses.data)} tint="bg-primary/15 text-primary" icon={<GraduationCap className="h-5 w-5" />} />
        <Stat i={1} loading={sessions.isLoading} label="حصص قادمة" value={upcoming(sessions.data ?? []).length} tint="bg-accent/35 text-accent-foreground" icon={<CalendarClock className="h-5 w-5" />} />
        <Stat i={2} loading={asg.isLoading} label="الواجبات" value={live(asg.data)} tint="bg-[hsl(var(--chart-2)/0.25)] text-secondary-foreground" icon={<ClipboardList className="h-5 w-5" />} />
        <Stat i={3} loading={subs.isLoading} label="بانتظار التصحيح" value={pending} tint="bg-[hsl(var(--chart-4)/0.2)] text-destructive" icon={<FileCheck2 className="h-5 w-5" />} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="حصصي القادمة" href="/sessions"><SessionList items={upcoming(sessions.data ?? [])} loading={sessions.isLoading} /></Panel>
        <Panel title="تسليمات تحتاج تصحيحًا" href="/submissions">
          {(subs.data ?? []).filter((x) => x.status === 'submitted').length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">لا توجد تسليمات معلّقة.</p> : (
            <ul className="space-y-2">{(subs.data ?? []).filter((x) => x.status === 'submitted').slice(0, 6).map((x) => <li key={x.id} className="rounded-xl bg-muted/60 px-3 py-2.5 text-sm font-semibold">{x.title}</li>)}</ul>
          )}
        </Panel>
      </div>
    </>
  );
}

function StudentDashboard() {
  const sessions = useListSchoolRecords('sessions');
  const asg = useListSchoolRecords('assignments');
  const subs = useListSchoolRecords('subscriptions');
  const pays = useListSchoolRecords('payments');
  const lessons = useListSchoolRecords('lessons');
  const progress = useListSchoolRecords('progress');
  const totalL = (lessons.data ?? []).filter((l) => l.status === 'published').length;
  const doneL = new Set((progress.data ?? []).map((p) => Number(p.data.lessonId))).size;
  const pct = totalL ? Math.min(100, Math.round((doneL / totalL) * 100)) : 0;
  const activeSub = (subs.data ?? []).find((s) => s.status === 'active');
  const openAsg = (asg.data ?? []).filter((a) => a.status === 'published');
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat i={0} loading={sessions.isLoading} label="حصص قادمة" value={upcoming(sessions.data ?? []).length} tint="bg-primary/15 text-primary" icon={<CalendarClock className="h-5 w-5" />} />
        <Stat i={1} loading={asg.isLoading} label="واجبات منشورة" value={openAsg.length} tint="bg-accent/35 text-accent-foreground" icon={<ClipboardList className="h-5 w-5" />} />
        <Stat i={2} loading={subs.isLoading} label="اشتراكات نشطة" value={(subs.data ?? []).filter((s) => s.status === 'active').length} tint="bg-[hsl(var(--chart-2)/0.25)] text-secondary-foreground" icon={<Repeat className="h-5 w-5" />} />
        <Stat i={3} loading={pays.isLoading} label="دفعات قيد المراجعة" value={(pays.data ?? []).filter((p) => p.status === 'pending').length} tint="bg-[hsl(var(--chart-4)/0.2)] text-destructive" icon={<Wallet className="h-5 w-5" />} />
      </div>
      <div className="mt-6 rounded-2xl border border-card-border bg-card p-5 shadow-sm" data-testid="progress-card">
        <div className="mb-2 flex items-center justify-between"><p className="font-bold">تقدّمي في الدروس</p><Link href="/lessons" className="text-xs font-bold text-primary hover:underline">الدروس</Link></div>
        {lessons.isLoading || progress.isLoading ? <div className="h-3 animate-pulse rounded-full bg-muted" /> : (
          <>
            <div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
            <p className="mt-2 text-xs text-muted-foreground">{doneL} من {totalL} دروس مكتملة ({pct}%)</p>
          </>
        )}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="حصصي القادمة" href="/sessions"><SessionList items={upcoming(sessions.data ?? [])} loading={sessions.isLoading} /></Panel>
        <Panel title="اشتراكي" href="/subscriptions">
          {activeSub ? <div className="flex items-center justify-between rounded-xl bg-primary/10 p-4"><div><p className="font-bold">{activeSub.title}</p><p className="text-xs text-muted-foreground">ينتهي: {fmtDateTime(activeSub.data.endDate)}</p></div><StatusBadge status="active" /></div> : (
            <EmptyState title="لا يوجد اشتراك نشط" hint="اختر باقة وارفع إثبات الدفع لتفعيل اشتراكك." action={<Link href="/plans" className="inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground" data-testid="link-view-plans">عرض الباقات</Link>} />
          )}
        </Panel>
      </div>
    </>
  );
}

export default function Dashboard() {
  const { role, me } = useMe();
  const hints: Record<string, string> = { admin: 'نظرة شاملة على المدرسة اليوم.', staff: 'نظرة شاملة على المدرسة اليوم.', teacher: 'حصصك وواجباتك وتسليمات طلابك.', student: 'رحلتك التعليمية في مكان واحد.' };
  return (
    <div>
      <PageHeader title={`مرحبًا ${me?.name ?? ''}`} hint={hints[role]} />
      {role === 'teacher' ? <TeacherDashboard /> : role === 'student' ? <StudentDashboard /> : <StaffDashboard />}
    </div>
  );
}
