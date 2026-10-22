import { useMemo, useState } from 'react';
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Video } from 'lucide-react';
import { useListSchoolRecords } from '@workspace/api-client-react';
import type { SchoolRecord } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { ErrorState, ListSkeleton, PageHeader, StatusBadge } from '@/components/common';
import { RecordDialog } from '@/components/record-dialog';
import { useAccess, useLookups } from '@/hooks/use-school';
import { ENTITIES, errMsg } from '@/lib/school';

const WS = { weekStartsOn: 6 as const };

export default function SessionsPage() {
  const cfg = ENTITIES.sessions;
  const access = useAccess();
  const role = access.role;
  const list = useListSchoolRecords('sessions');
  const { lookup } = useLookups(cfg.related);
  const [mode, setMode] = useState<'week' | 'month'>('week');
  const [cursor, setCursor] = useState(new Date());
  const [editing, setEditing] = useState<SchoolRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [defaults, setDefaults] = useState<Record<string, unknown> | undefined>();
  const writable = access.canWrite(cfg);

  const days = useMemo(() => {
    const from = mode === 'week' ? startOfWeek(cursor, WS) : startOfWeek(startOfMonth(cursor), WS);
    const to = mode === 'week' ? endOfWeek(cursor, WS) : endOfWeek(endOfMonth(cursor), WS);
    const out: Date[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
    return out;
  }, [cursor, mode]);

  const byDay = (d: Date) => (list.data ?? []).filter((s) => s.status !== 'archived' && isSameDay(new Date(String(s.data.startsAt)), d))
    .sort((a, b) => String(a.data.startsAt).localeCompare(String(b.data.startsAt)));
  const step = (n: number) => setCursor((c) => (mode === 'week' ? addWeeks(c, n) : addMonths(c, n)));
  const edit = (s: SchoolRecord | null, day?: Date) => {
    setEditing(s);
    setDefaults(day ? { startsAt: format(new Date(day.setHours(17, 0, 0, 0)), "yyyy-MM-dd'T'HH:mm") } : undefined);
    setOpen(true);
  };
  const label = mode === 'week' ? `${format(days[0], 'd MMM', { locale: ar })} - ${format(days[days.length - 1], 'd MMM yyyy', { locale: ar })}` : format(cursor, 'MMMM yyyy', { locale: ar });

  return (
    <div>
      <PageHeader title="الحصص" hint="تقويم الحصص بالتواريخ الفعلية." actions={writable && <Button onClick={() => edit(null)} data-testid="button-add-sessions"><Plus className="ms-1 h-4 w-4" />إضافة حصة</Button>} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => step(-1)} aria-label="السابق" data-testid="button-prev"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => step(1)} aria-label="التالي" data-testid="button-next"><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())} data-testid="button-today">اليوم</Button>
          <span className="ms-2 font-extrabold" data-testid="text-range">{label}</span>
        </div>
        <div className="inline-flex rounded-xl bg-secondary p-1">
          {(['week', 'month'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} data-testid={`button-mode-${m}`} className={`rounded-lg px-4 py-1.5 text-sm font-bold transition-colors ${mode === m ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{m === 'week' ? 'أسبوعي' : 'شهري'}</button>
          ))}
        </div>
      </div>
      {list.isLoading ? <ListSkeleton /> : list.isError ? <ErrorState message={errMsg(list.error)} onRetry={() => list.refetch()} /> : (
        <>
          {!(list.data ?? []).some((s) => s.status !== 'archived') && <p className="mb-3 rounded-xl bg-secondary/70 px-4 py-3 text-sm text-secondary-foreground" data-testid="text-no-sessions">لا توجد حصص مجدولة بعد{writable ? '، أضف أول حصة من الزر أعلاه.' : '.'}</p>}
          <div className={mode === 'week' ? 'grid gap-3 md:grid-cols-7' : 'grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7'}>
            {days.map((d) => {
              const items = byDay(d);
              const today = isSameDay(d, new Date());
              const dim = mode === 'month' && !isSameMonth(d, cursor);
              return (
                <div key={d.toISOString()} data-testid={`day-${format(d, 'yyyy-MM-dd')}`}
                  className={`group flex ${mode === 'week' ? 'min-h-40' : 'min-h-28'} flex-col rounded-2xl border p-2 ${today ? 'border-primary bg-primary/5' : 'border-card-border bg-card'} ${dim ? 'opacity-45' : ''}`}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className={`font-bold ${today ? 'text-primary' : 'text-muted-foreground'}`}>{format(d, 'EEE d', { locale: ar })}</span>
                    {writable && <button onClick={() => edit(null, new Date(d))} className="rounded p-0.5 opacity-0 transition-opacity hover:bg-secondary group-hover:opacity-100 focus:opacity-100" aria-label="إضافة حصة"><Plus className="h-3.5 w-3.5" /></button>}
                  </div>
                  <div className="space-y-1">
                    {items.map((s) => (
                      <button key={s.id} onClick={() => edit(s)} data-testid={`session-${s.id}`}
                        className="w-full rounded-lg bg-gradient-to-l from-primary/15 to-secondary px-2 py-1.5 text-start text-xs transition-transform hover:-translate-y-0.5">
                        <span className="block font-bold text-secondary-foreground">{format(new Date(String(s.data.startsAt)), 'HH:mm')}</span>
                        <span className="line-clamp-1">{s.title}</span>
                        {s.status !== 'scheduled' && <StatusBadge status={s.status} />}
                        {typeof s.data.meetingUrl === 'string' && s.data.meetingUrl && <Video className="mt-0.5 h-3 w-3 text-primary" />}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      <RecordDialog cfg={cfg} open={open} onClose={() => setOpen(false)} record={editing} lookup={lookup} role={role} defaults={defaults} readOnly={!!editing && !writable} />
    </div>
  );
}
