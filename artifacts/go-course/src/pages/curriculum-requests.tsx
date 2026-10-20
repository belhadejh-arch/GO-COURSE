import { useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, ClipboardList, Loader2, Send, Sparkles } from 'lucide-react';
import { getListSchoolRecordsQueryKey, useCreateSchoolRecord, useListSchoolRecords, useUpdateSchoolRecord } from '@workspace/api-client-react';
import type { SchoolRecord } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, ListSkeleton, PageHeader, StatusBadge } from '@/components/common';
import { useToast } from '@/hooks/use-toast';
import { useMe } from '@/hooks/use-school';
import { CURRICULA_BY_LANGUAGE, curriculumLanguage } from '@/lib/curricula';
import { errMsg, str } from '@/lib/school';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const STATUS_LABELS: Record<string, string> = { pending: 'قيد المراجعة', processing: 'قيد التجهيز', fulfilled: 'تم التجهيز', rejected: 'مرفوض' };

export default function CurriculumRequestsPage() {
  const { me, role } = useMe();
  const isAdmin = role === 'admin';
  const isTeacher = role === 'teacher';
  const profileEntity = 'teachers';
  const teachers = useListSchoolRecords(profileEntity);
  const languages = useListSchoolRecords('languages');
  const requests = useListSchoolRecords('curriculumRequests');
  const create = useCreateSchoolRecord();
  const update = useUpdateSchoolRecord();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [curricula, setCurricula] = useState<string[]>([]);
  const [levels, setLevels] = useState<string[]>([]);
  const [requestMedia, setRequestMedia] = useState<'yes' | 'no'>('no');
  const [telegramNumber, setTelegramNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const teacher = teachers.data?.find((r) => r.id === me?.profileId);
  const languageIds = Array.isArray(teacher?.data.languageIds) ? teacher.data.languageIds.map(Number) : [];
  const allowedCurricula = useMemo(() => {
    const titles = new Set<string>();
    for (const lang of languages.data ?? []) {
      if (languageIds.includes(lang.id)) {
        const key = curriculumLanguage(lang.title, str(lang.data.code));
        if (key) CURRICULA_BY_LANGUAGE[key].forEach((title) => titles.add(title));
      }
    }
    return Array.from(titles);
  }, [languages.data, languageIds.join(',')]);
  const rows = useMemo(() => (requests.data ?? []).slice().sort((a, b) => b.id - a.id), [requests.data]);
  const setMulti = (values: string[], value: string, setter: (next: string[]) => void) => setter(values.includes(value) ? values.filter((v) => v !== value) : [...values, value]);

  function submitRequest(e: FormEvent) {
    e.preventDefault();
    if (!curricula.length || !levels.length || (requestMedia==='yes'&&!telegramNumber.trim()) || submitting) return;
    setSubmitting(true);
    const title = `طلب مناهج: ${curricula.join('، ')}`;
    create.mutate({ entity: 'curriculumRequests', data: { title, status: 'pending', data: { curricula, levels, requestMedia, telegramNumber: telegramNumber.trim() } } }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListSchoolRecordsQueryKey('curriculumRequests') });
        toast({ title: 'تم إرسال طلبك إلى إدارة المدرسة' });
        setCurricula([]); setLevels([]); setRequestMedia('no'); setTelegramNumber('');
      },
      onError: (error) => toast({ title: 'تعذّر إرسال الطلب', description: errMsg(error), variant: 'destructive' }),
      onSettled: () => setSubmitting(false),
    });
  }

  function changeStatus(record: SchoolRecord, status: 'processing' | 'fulfilled' | 'rejected') {
    update.mutate({ entity: 'curriculumRequests', id: record.id, data: { title: record.title, status, data: record.data } }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListSchoolRecordsQueryKey('curriculumRequests') });
        toast({ title: `تم تحديث الحالة إلى ${STATUS_LABELS[status]}` });
      },
      onError: (error) => toast({ title: 'تعذّر تحديث الحالة', description: errMsg(error), variant: 'destructive' }),
    });
  }

  function ownerLabel(record: SchoolRecord) {
    const ownerId = Number(record.data.teacherId ?? record.data.profileId);
    const owner = teachers.data?.find((teacherRecord) => teacherRecord.id === ownerId);
    return str(record.data.teacherName) || owner?.title || (ownerId ? `الأستاذ #${ownerId}` : 'أستاذ');
  }

  return (
    <div dir="rtl">
      <PageHeader title={isAdmin ? 'طلبات المناهج' : 'طلب مناهج'} hint={isAdmin ? 'راجع احتياجات هيئة التدريس وحدّث حالة كل طلب.' : 'اختر عناوين المناهج والمستويات التي تحتاجها، وسنتابع الطلب معك.'} />
      {!isAdmin && isTeacher && (
        <form onSubmit={submitRequest} className="mb-7 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
          <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span><div><h2 className="font-extrabold">ما الذي تحتاجه؟</h2><p className="text-xs text-muted-foreground">يمكن اختيار أكثر من منهج ومستوى.</p></div></div>
            {languages.isLoading || teachers.isLoading ? <ListSkeleton rows={3} /> : languages.isError ? <ErrorState message={errMsg(languages.error)} onRetry={() => languages.refetch()} /> : (
              <>
                <fieldset>
                  <legend className="mb-2 text-sm font-bold">عناوين المناهج</legend>
                  {allowedCurricula.length ? <div className="grid gap-2 sm:grid-cols-2">
                    {allowedCurricula.map((title) => <label key={title} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${curricula.includes(title) ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-muted/60'}`}>
                      <input type="checkbox" className="accent-primary" checked={curricula.includes(title)} onChange={() => setMulti(curricula, title, setCurricula)} />{title}
                    </label>)}
                  </div> : <p className="rounded-xl bg-secondary/70 p-4 text-sm text-muted-foreground">لم تُربط لغات التدريس بهذا الملف بعد. تواصل مع الإدارة لتحديث اللغات التي تدرّسها.</p>}
                </fieldset>
                <fieldset className="mt-5">
                  <legend className="mb-2 text-sm font-bold">المستويات المطلوبة</legend>
                  <div className="flex flex-wrap gap-2">{LEVELS.map((lv) => <label key={lv} className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${levels.includes(lv) ? 'border-primary/50 bg-primary/5 text-primary' : 'border-border text-muted-foreground'}`}><input type="checkbox" className="accent-primary" checked={levels.includes(lv)} onChange={() => setMulti(levels, lv, setLevels)} />{lv}</label>)}</div>
                </fieldset>
              </>
            )}
          </section>
          <section className="flex flex-col rounded-2xl border border-card-border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-5 flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-secondary-foreground"><ClipboardList className="h-5 w-5" /></span><div><h2 className="font-extrabold">تفاصيل التواصل</h2><p className="text-xs text-muted-foreground">سنستخدم تيليغرام للتنسيق بشأن الملفات.</p></div></div>
            <fieldset><legend className="mb-2 text-sm font-bold">هل تحتاج إلى ملفات صوتية أو مرئية؟</legend><div className="grid grid-cols-2 gap-2">
              {(['yes', 'no'] as const).map((value) => <button key={value} type="button" onClick={() => setRequestMedia(value)} className={`rounded-xl border px-4 py-3 text-sm font-bold ${requestMedia === value ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground'}`} aria-pressed={requestMedia === value} data-testid={`request-media-${value}`}>{value === 'yes' ? 'نعم، أحتاجها' : 'لا أحتاجها'}</button>)}
            </div></fieldset>
            <label className="mt-5 block"><span className="mb-1.5 block text-sm font-bold">رقم تيليغرام {requestMedia==='yes'?'*':'(اختياري)'}</span><input className="field-input text-left" dir="ltr" type="tel" placeholder="+213..." value={telegramNumber} onChange={(e) => setTelegramNumber(e.target.value)} required={requestMedia==='yes'} data-testid="request-telegram" /><span className="mt-1 block text-xs text-muted-foreground">{requestMedia==='yes'?'أدخل الرقم مع مفتاح الدولة لاستلام الملفات.':'أدخل الرقم إذا رغبت بترك وسيلة للتواصل.'}</span></label>
            <Button type="submit" className="mt-auto w-full" disabled={submitting || !curricula.length || !levels.length || (requestMedia==='yes'&&!telegramNumber.trim())} data-testid="button-submit-request">{submitting ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <Send className="ms-2 h-4 w-4" />}إرسال الطلب</Button>
          </section>
        </form>
      )}
      {!isAdmin && !isTeacher ? <div className="rounded-2xl border border-card-border bg-card p-8 text-center"><ClipboardList className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-extrabold">هذه الصفحة متاحة للأساتذة وإدارة المدرسة</h2><p className="mt-1 text-sm text-muted-foreground">تواصل مع الإدارة إذا كنت تحتاج إلى ملفات المنهج.</p></div> : <section>
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-lg font-extrabold">{isAdmin ? 'كل الطلبات' : 'طلباتي السابقة'}</h2><p className="text-sm text-muted-foreground">{isAdmin ? 'تابع الطلبات الواردة من الأساتذة.' : 'تظهر هنا حالة طلباتك بعد إرسالها.'}</p></div><span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold">{rows.length} طلب</span></div>
        {requests.isLoading ? <ListSkeleton rows={4} /> : requests.isError ? <ErrorState message={errMsg(requests.error)} onRetry={() => requests.refetch()} /> : !rows.length ? (
          <EmptyState title="لا توجد طلبات بعد" hint={isAdmin ? 'ستظهر الطلبات الجديدة هنا.' : 'أرسل طلبك الأول، وستجد تحديثاته في هذه القائمة.'} />
        ) : <div className="space-y-3">
          {rows.map((record) => <article key={record.id} className="rounded-2xl border border-card-border bg-card p-4 shadow-sm sm:p-5" data-testid={`request-row-${record.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-extrabold">{record.title}</h3><StatusBadge status={record.status} /></div>{isAdmin && <p className="mt-1 text-xs text-muted-foreground">{ownerLabel(record)}</p>}</div>
              {isAdmin && <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><span>تحديث الحالة</span><span className="relative"><select className="field-input h-9 min-w-36 pe-8 text-xs" value={record.status} onChange={(e) => { const value = e.target.value; if (value === 'processing' || value === 'fulfilled' || value === 'rejected') changeStatus(record, value); }} disabled={update.isPending} aria-label={`حالة الطلب ${record.id}`}><option value="pending" disabled>قيد المراجعة</option><option value="processing">قيد التجهيز</option><option value="fulfilled">تم التجهيز</option><option value="rejected">مرفوض</option></select><ChevronDown className="pointer-events-none absolute end-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" /></span></label>}
            </div>
            <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-4">
              <div><p className="text-[11px] font-bold text-muted-foreground">المناهج</p><p className="mt-1 text-sm font-semibold">{Array.isArray(record.data.curricula) ? record.data.curricula.join('، ') : '—'}</p></div>
              <div><p className="text-[11px] font-bold text-muted-foreground">المستويات</p><p className="mt-1 text-sm font-semibold" dir="ltr">{Array.isArray(record.data.levels) ? record.data.levels.join('، ') : '—'}</p></div>
              <div><p className="text-[11px] font-bold text-muted-foreground">ملفات صوتية أو مرئية</p><p className="mt-1 text-sm font-semibold">{record.data.requestMedia === 'yes' ? 'مطلوبة' : 'غير مطلوبة'}</p></div>
              <div><p className="text-[11px] font-bold text-muted-foreground">تيليغرام</p><p className="mt-1 text-sm font-semibold" dir="ltr">{str(record.data.telegramNumber) || '—'}</p></div>
            </div>
          </article>)}
        </div>}
      </section>}
    </div>
  );
}
