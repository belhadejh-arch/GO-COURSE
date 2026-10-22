import { Link, useParams } from 'wouter';
import { motion } from 'framer-motion';
import { CalendarDays, Clock, Languages as LangIcon, Users } from 'lucide-react';
import { getGetSchoolRecordQueryKey, useGetSchoolRecord, useListSchoolRecords } from '@workspace/api-client-react';
import type { SchoolRecord } from '@workspace/api-client-react';
import { PublicLayout } from '@/components/layouts';
import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '@/components/common';
import { DAYS, errMsg, fmtDate, fmtMoney, nums, str } from '@/lib/school';

const live = (r: SchoolRecord) => r.status !== 'archived' && r.status !== 'inactive' && r.status !== 'draft';
const TITLES: Record<string, [string, string]> = {
  languages: ['اللغات', 'اللغات التي نُدرّسها في GO COURSE.'],
  levels: ['المستويات', 'مستويات كل لغة من A1 إلى C2.'],
  courses: ['الدورات', 'الدورات المفتوحة في المدرسة.'],
  plans: ['الباقات', 'باقات الاشتراك والدورات التي تشملها.'],
};

export function Catalog({ entity }: { entity: 'languages' | 'levels' | 'courses' | 'plans' }) {
  const main = useListSchoolRecords(entity);
  const langs = useListSchoolRecords('languages');
  const courses = useListSchoolRecords('courses');
  const lname = (id: unknown) => langs.data?.find((l) => l.id === Number(id))?.title ?? '';
  const rows = (main.data ?? []).filter(live);
  const [title, hint] = TITLES[entity];

  let body;
  if (main.isLoading) body = <ListSkeleton rows={4} />;
  else if (main.isError) body = <ErrorState message={errMsg(main.error)} onRetry={() => main.refetch()} />;
  else if (!rows.length) body = <EmptyState title={`لا توجد ${title} منشورة بعد`} hint="تتم إضافة المحتوى من إدارة المدرسة، عُد قريبًا." />;
  else if (entity === 'languages') {
    body = (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((l, i) => {
          const n = (courses.data ?? []).filter((c) => live(c) && Number(c.data.languageId) === l.id).length;
          return (
            <motion.div key={l.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="rounded-2xl border border-card-border bg-card p-5 shadow-sm" data-testid={`card-language-${l.id}`}>
              <div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-secondary text-sm font-extrabold uppercase text-secondary-foreground">{str(l.data.code).slice(0, 3) || <LangIcon className="h-5 w-5" />}</span><span className="text-xs text-muted-foreground">{n} دورة</span></div>
              <h3 className="mt-4 text-xl font-extrabold">{l.title}</h3>
              <Link href="/courses" className="mt-3 inline-block text-sm font-bold text-primary hover:underline">دورات {l.title}</Link>
            </motion.div>
          );
        })}
      </div>
    );
  } else if (entity === 'levels') {
    const groups = new Map<number, SchoolRecord[]>();
    rows.forEach((r) => { const k = Number(r.data.languageId); groups.set(k, [...(groups.get(k) ?? []), r]); });
    body = (
      <div className="space-y-3">
        {Array.from(groups.entries()).map(([lid, items]) => (
          <div key={lid} className="flex flex-wrap items-center gap-3 rounded-2xl border border-card-border bg-card p-4" data-testid={`group-levels-${lid}`}>
            <span className="min-w-28 font-extrabold">{lname(lid) || 'لغة'}</span>
            {items.sort((a, b) => a.title.localeCompare(b.title)).map((lv) => <span key={lv.id} className="rounded-xl bg-secondary px-3 py-1 text-sm font-bold text-secondary-foreground">{lv.title}</span>)}
          </div>
        ))}
      </div>
    );
  } else if (entity === 'courses') {
    body = (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((c, i) => (
          <motion.div key={c.id} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
            <Link href={`/courses/${c.id}`} className="block h-full rounded-2xl border border-card-border bg-card p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg" data-testid={`card-course-${c.id}`}>
              <div className="flex gap-2 text-xs font-bold">
                {lname(c.data.languageId) && <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-primary">{lname(c.data.languageId)}</span>}
                {c.data.level != null && <span className="rounded-full bg-accent/35 px-2.5 py-0.5">{str(c.data.level)}</span>}
              </div>
              <h3 className="mt-3 text-lg font-extrabold">{c.title}</h3>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{str(c.data.description)}</p>
              <p className="mt-3 text-xs text-muted-foreground">{nums(c.data.days).map((d) => DAYS[d]).join('، ')}</p>
            </Link>
          </motion.div>
        ))}
      </div>
    );
  } else {
    body = (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((p) => (
          <div key={p.id} className="flex flex-col rounded-2xl border border-card-border bg-card p-6 shadow-sm" data-testid={`card-plan-${p.id}`}>
            <h3 className="text-lg font-extrabold">{p.title}</h3>
            <p className="mt-3 text-3xl font-extrabold text-primary">{fmtMoney(p.data.amount, p.data.currency) || '—'}</p>
            {p.data.durationDays != null && <p className="mt-1 text-sm text-muted-foreground">لمدة {str(p.data.durationDays)} يومًا</p>}
            <ul className="mt-4 flex-1 space-y-1.5 text-sm">
              {nums(p.data.courseIds).map((id) => <li key={id} className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-accent" />{courses.data?.find((c) => c.id === id)?.title ?? 'دورة'}</li>)}
            </ul>
            <Link href="/sign-up" className="mt-5 inline-flex h-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground" data-testid={`link-subscribe-${p.id}`}>اشترك الآن</Link>
          </div>
        ))}
      </div>
    );
  }
  return <PublicLayout><div className="mx-auto max-w-6xl px-4 py-10"><PageHeader title={title} hint={hint} />{body}</div></PublicLayout>;
}

export function CourseDetail() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const q = useGetSchoolRecord('courses', id, { query: { enabled: !Number.isNaN(id), queryKey: getGetSchoolRecordQueryKey('courses', id) } });
  const langs = useListSchoolRecords('languages');
  const teachers = useListSchoolRecords('teachers');
  const plans = useListSchoolRecords('plans');
  const c = q.data;
  const d = c?.data ?? {};
  const typeLabel: Record<string, string> = { level: 'دورة مستوى', conversation: 'دورة محادثة', exam: 'تحضير اختبار' };
  const tnames = nums(d.teacherIds).map((t) => teachers.data?.find((x) => x.id === t)?.title).filter(Boolean);
  const inPlans = (plans.data ?? []).filter((p) => live(p) && (nums(p.data.courseIds).includes(id) || Number(d.planId) === p.id));
  const facts: [string, string][] = c ? [
    ['اللغة', langs.data?.find((l) => l.id === Number(d.languageId))?.title ?? ''],
    ['النوع', typeLabel[str(d.courseType)] ?? ''], ['المستوى', str(d.level)], ['الاختبار', str(d.examName)], ['الدرجة المستهدفة', str(d.targetScore)],
    ['النظام', d.studySystem === 'intensive' ? 'مكثّف' : d.studySystem === 'regular' ? 'عادي' : ''],
    ['الحصص الأسبوعية', str(d.weeklySessions)], ['إجمالي الحصص', str(d.totalSessions)], ['مدة الحصة', d.durationMinutes ? `${str(d.durationMinutes)} دقيقة` : ''],
    ['الأيام', nums(d.days).map((x) => DAYS[x]).join('، ')], ['الوقت', str(d.time)], ['تبدأ في', fmtDate(d.startDate)], ['تنتهي في', fmtDate(d.endDate)], ['موعد الاختبار', fmtDate(d.examDate)],
  ].filter((f) => f[1]) as [string, string][] : [];
  return (
    <PublicLayout>
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Link href="/courses" className="text-sm font-bold text-primary hover:underline" data-testid="link-back-courses">الرجوع إلى الدورات</Link>
        {q.isLoading ? <div className="mt-6"><ListSkeleton rows={4} /></div> : q.isError || !c ? (
          <div className="mt-6"><ErrorState message={q.error ? errMsg(q.error) : 'الدورة غير موجودة'} onRetry={() => q.refetch()} /></div>
        ) : (
          <div className="mt-4 grid gap-6 md:grid-cols-[1.5fr_1fr]">
            <div className="rise">
              <h1 className="text-3xl font-extrabold sm:text-4xl" data-testid="text-course-title">{c.title}</h1>
              {str(d.description) && <p className="mt-4 whitespace-pre-line text-muted-foreground">{str(d.description)}</p>}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {facts.map(([k, v]) => <div key={k} className="rounded-xl border border-card-border bg-card p-3"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-0.5 font-bold">{v}</p></div>)}
              </div>
              {tnames.length > 0 && <p className="mt-5 flex items-center gap-2 text-sm"><Users className="h-4 w-4 text-primary" />الأساتذة: <b>{tnames.join('، ')}</b></p>}
            </div>
            <aside className="h-fit space-y-3 rounded-3xl bg-sidebar p-6 text-sidebar-foreground">
              <h2 className="text-lg font-extrabold text-sidebar-accent-foreground">الاشتراك</h2>
              {inPlans.length ? inPlans.map((p) => (
                <div key={p.id} className="rounded-xl bg-sidebar-accent p-3"><p className="font-bold">{p.title}</p><p className="text-accent">{fmtMoney(p.data.amount, p.data.currency)}</p></div>
              )) : <p className="text-sm opacity-80">لم تُربط باقة بهذه الدورة بعد. تواصل مع الإدارة.</p>}
              <Link href="/sign-up" className="flex h-11 items-center justify-center rounded-xl bg-accent font-bold text-accent-foreground" data-testid="link-enroll">سجّل في الدورة</Link>
              <div className="flex gap-4 text-xs opacity-70"><span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{nums(d.days).length || '—'} أيام</span><span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{str(d.time) || '—'}</span></div>
            </aside>
          </div>
        )}
      </div>
    </PublicLayout>
  );
}

export const catalogEntities = Object.keys(TITLES);
