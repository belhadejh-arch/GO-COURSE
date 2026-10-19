import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowLeft, BookOpenCheck, CalendarCheck, ClipboardCheck, Presentation, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { useListSchoolRecords } from '@workspace/api-client-react';
import { PublicLayout } from '@/components/layouts';
import { LEVELS } from '@/lib/school';
import { ErrorState, ListSkeleton } from '@/components/common';

const base = import.meta.env.BASE_URL;
const chips = [
  { t: 'Hello', c: 'bg-primary text-primary-foreground', pos: 'top-6 start-2', r: '-6deg' },
  { t: 'مرحبا', c: 'bg-accent text-accent-foreground', pos: 'top-28 end-0', r: '5deg' },
  { t: 'Bonjour', c: 'bg-[hsl(var(--chart-4))] text-destructive-foreground', pos: 'bottom-24 start-0', r: '4deg' },
  { t: 'Hola', c: 'bg-[hsl(var(--chart-2))] text-primary-foreground', pos: 'bottom-6 end-6', r: '-5deg' },
];
const levelTint = ['bg-secondary', 'bg-primary/15', 'bg-accent/35', 'bg-[hsl(var(--chart-2)/0.3)]', 'bg-[hsl(var(--chart-4)/0.2)]', 'bg-primary text-primary-foreground'];

export default function Landing() {
  const langs = useListSchoolRecords('languages');
  const shown = (langs.data ?? []).filter((l) => l.status !== 'archived' && l.status !== 'inactive');
  return (
    <PublicLayout>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 md:grid-cols-[1.1fr_0.9fr] md:pt-20">
          <div>
            <motion.span initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full bg-secondary px-4 py-1.5 text-xs font-bold text-secondary-foreground">
              <Sparkles className="h-3.5 w-3.5 text-accent-foreground" /> لغة جديدة، حياة جديدة
            </motion.span>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-5 text-4xl font-extrabold leading-[1.25] sm:text-6xl">
              لغتك القادمة <span className="relative inline-block text-primary">أقرب<span className="absolute inset-x-0 -bottom-1 h-3 -skew-x-12 rounded bg-accent/60 -z-10" /></span> مما تتخيل
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }} className="mt-5 max-w-xl text-lg text-muted-foreground">
              مدرسة GO COURSE تجمع حصصك ودروسك وواجباتك واشتراكك في مكان واحد، لتعرف كل صباح ما الذي ينتظرك اليوم وإلى أين وصلت في طريقك من A1 إلى C2.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className="mt-8 flex flex-wrap gap-3">
              <Link href="/courses" className="inline-flex h-12 items-center gap-2 rounded-2xl bg-primary px-6 font-bold text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5" data-testid="link-hero-courses">استعرض الدورات <ArrowLeft className="h-4 w-4" /></Link>
              <Link href="/sign-in" className="inline-flex h-12 items-center rounded-2xl border border-input bg-card px-6 font-bold transition-colors hover:bg-secondary" data-testid="link-hero-signup">تسجيل الدخول</Link>
            </motion.div>
          </div>
          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.12, duration: 0.6 }} className="relative mx-auto aspect-square w-full max-w-md">
            <div className="absolute inset-4 rounded-[2.5rem] bg-gradient-to-br from-secondary via-card to-accent/30 rotate-3" />
            <div className="absolute inset-4 -rotate-3 rounded-[2.5rem] border border-card-border bg-card/70 shadow-xl" />
            <img src={`${base}logo-transparent.png`} alt="شعار GO COURSE" className="relative h-full w-full object-contain" data-testid="img-hero-logo" />
            {chips.map((c) => (
              <span key={c.t} style={{ ['--r' as string]: c.r }} className={`floaty absolute ${c.pos} rounded-2xl px-4 py-2 text-sm font-bold shadow-lg ${c.c}`}>{c.t}</span>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="mb-6 flex items-end justify-between">
          <div><h2 className="text-2xl font-extrabold sm:text-3xl">اللغات المتاحة</h2><p className="mt-1 text-sm text-muted-foreground">تُحدَّث القائمة مباشرة من كتالوج المدرسة.</p></div>
          <Link href="/languages" className="text-sm font-bold text-primary hover:underline" data-testid="link-all-languages">عرض الكل</Link>
        </div>
        {langs.isLoading ? <ListSkeleton rows={2} /> : langs.isError ? (
          <ErrorState message="تعذّر الاتصال بكتالوج المدرسة. تحقق من إعداد BACKEND_URL في Vercel ومن تشغيل خدمة Render." onRetry={() => langs.refetch()} />
        ) : shown.length ? (
          <div className="flex flex-wrap gap-3">
            {shown.map((l, i) => (
              <motion.div key={l.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: (i % 8) * 0.04 }}
                className="flex items-center gap-2 rounded-2xl border border-card-border bg-card px-4 py-2.5 shadow-sm" data-testid={`chip-language-${l.id}`}>
                <span className="grid h-7 min-w-7 place-items-center rounded-lg bg-secondary px-1 text-[11px] font-extrabold uppercase text-secondary-foreground">{String(l.data.code ?? '').slice(0, 3) || '•'}</span>
                <span className="font-bold">{l.title}</span>
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-input bg-card/60 p-6 text-center text-sm text-muted-foreground" data-testid="text-no-languages">ستظهر اللغات هنا فور إضافتها من لوحة الإدارة.</p>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="text-2xl font-extrabold sm:text-3xl">سلّم واضح من البداية للإتقان</h2>
        <p className="mt-1 text-sm text-muted-foreground">ستة مستويات وفق الإطار الأوروبي المرجعي، وكل دورة تعرف أين تضعك.</p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-6">
          {LEVELS.map((l, i) => (
            <motion.div key={l} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
              style={{ marginTop: `${(5 - i) * 6}px` }} className={`rounded-2xl p-4 shadow-sm ${levelTint[i]}`}>
              <p className="text-3xl font-extrabold">{l}</p>
              <p className="mt-1 text-xs opacity-80">{['مبتدئ', 'أساسي', 'متوسط', 'فوق المتوسط', 'متقدم', 'إتقان'][i]}</p>
            </motion.div>
          ))}
        </div>
        <Link href="/levels" className="mt-6 inline-block text-sm font-bold text-primary hover:underline" data-testid="link-levels">تفاصيل المستويات لكل لغة</Link>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="mb-8 text-2xl font-extrabold sm:text-3xl">كل شخص في المدرسة له مكانه</h2>
        <div className="grid gap-4 md:grid-cols-6">
          <div className="rounded-3xl bg-sidebar p-7 text-sidebar-foreground md:col-span-3">
            <ShieldCheck className="h-8 w-8 text-accent" />
            <h3 className="mt-4 text-xl font-extrabold text-sidebar-accent-foreground">للإدارة</h3>
            <p className="mt-2 text-sm opacity-85">الطلاب والأساتذة والتسجيلات والباقات والمدفوعات والفواتير والتقارير في لوحة واحدة، مع صلاحيات تفرضها الخوادم لا الواجهة فقط.</p>
          </div>
          <div className="rounded-3xl bg-primary p-7 text-primary-foreground md:col-span-3">
            <Presentation className="h-8 w-8" />
            <h3 className="mt-4 text-xl font-extrabold">للأستاذ</h3>
            <p className="mt-2 text-sm opacity-90">جدول الحصص، تسجيل الحضور، نشر الدروس والواجبات وتصحيح التسليمات لدوراتك فقط.</p>
          </div>
          <div className="rounded-3xl bg-accent/40 p-7 md:col-span-2"><CalendarCheck className="h-7 w-7" /><h3 className="mt-3 font-extrabold">حصصك القادمة</h3><p className="mt-1 text-sm text-muted-foreground">تقويم أسبوعي وشهري برابط الحصة.</p></div>
          <div className="rounded-3xl bg-secondary p-7 md:col-span-2"><ClipboardCheck className="h-7 w-7 text-primary" /><h3 className="mt-3 font-extrabold">واجبات وتقييم</h3><p className="mt-1 text-sm text-muted-foreground">سلّم إجاباتك وتابع درجاتك وملاحظات الأستاذ.</p></div>
          <div className="rounded-3xl bg-[hsl(var(--chart-4)/0.15)] p-7 md:col-span-2"><Wallet className="h-7 w-7 text-destructive" /><h3 className="mt-3 font-extrabold">دفع يدوي شفاف</h3><p className="mt-1 text-sm text-muted-foreground">ارفع إثبات التحويل وتابع تأكيده وفاتورتك.</p></div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-l from-primary to-[hsl(var(--chart-2))] p-8 text-primary-foreground sm:p-12">
          <BookOpenCheck className="absolute -start-6 -bottom-6 h-44 w-44 opacity-15" />
          <h2 className="max-w-lg text-3xl font-extrabold">ابدأ بدورتك الأولى اليوم</h2>
          <p className="mt-2 max-w-lg opacity-90">تصفّح الباقات، ثم استخدم بيانات الدخول التي تسلّمها لك إدارة المدرسة.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/sign-up" className="inline-flex h-11 items-center rounded-xl bg-accent px-6 font-bold text-accent-foreground" data-testid="link-cta-signup">إنشاء حساب</Link>
            <Link href="/plans" className="inline-flex h-11 items-center rounded-xl bg-white/15 px-6 font-bold" data-testid="link-cta-plans">الباقات</Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
