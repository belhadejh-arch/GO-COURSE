import { useMemo, useState } from 'react';
import { Link, useSearch } from 'wouter';
import { Archive, ChevronLeft, ChevronRight, ClipboardCopy, ExternalLink, KeyRound, Eye, FileText, Pencil, Plus, Printer, Search } from 'lucide-react';
import { getListSchoolRecordsQueryKey, useArchiveSchoolRecord, useCreateSchoolRecord, useListSchoolRecords, useResetSchoolPassword, useUpdateSchoolRecord } from '@workspace/api-client-react';
import type { SchoolRecord } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StatusBadge } from '@/components/common';
import { RecordDialog } from '@/components/record-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAccess, useInvalidateSchool, useLookups } from '@/hooks/use-school';
import { DAYS, ENTITIES, LEVELS, errMsg, fileUrl, fmtDate, fmtDateTime, fmtMoney, nums, str } from '@/lib/school';
import type { Column, Lookup } from '@/lib/school';

function Cell({ col, r, lookup }: { col: Column; r: SchoolRecord; lookup: Lookup }) {
  const v = r.data[col.key];
  if (v === undefined || v === null || v === '') return <span className="text-muted-foreground">—</span>;
  switch (col.kind) {
    case 'rel': return <>{lookup[col.entity ?? '']?.get(Number(v))?.title ?? '—'}</>;
    case 'relmulti': {
      const names = nums(v).map((id) => lookup[col.entity ?? '']?.get(id)?.title).filter(Boolean);
      return <span className="line-clamp-2">{names.join('، ') || '—'}</span>;
    }
    case 'date': return <>{fmtDate(v)}</>;
    case 'datetime': return <>{fmtDateTime(v)}</>;
    case 'money': return <>{fmtMoney(v, r.data.currency)}</>;
    case 'days': return <>{nums(v).map((d) => DAYS[d]).join('، ')}</>;
    case 'chips': return <StatusBadge status={str(v)} />;
    case 'file': return <a href={fileUrl(v)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline"><FileText className="h-3.5 w-3.5" />عرض</a>;
    default: return <span className="line-clamp-2">{str(v)}</span>;
  }
}

export function EntityPage({ entity, embedded }: { entity: string; embedded?: boolean }) {
  const cfg = ENTITIES[entity];
  const access = useAccess();
  const role = access.role;
  const { toast } = useToast();
  const invalidate = useInvalidateSchool();
  const list = useListSchoolRecords(entity);
  const { lookup } = useLookups(Array.from(new Set([...cfg.related, 'languages', 'teachers'])));
  const isStudentLessons = entity === 'lessons' && role === 'student';
  const progress = useListSchoolRecords('progress', { query: { enabled: isStudentLessons, queryKey: getListSchoolRecordsQueryKey('progress') } });
  const doneIds = new Set((progress.data ?? []).map((p) => Number(p.data.lessonId)));
  const complete = useCreateSchoolRecord();
  const markDone = (r: SchoolRecord) => complete.mutate({ entity: 'progress', data: { title: r.title, status: 'completed', data: { lessonId: r.id } } }, {
    onSuccess: () => { invalidate('progress'); toast({ title: 'تم تعليم الدرس كمكتمل' }); },
    onError: (e) => toast({ title: 'تعذّر تعليم الدرس', description: errMsg(e), variant: 'destructive' }),
  });
  const update = useUpdateSchoolRecord();
  const archive = useArchiveSchoolRecord();
  const resetPassword = useResetSchoolPassword();
  const [temporaryCredentials, setTemporaryCredentials] = useState<{email:string;password:string}|null>(null);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState('');
  const [editing, setEditing] = useState<SchoolRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [toArchive, setToArchive] = useState<SchoolRecord | null>(null);
  const search = useSearch();
  const studentParam = Number(new URLSearchParams(search).get('studentId')) || 0;
  const [page, setPage] = useState(1);
  const [flt, setFlt] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<SchoolRecord | null>(null);
  const [reason, setReason] = useState('');
  const writable = access.canWrite(cfg);
  const canCreate = writable && (cfg.create ?? cfg.write).includes(role);
  const rowWritable = (r: SchoolRecord) => writable && (cfg.canEdit ? cfg.canEdit(r, role) : true);
  const staff = role === 'admin' || role === 'staff';

  const fkeys = new Set(cfg.fields.map((f) => f.key));
  const dateKey = cfg.fields.find((f) => f.type === 'date' || f.type === 'datetime')?.key;
  const hasLang = fkeys.has('languageId') || fkeys.has('languageIds');
  const hasTeacher = fkeys.has('teacherId') || fkeys.has('teacherIds');
  const setF = (k: string, v: string) => { setFlt((f) => ({ ...f, [k]: v })); setPage(1); };
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const has = (v: unknown, id: string) => (Array.isArray(v) ? v.map(String).includes(id) : String(v) === id);
    return (list.data ?? [])
      .filter((r) => (statusF ? r.status === statusF : r.status !== 'archived'))
      .filter((r) => !(role === 'student' && ['resources', 'lessons', 'assignments'].includes(entity)) || r.status === 'published')
      .filter((r) => !studentParam || Number(r.data.studentId) === studentParam || (entity === 'students' && r.id === studentParam))
      .filter((r) => !flt.language || has(r.data.languageId ?? r.data.languageIds, flt.language))
      .filter((r) => !flt.courseType || r.data.courseType === flt.courseType)
      .filter((r) => !flt.level || r.data.level === flt.level || (Array.isArray(r.data.levels) && r.data.levels.includes(flt.level)))
      .filter((r) => !flt.studySystem || r.data.studySystem === flt.studySystem)
      .filter((r) => !flt.teacher || has(r.data.teacherId ?? r.data.teacherIds, flt.teacher))
      .filter((r) => {
        if (!flt.from && !flt.to) return true;
        const d = String(dateKey ? r.data[dateKey] ?? '' : r.createdAt).slice(0, 10);
        return !!d && (!flt.from || d >= flt.from) && (!flt.to || d <= flt.to);
      })
      .filter((r) => !t || r.title.toLowerCase().includes(t) || JSON.stringify(r.data).toLowerCase().includes(t))
      .sort((a, b) => b.id - a.id);
  }, [list.data, q, statusF, flt, studentParam, role, entity, dateKey]);
  const PAGE = 15;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages);
  const pageRows = rows.slice((cur - 1) * PAGE, cur * PAGE);
  const filtersActive = Object.values(flt).some(Boolean) || !!studentParam;

  const openRecord = (r: SchoolRecord | null) => { setEditing(r); setOpen(true); };
  const quick = (r: SchoolRecord, status: string, extra?: Record<string, unknown>) =>
    update.mutate({ entity, id: r.id, data: { title: r.title, status, data: { ...r.data, ...extra } } }, {
      onSuccess: () => { invalidate(entity, r.id); toast({ title: extra?.resendInvite ? 'أُعيد إرسال الدعوة' : 'تم تحديث الحالة' }); setRejecting(null); setReason(''); },
      onError: (e) => toast({ title: 'تعذّر التحديث', description: errMsg(e), variant: 'destructive' }),
    });
  const doArchive = () => {
    if (!toArchive) return;
    archive.mutate({ entity, id: toArchive.id }, {
      onSuccess: () => { invalidate(entity, toArchive.id); toast({ title: 'تمت الأرشفة' }); setToArchive(null); },
      onError: (e) => { toast({ title: 'تعذّرت الأرشفة', description: errMsg(e), variant: 'destructive' }); setToArchive(null); },
    });
  };
  const resetProfileLogin = (r:SchoolRecord) => {
    resetPassword.mutate({id:String(r.data.accountId||r.id)},{
      onSuccess:(credentials)=>{setTemporaryCredentials(credentials);invalidate(entity,r.id);},
      onError:(error)=>toast({title:"تعذّرت إعادة ضبط الدخول",description:errMsg(error),variant:"destructive"}),
    });
  };

  const addBtn = canCreate && (
    <Button onClick={() => openRecord(null)} data-testid={`button-add-${entity}`}><Plus className="ms-1 h-4 w-4" />إضافة {cfg.singular}</Button>
  );

  return (
    <div>
      {!embedded && <PageHeader title={cfg.plural} hint={cfg.hint} actions={addBtn} />}
      {embedded && <div className="mb-3 flex justify-end">{addBtn}</div>}
      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input className="field-input ps-9" placeholder={`ابحث في ${cfg.plural}`} value={q} onChange={(e) => setQ(e.target.value)} data-testid="input-search" />
        </div>
        {cfg.statuses.length > 1 && (
          <select className="field-input w-auto" value={statusF} onChange={(e) => setStatusF(e.target.value)} data-testid="select-status-filter">
            <option value="">كل الحالات النشطة</option>
            {cfg.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            <option value="archived">مؤرشف</option>
          </select>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2" data-testid="filters">
        {hasLang && (
          <select className="field-input w-auto" value={flt.language ?? ''} onChange={(e) => setF('language', e.target.value)} data-testid="filter-language">
            <option value="">كل اللغات</option>{Array.from(lookup.languages?.values() ?? []).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        )}
        {fkeys.has('courseType') && (
          <select className="field-input w-auto" value={flt.courseType ?? ''} onChange={(e) => setF('courseType', e.target.value)} data-testid="filter-courseType">
            <option value="">كل الأنواع</option><option value="level">مستوى</option><option value="conversation">محادثة</option><option value="exam">اختبار</option>
          </select>
        )}
        {(fkeys.has('level') || fkeys.has('levels')) && (
          <select className="field-input w-auto" value={flt.level ?? ''} onChange={(e) => setF('level', e.target.value)} data-testid="filter-level">
            <option value="">كل المستويات</option>{LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        )}
        {fkeys.has('studySystem') && (
          <select className="field-input w-auto" value={flt.studySystem ?? ''} onChange={(e) => setF('studySystem', e.target.value)} data-testid="filter-studySystem">
            <option value="">كل الأنظمة</option><option value="regular">عادي</option><option value="intensive">مكثّف</option>
          </select>
        )}
        {hasTeacher && (
          <select className="field-input w-auto" value={flt.teacher ?? ''} onChange={(e) => setF('teacher', e.target.value)} data-testid="filter-teacher">
            <option value="">كل الأساتذة</option>{Array.from(lookup.teachers?.values() ?? []).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        )}
        <label className="flex items-center gap-1 text-xs text-muted-foreground">من<input type="date" className="field-input w-auto" value={flt.from ?? ''} onChange={(e) => setF('from', e.target.value)} data-testid="filter-from" /></label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">إلى<input type="date" className="field-input w-auto" value={flt.to ?? ''} onChange={(e) => setF('to', e.target.value)} data-testid="filter-to" /></label>
        {filtersActive && <Link href={`/${entity}`} onClick={() => { setFlt({}); setPage(1); }} className="text-xs font-bold text-primary hover:underline" data-testid="button-clear-filters">مسح المرشّحات</Link>}
        {studentParam > 0 && <span className="rounded-full bg-accent/35 px-3 py-1 text-xs font-bold">طالب: {lookup.students?.get(studentParam)?.title ?? `#${studentParam}`}</span>}
      </div>

      {list.isLoading ? <ListSkeleton /> : list.isError ? (
        <ErrorState message={errMsg(list.error)} onRetry={() => list.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={q || statusF ? 'لا نتائج مطابقة' : `لا توجد ${cfg.plural} بعد`}
          hint={q || statusF ? 'جرّب تغيير البحث أو المرشّح.' : cfg.hint}
          action={!q && !statusF ? addBtn || undefined : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-card-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-secondary/60 text-start text-xs text-secondary-foreground">
                  <th className="px-4 py-3 text-start font-bold">{cfg.hideTitle ? 'الاسم' : cfg.titleLabel}</th>
                  {cfg.columns.map((c) => <th key={c.key} className="px-4 py-3 text-start font-bold">{c.label}</th>)}
                  {cfg.statuses.length > 1 && <th className="px-4 py-3 text-start font-bold">الحالة</th>}
                  <th className="px-4 py-3 text-start font-bold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-t border-border transition-colors hover:bg-muted/60" data-testid={`row-${entity}-${r.id}`}>
                    <td className="px-4 py-3 font-semibold">
                      {entity === 'courses' ? <Link href={`/courses/${r.id}`} className="text-primary hover:underline" data-testid={`link-course-${r.id}`}>{r.title}</Link> : r.title}
                    </td>
                    {cfg.columns.map((c) => <td key={c.key} className="px-4 py-3 text-muted-foreground"><Cell col={c} r={r} lookup={lookup} /></td>)}
                    {cfg.statuses.length > 1 && <td className="px-4 py-3"><StatusBadge status={r.status} /></td>}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {writable && cfg.quick?.filter((a) => a.roles.includes(role) && a.from.includes(r.status)).map((a) => (
                          <Button key={a.status} size="sm" variant="secondary" disabled={update.isPending} onClick={() => (a.reason ? setRejecting(r) : quick(r, a.status))} data-testid={`button-${a.status}-${r.id}`}>{a.label}</Button>
                        ))}
                        {isStudentLessons && (doneIds.has(r.id)
                          ? <span className="rounded-md bg-primary/12 px-2 py-1 text-[11px] font-bold text-primary" data-testid={`text-done-${r.id}`}>مكتمل</span>
                          : <Button size="sm" variant="secondary" disabled={complete.isPending} onClick={() => markDone(r)} data-testid={`button-complete-${r.id}`}>تعليم كمكتمل</Button>)}
                        {entity === 'students' && ['enrollments', 'attendance', 'payments'].map((e) => (
                          <Link key={e} href={`/${e}?studentId=${r.id}`} className="rounded-md bg-secondary px-2 py-1 text-[11px] font-semibold" data-testid={`link-student-${e}-${r.id}`}>{ENTITIES[e].plural}</Link>
                        ))}
                        {['students','teachers'].includes(entity) && role === 'admin' && rowWritable(r) && !['disabled','archived'].includes(r.status) && (
                          <Button size="sm" variant="outline" disabled={resetPassword.isPending} onClick={()=>resetProfileLogin(r)} data-testid={`button-reset-login-${r.id}`}>
                            <KeyRound className="ms-1.5 h-3.5 w-3.5"/>{resetPassword.isPending?'جارٍ إعدادها...':'إعادة ضبط الدخول'}
                          </Button>
                        )}
                        {entity === 'invoices' && (
                          <Link href={`/invoices/${r.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg bg-secondary px-2.5 text-xs font-semibold" data-testid={`link-print-${r.id}`}><Printer className="h-3.5 w-3.5" />عرض وطباعة</Link>
                        )}
                        {entity === 'courses' && (
                          <Link href={`/courses/${r.id}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-secondary" title="التفاصيل" data-testid={`link-details-${r.id}`}><ExternalLink className="h-4 w-4" /></Link>
                        )}
                        <Button size="icon" variant="ghost" className="h-8 w-8" title={rowWritable(r) ? 'تعديل' : 'عرض'} onClick={() => openRecord(r)} data-testid={`button-edit-${r.id}`}>
                          {rowWritable(r) ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        {writable && (cfg.archive ?? cfg.write).includes(role) && rowWritable(r) && r.status !== 'archived' && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="أرشفة" onClick={() => setToArchive(r)} data-testid={`button-archive-${r.id}`}><Archive className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-sm" data-testid="pagination">
              <span className="text-muted-foreground">{rows.length} سجل - صفحة {cur} من {pages}</span>
              <div className="flex gap-1">
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={cur <= 1} onClick={() => setPage(cur - 1)} aria-label="السابق" data-testid="button-page-prev"><ChevronRight className="h-4 w-4" /></Button>
                <Button size="icon" variant="outline" className="h-8 w-8" disabled={cur >= pages} onClick={() => setPage(cur + 1)} aria-label="التالي" data-testid="button-page-next"><ChevronLeft className="h-4 w-4" /></Button>
              </div>
            </div>
          )}
        </div>
      )}

      <RecordDialog cfg={cfg} open={open} onClose={() => setOpen(false)} record={editing} lookup={lookup} role={role} defaults={studentParam?{studentId:studentParam}:undefined} readOnly={!!editing && !rowWritable(editing)} onCredentialsCreated={setTemporaryCredentials} />

      <Dialog open={!!temporaryCredentials} onOpenChange={(open)=>!open&&setTemporaryCredentials(null)}>
        <DialogContent dir="rtl" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>بيانات الدخول المؤقتة</DialogTitle>
            <DialogDescription>أرسل هذه البيانات لصاحب الحساب. سيُطلب منه اختيار كلمة مرور جديدة عند أول دخول. لن تُعرض كلمة المرور مرة أخرى بعد إغلاق النافذة.</DialogDescription>
          </DialogHeader>
          {temporaryCredentials&&<div className="space-y-3">
            <label className="block text-sm font-semibold">البريد الإلكتروني</label>
            <div dir="ltr" className="rounded-lg border bg-muted/40 p-3 text-sm">{temporaryCredentials.email}</div>
            <label className="block text-sm font-semibold">كلمة المرور المؤقتة</label>
            <input aria-label="كلمة المرور المؤقتة" readOnly dir="ltr" value={temporaryCredentials.password} onFocus={(e)=>e.currentTarget.select()} className="field-input font-mono" data-testid="temporary-password"/>
            <Button className="w-full" onClick={()=>void navigator.clipboard.writeText(temporaryCredentials.password).then(()=>toast({title:"تم نسخ كلمة المرور"})).catch(()=>toast({title:"انسخ كلمة المرور يدويًا من الحقل"}))} data-testid="button-copy-temporary-password">
              <ClipboardCopy className="ms-2 h-4 w-4"/>نسخ كلمة المرور
            </Button>
          </div>}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!rejecting} onOpenChange={(o) => !o && setRejecting(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-start">
            <AlertDialogTitle>سبب رفض الدفعة</AlertDialogTitle>
            <AlertDialogDescription>سيظهر السبب للطالب.</AlertDialogDescription>
          </AlertDialogHeader>
          <textarea className="field-input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-reject-reason" />
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction disabled={!reason.trim()} onClick={(e) => { e.preventDefault(); if (rejecting) quick(rejecting, 'rejected', { reason: reason.trim() }); }} data-testid="button-reject-confirm">تأكيد الرفض</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toArchive} onOpenChange={(o) => !o && setToArchive(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader className="text-start">
            <AlertDialogTitle>أرشفة «{toArchive?.title}»؟</AlertDialogTitle>
            <AlertDialogDescription>سيُنقل السجل إلى الأرشيف ولن يظهر في القوائم النشطة، ويمكنك استعراضه من مرشّح الحالة.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel data-testid="button-archive-cancel">تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={doArchive} data-testid="button-archive-confirm">أرشفة</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
