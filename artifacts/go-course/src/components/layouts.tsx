import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth, useClerk } from '@clerk/react';
import {
  Bell, BookOpen, CalendarDays, ClipboardList, FileBarChart, FileCheck2, GraduationCap, Languages, Layers, LayoutDashboard,
  Library, LogOut, Menu, Presentation, Receipt, Repeat, Settings, ShieldAlert, Tags, UserCheck, UserPlus, Users, UsersRound, Wallet, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { getListSchoolRecordsQueryKey, useListSchoolRecords } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { SignInPrompt } from '@/components/common';
import { useMe, useAccess } from '@/hooks/use-school';
import { NAV } from '@/lib/school';
import type { Role } from '@/lib/school';

const base = import.meta.env.BASE_URL;
const ICONS: Record<string, LucideIcon> = {
  Bell, BookOpen, CalendarDays, ClipboardList, FileBarChart, FileCheck2, GraduationCap, Languages, Layers, LayoutDashboard,
  Library, Presentation, Receipt, Repeat, Settings, Tags, UserCheck, UserPlus, Users, UsersRound, Wallet,
};
const ROLE_LABEL: Record<Role, string> = { guest: 'زائر', admin: 'مدير', staff: 'موظف إدارة', teacher: 'أستاذ', student: 'طالب' };

export function LogoMark({ s = 40 }: { s?: number }) {
  return (
    <span
      className="inline-block shrink-0 rounded-xl bg-secondary"
      style={{ width: s, height: s, backgroundImage: `url(${base}logo-transparent.png)`, backgroundRepeat: 'no-repeat', backgroundSize: `${s * 2.8}px`, backgroundPosition: `${-0.9 * s}px ${-0.34 * s}px` }}
      role="img" aria-label="GO COURSE"
    />
  );
}

export function PublicLayout({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const [open, setOpen] = useState(false);
  const [loc] = useLocation();
  const links = [
    { href: '/languages', label: 'اللغات' }, { href: '/levels', label: 'المستويات' }, { href: '/courses', label: 'الدورات' },
    { href: '/plans', label: 'الباقات' }, { href: '/support', label: 'الدعم' },
  ];
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex items-center gap-2.5" data-testid="link-home">
            <LogoMark s={42} />
            <span className="text-lg font-extrabold tracking-wide">GO COURSE</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {links.map((l) => (
              <Link key={l.href} href={l.href} data-testid={`link-nav-${l.href.slice(1)}`}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors hover:bg-secondary ${loc.startsWith(l.href) ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground'}`}>{l.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {isSignedIn ? (
              <Link href="/dashboard" className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground" data-testid="link-dashboard">لوحة التحكم</Link>
            ) : (
              <>
                <Link href="/sign-in" className="hidden h-10 items-center rounded-xl px-4 text-sm font-semibold hover:bg-secondary sm:inline-flex" data-testid="link-sign-in">دخول</Link>
                <Link href="/sign-up" className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-md" data-testid="link-sign-up">ابدأ الآن</Link>
              </>
            )}
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(!open)} aria-label="القائمة" data-testid="button-menu">{open ? <X /> : <Menu />}</Button>
          </div>
        </div>
        {open && (
          <nav className="grid gap-1 border-t border-border bg-background px-4 py-3 md:hidden">
            {links.map((l) => <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-secondary">{l.label}</Link>)}
            {!isSignedIn && <Link href="/sign-in" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-semibold hover:bg-secondary">دخول</Link>}
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
      <footer className="mt-16 bg-sidebar text-sidebar-foreground">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5"><LogoMark s={44} /><span className="text-lg font-extrabold">GO COURSE</span></div>
            <p className="mt-3 max-w-sm text-sm opacity-80">لغة جديدة، حياة جديدة. مدرسة لغات تُدير تعلّمك اليومي من أول حصة حتى آخر مستوى.</p>
          </div>
          <div className="grid gap-2 text-sm">
            <span className="font-bold text-accent">المدرسة</span>
            {[['/languages', 'اللغات'], ['/levels', 'المستويات'], ['/courses', 'الدورات'], ['/plans', 'الباقات']].map(([h, l]) => <Link key={h} href={h} className="opacity-80 hover:opacity-100">{l}</Link>)}
          </div>
          <div className="grid gap-2 text-sm">
            <span className="font-bold text-accent">مساعدة</span>
            {[['/support', 'الدعم'], ['/terms', 'الشروط والأحكام'], ['/privacy', 'سياسة الخصوصية']].map(([h, l]) => <Link key={h} href={h} className="opacity-80 hover:opacity-100">{l}</Link>)}
          </div>
        </div>
        <div className="border-t border-sidebar-border py-4 text-center text-xs opacity-70">GO COURSE - جميع الحقوق محفوظة</div>
      </footer>
    </div>
  );
}

function NavList({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  const [loc] = useLocation();
  const { canRead } = useAccess();
  return (
    <nav className="space-y-5">
      {NAV.map((g) => {
        const items = g.items.filter((i) => i.roles.includes(role) && canRead(i.href.slice(1)));
        if (!items.length) return null;
        return (
          <div key={g.group}>
            <p className="mb-1.5 px-3 text-[11px] font-bold tracking-wider text-sidebar-foreground/50">{g.group}</p>
            <div className="space-y-0.5">
              {items.map((i) => {
                const Icon = ICONS[i.icon];
                const on = loc === i.href || loc.startsWith(i.href + '/');
                return (
                  <Link key={i.href} href={i.href} onClick={onNavigate} data-testid={`link-side-${i.href.slice(1)}`}
                    className={`group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${on ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'}`}>
                    {on && <span className="absolute inset-y-1.5 -end-0 w-1 rounded-full bg-accent" style={{ insetInlineStart: 0 }} />}
                    <Icon className={`h-[18px] w-[18px] ${on ? 'text-accent' : ''}`} />{i.label}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { me, role, isLoading } = useMe();
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const notes = useListSchoolRecords('notifications', { query: { enabled: !!isSignedIn, queryKey: getListSchoolRecordsQueryKey('notifications') } });
  const unread = (notes.data ?? []).filter((n) => !n.data.read && n.status !== 'archived').length;

  if (!isLoaded || (isSignedIn && isLoading)) {
    return <div className="grid min-h-[100dvh] place-items-center"><LogoMark s={72} /></div>;
  }
  if (!isSignedIn) {
    return <PublicLayout><div className="mx-auto max-w-2xl px-4 py-16"><SignInPrompt /></div></PublicLayout>;
  }

  const side = (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" className="mb-6 flex items-center gap-2.5 px-2">
        <LogoMark s={44} /><div><p className="text-base font-extrabold leading-tight text-sidebar-accent-foreground">GO COURSE</p><p className="text-[11px] text-sidebar-foreground/60">New language, new life</p></div>
      </Link>
      <div className="flex-1 overflow-y-auto pe-1"><NavList role={role} onNavigate={() => setOpen(false)} /></div>
    </div>
  );

  return (
    <div className="flex min-h-[100dvh]">
      <aside className="sticky top-0 hidden h-[100dvh] w-64 shrink-0 bg-sidebar p-4 lg:block">{side}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 bg-sidebar p-4 shadow-2xl">{side}</aside>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <header className="app-top sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border/70 bg-background/85 px-4 backdrop-blur-md">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة" data-testid="button-open-sidebar"><Menu /></Button>
          <div className="hidden text-sm text-muted-foreground lg:block">أهلًا، <span className="font-bold text-foreground" data-testid="text-user-name">{me?.name}</span></div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground sm:inline" data-testid="text-user-role">{ROLE_LABEL[role]}</span>
            <Link href="/notifications" className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-secondary" aria-label="الإشعارات" data-testid="link-notifications">
              <Bell className="h-5 w-5" />
              {unread > 0 && <span className="absolute -top-0.5 -end-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground" data-testid="badge-unread">{unread}</span>}
            </Link>
            <Button variant="outline" size="sm" onClick={() => signOut({ redirectUrl: base || '/' })} data-testid="button-sign-out"><LogOut className="ms-1.5 h-4 w-4" />خروج</Button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">
          {me && !me.adminConfigured && (
            <div className="rise mb-5 flex gap-3 rounded-2xl border border-accent/60 bg-accent/20 p-4" data-testid="banner-admin-setup">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[hsl(30_70%_30%)]" />
              <div className="text-sm">
                <p className="font-bold">لم يتم إعداد مالك المدرسة بعد</p>
                <p className="mt-0.5 text-muted-foreground">يجب على مالك المدرسة ضبط بريده الإلكتروني في إعدادات الخادم (OWNER_EMAIL) ثم تسجيل الدخول به ليحصل على صلاحيات الإدارة. إلى ذلك الحين تعمل الحسابات الجديدة بصلاحيات الطالب.</p>
              </div>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
