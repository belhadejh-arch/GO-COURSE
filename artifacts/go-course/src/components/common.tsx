import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { Inbox, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { STATUS_LABEL } from '@/lib/school';

export function PageHeader({ title, hint, actions }: { title: string; hint?: string; actions?: ReactNode }) {
  return (
    <div className="rise mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="mb-2 h-1.5 w-12 rounded-full bg-gradient-to-l from-accent via-[hsl(var(--chart-4))] to-primary" />
        <h1 className="text-2xl font-extrabold sm:text-3xl" data-testid="text-page-title">{title}</h1>
        {hint && <p className="mt-1 text-sm text-muted-foreground">{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONE: Record<string, string> = {
  active: 'bg-primary/12 text-primary', published: 'bg-primary/12 text-primary', confirmed: 'bg-primary/12 text-primary',
  graded: 'bg-primary/12 text-primary', completed: 'bg-primary/12 text-primary', issued: 'bg-primary/12 text-primary',
  present: 'bg-primary/12 text-primary', recorded: 'bg-primary/12 text-primary',
  invited: 'bg-accent/30 text-[hsl(30_70%_25%)]', pending: 'bg-accent/30 text-[hsl(30_70%_25%)]', draft: 'bg-accent/30 text-[hsl(30_70%_25%)]', submitted: 'bg-accent/30 text-[hsl(30_70%_25%)]',
  scheduled: 'bg-accent/30 text-[hsl(30_70%_25%)]', late: 'bg-accent/30 text-[hsl(30_70%_25%)]', paused: 'bg-accent/30 text-[hsl(30_70%_25%)]',
  rejected: 'bg-destructive/12 text-destructive', cancelled: 'bg-destructive/12 text-destructive', absent: 'bg-destructive/12 text-destructive',
  disabled: 'bg-destructive/12 text-destructive', expired: 'bg-destructive/12 text-destructive', void: 'bg-destructive/12 text-destructive',
};
const EXTRA: Record<string, string> = { present: 'حاضر', absent: 'غائب', late: 'متأخر', excused: 'بعذر' };

export function StatusBadge({ status }: { status: string }) {
  return (
    <span data-testid={`status-${status}`} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[status] ?? 'bg-secondary text-secondary-foreground'}`}>
      {STATUS_LABEL[status] ?? EXTRA[status] ?? status}
    </span>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-input bg-card/60 px-6 py-14 text-center" data-testid="state-empty">
      <div className="relative mb-4">
        <div className="absolute -inset-3 rounded-full bg-secondary" />
        <Inbox className="relative h-8 w-8 text-primary" />
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      {hint && <p className="mt-1 max-w-md text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center" data-testid="state-error">
      <AlertTriangle className="mb-3 h-8 w-8 text-destructive" />
      <p className="font-semibold">تعذّر تحميل البيانات</p>
      {message && <p className="mt-1 text-sm text-muted-foreground">{message}</p>}
      {onRetry && <Button variant="outline" className="mt-4" onClick={onRetry} data-testid="button-retry">إعادة المحاولة</Button>}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" data-testid="state-loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
    </div>
  );
}

export function SignInPrompt({ text = 'سجّل الدخول للوصول إلى هذه الصفحة.' }: { text?: string }) {
  return (
    <EmptyState
      title="يلزم تسجيل الدخول"
      hint={text}
      action={<Link href="/sign-in" className="inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground" data-testid="link-signin-prompt">تسجيل الدخول</Link>}
    />
  );
}
