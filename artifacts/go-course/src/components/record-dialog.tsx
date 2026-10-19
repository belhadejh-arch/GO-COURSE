import { useEffect, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { Loader2, Paperclip, Plus, RotateCcw, Trash2, Upload } from 'lucide-react';
import { useListSchoolAccounts, useCreateSchoolRecord, useRequestSchoolUpload, useUpdateSchoolRecord } from '@workspace/api-client-react';
import type { SchoolRecord } from '@workspace/api-client-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useInvalidateSchool } from '@/hooks/use-school';
import { DAYS, LEVELS, QTYPES, errMsg, fileUrl, fmtDate, fmtDateTime, fmtMoney, nums, str } from '@/lib/school';
import type { Data, EntityConfig, Field, Lookup, Role } from '@/lib/school';

export interface Q { type: string; prompt: string; options: string[]; correctAnswer: string; points: number }

const toLocalInput = (v: unknown) => {
  if (!v) return '';
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? '' : format(d, "yyyy-MM-dd'T'HH:mm");
};
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const qLabel = (t: string) => QTYPES.find((x) => x.value === t)?.label ?? t;
const HUMAN = ['long_answer', 'file', 'audio'];

/* ---------------- file upload ---------------- */
function FileField({ value, onChange, accept, courseId, onType }: { value: string; onChange: (v: string) => void; accept?: string; courseId?: number; onType?: (t: string) => void }) {
  const up = useRequestSchoolUpload();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const isImg = accept?.startsWith('image');
  const pick = async (f?: File | null) => {
    if (!f) return;
    setErr('');
    const type = f.type || 'application/octet-stream';
    if (isImg && !IMG_TYPES.includes(type)) { setErr('نوع الصورة غير مدعوم. استخدم JPG أو PNG أو WEBP أو GIF.'); return; }
    if (accept?.startsWith('audio') && !type.startsWith('audio/')) { setErr('الملف المختار ليس ملفًا صوتيًا.'); return; }
    if (isImg && f.size > 5 * 1024 * 1024) { setErr('حجم الصورة يجب ألا يتجاوز 5 ميغابايت.'); return; }
    if (f.size > 50 * 1024 * 1024) { setErr('حجم الملف يجب ألا يتجاوز 50 ميغابايت.'); return; }
    if (f.size < 1) { setErr('الملف فارغ.'); return; }
    setBusy(true);
    try {
      const r = await up.mutateAsync({ data: { name: f.name, size: f.size, contentType: type, ...(courseId ? { courseId } : {}) } });
      const put = await fetch(r.uploadURL, { method: 'PUT', headers: { 'Content-Type': type }, body: f });
      if (!put.ok) throw new Error('فشل رفع الملف');
      onChange(r.objectPath);
      onType?.(type);
    } catch (e) { setErr(errMsg(e)); } finally { setBusy(false); }
  };
  const url = fileUrl(value);
  return (
    <div className="space-y-2">
      <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-input bg-card px-3 py-2.5 text-sm hover:bg-secondary/60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-primary" />}
        <span>{busy ? 'جارٍ الرفع...' : isImg ? 'رفع صورة من الملفات' : accept?.startsWith('audio') ? (value ? 'استبدال التسجيل' : 'رفع تسجيل صوتي') : value ? 'استبدال الملف' : 'اختر ملفًا'}</span>
        <input type="file" accept={accept} className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} data-testid="input-file" />
      </label>
      {value && (
        <div className="flex items-center gap-3">
          {isImg && <img src={url} alt="" className="h-14 w-14 rounded-xl object-cover" />}
          {accept?.startsWith('audio') && <audio controls src={url} className="h-9" />}
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary underline"><Paperclip className="h-3.5 w-3.5" /> عرض الملف المرفوع</a>
        </div>
      )}
      {err && <p className="text-xs text-destructive" data-testid="text-file-error">{err}</p>}
    </div>
  );
}

/* ---------------- questions editor (teacher) ---------------- */
function derive(q: Q): Q {
  if (q.type === 'word_order') return { ...q, options: lines(q.correctAnswer).slice().reverse() };
  if (q.type === 'matching') {
    const pairs = lines(q.correctAnswer).map((l) => l.split('=').map((x) => x.trim()));
    return { ...q, options: [...pairs.map((p) => p[0] ?? ''), ...pairs.map((p) => p[1] ?? '').sort()] };
  }
  return q;
}
const blankQ = (type: string): Q => ({ type, prompt: '', options: type === 'multiple_choice' ? ['', ''] : type === 'true_false' ? ['true', 'false'] : [], correctAnswer: '', points: 1 });

function QuestionsField({ value, onChange }: { value: Q[]; onChange: (v: Q[]) => void }) {
  const set = (i: number, p: Partial<Q>) => onChange(value.map((q, j) => (j === i ? derive({ ...q, ...p }) : q)));
  return (
    <div className="space-y-3">
      {value.map((q, i) => (
        <div key={i} className="space-y-2 rounded-xl border border-border bg-muted/50 p-3" data-testid={`question-${i}`}>
          <div className="flex gap-2">
            <select className="field-input" value={q.type} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...blankQ(e.target.value), prompt: x.prompt, points: x.points } : x)))} data-testid={`select-qtype-${i}`}>
              {QTYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input className="field-input w-24" type="number" min={0} value={q.points} onChange={(e) => set(i, { points: Number(e.target.value) })} aria-label="النقاط" />
            <Button type="button" variant="ghost" size="icon" onClick={() => onChange(value.filter((_, j) => j !== i))} data-testid={`button-remove-question-${i}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
          <input className="field-input" value={q.prompt} onChange={(e) => set(i, { prompt: e.target.value })} placeholder={q.type === 'fill_blank' ? 'نص السؤال، ضع ___ مكان الفراغ' : 'نص السؤال'} data-testid={`input-qprompt-${i}`} />
          {q.type === 'multiple_choice' && (
            <>
              <textarea className="field-input" rows={3} value={q.options.join('\n')} onChange={(e) => set(i, { options: e.target.value.split('\n') })} placeholder="كل خيار في سطر" />
              <select className="field-input" value={q.correctAnswer} onChange={(e) => set(i, { correctAnswer: e.target.value })}>
                <option value="">— الإجابة الصحيحة —</option>
                {q.options.filter((o) => o.trim()).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </>
          )}
          {q.type === 'true_false' && (
            <select className="field-input" value={q.correctAnswer} onChange={(e) => set(i, { correctAnswer: e.target.value })}>
              <option value="">— الإجابة الصحيحة —</option><option value="true">صح</option><option value="false">خطأ</option>
            </select>
          )}
          {(q.type === 'fill_blank' || q.type === 'short_answer') && <input className="field-input" value={q.correctAnswer} onChange={(e) => set(i, { correctAnswer: e.target.value })} placeholder="الإجابة الصحيحة" />}
          {q.type === 'word_order' && <textarea className="field-input" rows={3} value={q.correctAnswer} onChange={(e) => set(i, { correctAnswer: e.target.value })} placeholder="الكلمات بالترتيب الصحيح، كلمة في كل سطر" />}
          {q.type === 'matching' && <textarea className="field-input" rows={3} value={q.correctAnswer} onChange={(e) => set(i, { correctAnswer: e.target.value })} placeholder={'كل زوج في سطر بصيغة: العنصر=المقابل'} />}
          {HUMAN.includes(q.type) && <p className="text-xs text-muted-foreground">يُصحَّح هذا السؤال يدويًا من الأستاذ، ولا توجد إجابة آلية.</p>}
        </div>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, blankQ('multiple_choice')])} data-testid="button-add-question"><Plus className="ms-1 h-4 w-4" /> إضافة سؤال</Button>
      </div>
    </div>
  );
}

/* ---------------- answers (student) ---------------- */
function AnswersField({ value, onChange, questions }: { value: string[]; onChange: (v: string[]) => void; questions: Q[] }) {
  if (!questions.length) return <p className="text-sm text-muted-foreground">اختر واجبًا يحتوي على أسئلة لتظهر هنا.</p>;
  const setAt = (i: number, a: string) => onChange(questions.map((_, k) => (k === i ? a : value[k] ?? '')));
  return (
    <div className="space-y-4">
      {questions.map((q, i) => {
        const cur = value[i] ?? '';
        let input: ReactNode;
        if (q.type === 'multiple_choice' || q.type === 'true_false') {
          const opts = q.type === 'true_false' ? ['true', 'false'] : (q.options ?? []).filter(Boolean);
          input = <div className="flex flex-wrap gap-2">{opts.map((o) => <button type="button" key={o} className="chip" data-on={cur === o} onClick={() => setAt(i, o)}>{q.type === 'true_false' ? (o === 'true' ? 'صح' : 'خطأ') : o}</button>)}</div>;
        } else if (q.type === 'word_order') {
          const seq = lines(cur);
          const left = [...(q.options ?? [])];
          seq.forEach((w) => { const k = left.indexOf(w); if (k >= 0) left.splice(k, 1); });
          input = (
            <div className="space-y-2">
              <div className="min-h-10 rounded-xl border border-dashed border-input bg-card p-2 text-sm">{seq.join(' ') || 'اضغط على الكلمات بالترتيب'}</div>
              <div className="flex flex-wrap items-center gap-2">
                {left.map((w, k) => <button type="button" key={`${w}-${k}`} className="chip" data-on={false} onClick={() => setAt(i, [...seq, w].join('\n'))}>{w}</button>)}
                {seq.length > 0 && <Button type="button" size="sm" variant="ghost" onClick={() => setAt(i, '')}><RotateCcw className="ms-1 h-3.5 w-3.5" />إعادة</Button>}
              </div>
            </div>
          );
        } else if (q.type === 'matching') {
          const half = Math.floor((q.options ?? []).length / 2);
          const lefts = (q.options ?? []).slice(0, half); const rights = (q.options ?? []).slice(half);
          const map = new Map(lines(cur).map((l) => { const [a, ...b] = l.split('='); return [a.trim(), b.join('=').trim()] as const; }));
          input = (
            <div className="space-y-2">
              {lefts.map((l) => (
                <div key={l} className="flex items-center gap-2"><span className="w-1/3 text-sm font-semibold">{l}</span>
                  <select className="field-input" value={map.get(l) ?? ''} onChange={(e) => { map.set(l, e.target.value); setAt(i, lefts.map((x) => `${x}=${map.get(x) ?? ''}`).join('\n')); }}>
                    <option value="">— اختر —</option>{rights.map((r, k) => <option key={`${r}-${k}`} value={r}>{r}</option>)}
                  </select></div>
              ))}
            </div>
          );
        } else if (q.type === 'long_answer') {
          input = <textarea className="field-input" rows={5} value={cur} onChange={(e) => setAt(i, e.target.value)} placeholder="اكتب إجابتك هنا" data-testid={`answer-${i}`} />;
        } else if (q.type === 'file' || q.type === 'audio') {
          input = <FileField value={cur} accept={q.type === 'audio' ? 'audio/*' : undefined} onChange={(p) => setAt(i, p)} />;
        } else {
          input = <input className="field-input" value={cur} onChange={(e) => setAt(i, e.target.value)} data-testid={`answer-${i}`} />;
        }
        return (
          <div key={i} className="rounded-xl border border-border bg-muted/50 p-3">
            <p className="mb-2 text-sm font-semibold">{i + 1}. {q.prompt} <span className="text-xs font-normal text-muted-foreground">({qLabel(q.type)} - {q.points} نقطة)</span></p>
            {input}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- teacher language levels ---------------- */
function LangLevelsField({ value, onChange, langIds, lookup }: { value: Record<string, string[]>; onChange: (v: Record<string, string[]>) => void; langIds: number[]; lookup: Lookup }) {
  if (!langIds.length) return <p className="text-xs text-muted-foreground">اختر اللغات أولًا لتحديد مستويات كل لغة.</p>;
  return (
    <div className="space-y-3">
      {langIds.map((id) => {
        const sel = value[id] ?? [];
        return (
          <div key={id} className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-2.5" data-testid={`langlevels-${id}`}>
            <span className="min-w-24 text-sm font-bold">{lookup.languages?.get(id)?.title ?? `لغة ${id}`}</span>
            {LEVELS.map((l) => <button type="button" key={l} className="chip" data-on={sel.includes(l)} onClick={() => onChange({ ...value, [id]: sel.includes(l) ? sel.filter((x) => x !== l) : [...sel, l] })}>{l}</button>)}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- initial enrollments (student create) ---------------- */
interface EDraft { courseId?: string; teacherId?: string; groupId?: string; planId?: string; startDate?: string; time?: string; days?: number[] }

function buildEnrollment(e: EDraft, lk: Lookup): Data | string {
  const c = lk.courses?.get(Number(e.courseId));
  if (!c) return 'اختر الدورة لكل تسجيل';
  if (!e.teacherId) return 'اختر الأستاذ لكل تسجيل';
  if (!e.startDate) return 'حدّد تاريخ البداية لكل تسجيل';
  if (!e.time) return 'حدّد الوقت لكل تسجيل';
  const weekly = Number(c.data.weeklySessions) || (e.days?.length ?? 0);
  if (!e.days?.length || e.days.length !== weekly) return `اختر ${weekly} أيام أسبوعيًا لتسجيل «${c.title}»`;
  const planId = Number(e.planId || c.data.planId) || undefined;
  const plan = planId ? lk.plans?.get(planId) : undefined;
  const dur = Number(plan?.data.durationDays);
  const start = e.startDate;
  const end = dur ? format(new Date(new Date(start).getTime() + dur * 86400000), 'yyyy-MM-dd') : undefined;
  const out: Data = {
    studentId: undefined, courseId: c.id, teacherId: Number(e.teacherId), languageId: Number(c.data.languageId), courseType: c.data.courseType, level: c.data.level,
    studySystem: c.data.studySystem, weeklySessions: weekly, totalSessions: Number(c.data.totalSessions) || 16, startDate: start, days: e.days, time: e.time,
    ...(e.groupId ? { groupId: Number(e.groupId) } : {}), ...(planId ? { planId, subscriptionStart: start, ...(end ? { subscriptionEnd: end } : {}) } : {}),
  };
  delete out.studentId;
  return out;
}

function EnrollmentsField({ value, onChange, lookup }: { value: EDraft[]; onChange: (v: EDraft[]) => void; lookup: Lookup }) {
  const courses = Array.from(lookup.courses?.values() ?? []).filter((c) => c.status === 'published');
  const set = (i: number, p: Partial<EDraft>) => onChange(value.map((e, j) => (j === i ? { ...e, ...p } : e)));
  return (
    <div className="space-y-3" data-testid="field-initial-enrollments">
      <p className="text-xs text-muted-foreground">مطلوب: سجّل الطالب في دورة واحدة على الأقل؛ يُنشأ الملف والتسجيلات معًا.</p>
      {value.map((e, i) => {
        const c = lookup.courses?.get(Number(e.courseId));
        const tids = nums(c?.data.teacherIds);
        const teachers = Array.from(lookup.teachers?.values() ?? []).filter((t) => !tids.length || tids.includes(t.id));
        const groups = Array.from(lookup.groups?.values() ?? []).filter((g) => Number(g.data.courseId) === Number(e.courseId));
        const sel = e.days ?? [];
        return (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-muted/50 p-3" data-testid={`enrollment-draft-${i}`}>
            <div className="flex items-center justify-between"><span className="text-sm font-bold">تسجيل {i + 1}{c ? ` — ${lookup.languages?.get(Number(c.data.languageId))?.title ?? ''} ${str(c.data.level)}` : ''}</span>
              <Button type="button" variant="ghost" size="icon" onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select className="field-input" value={e.courseId ?? ''} onChange={(ev) => { const cc = lookup.courses?.get(Number(ev.target.value)); set(i, { courseId: ev.target.value, teacherId: '', groupId: '', planId: cc?.data.planId ? String(cc.data.planId) : '', days: [] }); }} data-testid={`select-enr-course-${i}`}>
                <option value="">— الدورة —</option>{courses.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
              <select className="field-input" value={e.teacherId ?? ''} onChange={(ev) => set(i, { teacherId: ev.target.value })} data-testid={`select-enr-teacher-${i}`}>
                <option value="">— الأستاذ —</option>{teachers.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
              <select className="field-input" value={e.groupId ?? ''} onChange={(ev) => set(i, { groupId: ev.target.value })}>
                <option value="">— المجموعة (اختياري) —</option>{groups.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
              <select className="field-input" value={e.planId ?? ''} onChange={(ev) => set(i, { planId: ev.target.value })}>
                <option value="">— الباقة (اختياري) —</option>{Array.from(lookup.plans?.values() ?? []).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
              </select>
              <input className="field-input" type="date" value={e.startDate ?? ''} onChange={(ev) => set(i, { startDate: ev.target.value })} aria-label="تاريخ البداية" />
              <input className="field-input" type="time" value={e.time ?? ''} onChange={(ev) => set(i, { time: ev.target.value })} aria-label="الوقت" />
            </div>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, k) => <button type="button" key={d} className="chip" data-on={sel.includes(k)} onClick={() => set(i, { days: sel.includes(k) ? sel.filter((x) => x !== k) : [...sel, k].sort() })}>{d}</button>)}
            </div>
            {c && <p className="text-xs text-muted-foreground">يلزم اختيار {str(c.data.weeklySessions) || '—'} أيام أسبوعيًا حسب نظام الدورة.</p>}
          </div>
        );
      })}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, {}])} data-testid="button-add-enrollment"><Plus className="ms-1 h-4 w-4" />إضافة تسجيل أكاديمي</Button>
    </div>
  );
}

function AccountSelect({ value, onChange }: { value: string; onChange: (id: string, acc?: { role: string; permissions: string[] }) => void }) {
  const q = useListSchoolAccounts();
  if (q.isLoading) return <div className="h-10 animate-pulse rounded-xl bg-muted" />;
  if (q.isError) return <p className="text-xs text-destructive">تعذّر تحميل الحسابات: {errMsg(q.error)}</p>;
  const list = q.data ?? [];
  return (
    <select className="field-input" value={value} onChange={(e) => { const a = list.find((x) => x.id === e.target.value); onChange(e.target.value, a); }} data-testid="select-account">
      <option value="">— اختر حسابًا —</option>
      {list.map((a) => <option key={a.id} value={a.id}>{a.name} - {a.email}{a.enabled ? '' : ' (معطّل)'}</option>)}
    </select>
  );
}

/* ---------------- read-only view ---------------- */
function ViewValue({ f, data, lookup, role }: { f: Field; data: Data; lookup: Lookup; role: Role }) {
  const v = data[f.key];
  const empty = <span className="text-muted-foreground">—</span>;
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return empty;
  switch (f.type) {
    case 'textarea': return <p className="whitespace-pre-line leading-7">{str(v)}</p>;
    case 'url': return <a href={str(v)} target="_blank" rel="noreferrer" className="break-all text-primary underline" dir="ltr">{str(v)}</a>;
    case 'email': return <a href={`mailto:${str(v)}`} className="text-primary underline" dir="ltr">{str(v)}</a>;
    case 'date': return <>{fmtDate(v)}</>;
    case 'datetime': return <>{fmtDateTime(v)}</>;
    case 'select': return <>{f.options?.find((o) => o.value === v)?.label ?? str(v)}</>;
    case 'rel': return <>{lookup[f.entity ?? '']?.get(Number(v))?.title ?? '—'}</>;
    case 'relmulti': return <>{nums(v).map((id) => lookup[f.entity ?? '']?.get(id)?.title).filter(Boolean).join('، ') || '—'}</>;
    case 'chips': return <>{(v as string[]).join('، ')}</>;
    case 'days': return <>{nums(v).map((d) => DAYS[d]).join('، ')}</>;
    case 'file': return <a href={fileUrl(v)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline"><Paperclip className="h-3.5 w-3.5" />عرض الملف</a>;
    case 'langlevels': return <ul className="space-y-0.5">{Object.entries(v as Record<string, string[]>).filter(([, l]) => l.length).map(([id, l]) => <li key={id}>{lookup.languages?.get(Number(id))?.title ?? id}: {l.join('، ')}</li>)}</ul>;
    case 'questions': return (
      <ol className="space-y-3">
        {(v as Q[]).map((q, i) => (
          <li key={i} className="rounded-xl bg-muted/60 p-3" data-testid={`view-question-${i}`}>
            <p className="font-semibold">{i + 1}. {q.prompt} <span className="text-xs font-normal text-muted-foreground">({qLabel(q.type)} - {q.points} نقطة)</span></p>
            {['multiple_choice', 'word_order'].includes(q.type) && q.options?.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{q.options.filter(Boolean).join(' • ')}</p>}
            {q.type === 'matching' && <p className="mt-1 text-sm text-muted-foreground">{q.options.slice(0, Math.floor(q.options.length / 2)).join(' • ')} ⟷ {q.options.slice(Math.floor(q.options.length / 2)).join(' • ')}</p>}
            {role !== 'student' && q.correctAnswer && <p className="mt-1 whitespace-pre-line text-sm text-primary">الإجابة: {q.correctAnswer}</p>}
          </li>
        ))}
      </ol>
    );
    case 'answers': {
      const qs = (lookup.assignments?.get(Number(data.assignmentId))?.data.questions as Q[] | undefined) ?? [];
      const ans = v as string[];
      return (
        <ol className="space-y-2">
          {ans.map((a, i) => {
            const q = qs[i];
            const isFile = q && (q.type === 'file' || q.type === 'audio');
            return <li key={i} className="rounded-xl bg-muted/60 p-3"><p className="text-xs text-muted-foreground">{q?.prompt ?? `سؤال ${i + 1}`}</p>
              {isFile && a ? (q.type === 'audio' ? <audio controls src={fileUrl(a)} className="mt-1 h-9" /> : null) : null}
              {isFile && a ? <a href={fileUrl(a)} target="_blank" rel="noreferrer" className="text-primary underline">عرض المرفق</a> : <p className="whitespace-pre-line font-semibold">{a || '—'}</p>}</li>;
          })}
        </ol>
      );
    }
    case 'number': return <>{f.key === 'amount' ? fmtMoney(v, data.currency) : str(v)}</>;
    default: return <>{str(v)}</>;
  }
}

/* ---------------- dialog ---------------- */
interface Props {
  cfg: EntityConfig; open: boolean; onClose: () => void; record?: SchoolRecord | null; lookup: Lookup; role: Role; defaults?: Data; readOnly?: boolean;
}

export function RecordDialog({ cfg, open, onClose, record, lookup, role, defaults, readOnly }: Props) {
  const { toast } = useToast();
  const invalidate = useInvalidateSchool();
  const create = useCreateSchoolRecord();
  const update = useUpdateSchoolRecord();
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState(cfg.statuses[0]?.value ?? 'active');
  const [data, setData] = useState<Data>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    const base: Data = {};
    cfg.fields.forEach((f) => { if (f.def !== undefined) base[f.key] = f.def; });
    const src: Data = record ? { ...record.data } : { ...base, ...defaults };
    cfg.fields.forEach((f) => { if (f.type === 'datetime') src[f.key] = toLocalInput(src[f.key]); });
    setData(src);
    setTitle(record?.title ?? '');
    setStatus(record?.status ?? cfg.statuses[0]?.value ?? 'active');
  }, [open, record, cfg, defaults]);

  const set = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));
  const base = cfg.fields.filter((f) => !(f.type === 'enrollments' && record) && (!f.showIf || f.showIf(data)));
  const visible = base.filter((f) => !f.hideFor?.includes(role) && !(f.studentOnly && role !== 'student'));
  const staticView = record && role !== 'student' ? base.filter((f) => f.studentOnly) : [];
  const pending = create.isPending || update.isPending;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const out: Data = { ...(record?.data ?? {}) };
    for (const f of visible) {
      let v = data[f.key];
      if (f.type === 'number') v = v === '' || v === undefined || v === null ? undefined : Number(v);
      else if (f.type === 'datetime') v = v ? new Date(String(v)).toISOString() : undefined;
      else if (f.type === 'rel') v = v === '' || v === undefined ? undefined : Number(v);
      else if (f.type === 'langlevels') {
        const ll = Object.fromEntries(Object.entries((v as Record<string, string[]>) ?? {}).filter(([id, l]) => l.length && nums(data.languageIds).includes(Number(id))));
        v = Object.keys(ll).length ? ll : undefined;
      } else if (f.type === 'enrollments') {
        const drafts = (v as EDraft[]) ?? [];
        const built: Data[] = [];
        for (const d of drafts) { const r = buildEnrollment(d, lookup); if (typeof r === 'string') { setError(r); return; } built.push(r); }
        v = built.length ? built : undefined;
      } else if (f.type === 'questions') {
        const qs = (v as Q[]) ?? [];
        for (const q of qs) {
          if (!q.prompt.trim()) { setError('أدخل نص كل سؤال'); return; }
          if (!HUMAN.includes(q.type) && q.type !== 'short_answer' && !q.correctAnswer.trim()) { setError(`حدّد الإجابة الصحيحة للسؤال: ${q.prompt}`); return; }
          if (q.type === 'multiple_choice' && q.options.filter((o) => o.trim()).length < 2) { setError('أضف خيارين على الأقل لأسئلة الاختيار'); return; }
        }
        v = qs.length ? qs.map((q) => ({ ...q, options: q.options.map((o) => o.trim()).filter(Boolean) })) : undefined;
      } else if (f.type === 'answers') {
        const qs = (lookup.assignments?.get(Number(data.assignmentId))?.data.questions as Q[] | undefined) ?? [];
        const a = (v as string[]) ?? [];
        v = qs.map((_, i) => a[i] ?? '');
        if (qs.length && (v as string[]).every((x) => !x)) { setError('أجب عن سؤال واحد على الأقل'); return; }
      } else if (typeof v === 'string') v = f.type === 'password' ? (v === '' ? undefined : v) : (v.trim() === '' ? undefined : v.trim());
      if (f.required && !(f.type === 'password' && record) && (v === undefined || (Array.isArray(v) && !v.length))) { setError(`الحقل مطلوب: ${f.label}`); return; }
      if (v === undefined) { if (record && record.data[f.key] != null) out[f.key] = null; else delete out[f.key]; } else out[f.key] = v;
    }
    if (cfg.key === 'teachers' && !(Array.isArray(out.levels) && out.levels.length) && !out.languageLevels) { setError('حدّد مستويات الأستاذ لكل لغة أو المستويات المشتركة'); return; }
    if (cfg.key === 'enrollments') {
      const w = Number(out.weeklySessions); const n = nums(out.days).length;
      if (w && n !== w) { setError(`عدد الأيام المختارة (${n}) يجب أن يساوي الحصص الأسبوعية (${w})`); return; }
    }
    if (cfg.key === 'sessions' && out.endsAt && out.startsAt && String(out.endsAt) <= String(out.startsAt)) { setError('وقت النهاية يجب أن يكون بعد البداية'); return; }
    let t = title.trim();
    if (!t && cfg.autoTitle) t = cfg.autoTitle(out, lookup).trim();
    if (!t) { setError(`الحقل مطلوب: ${cfg.titleLabel}`); return; }
    if (cfg.key === 'students' || cfg.key === 'teachers') t = cfg.autoTitle!(out, lookup);
    let st = status;
    if (cfg.key === 'submissions' && role !== 'student' && out.grade !== undefined && st === 'submitted') st = 'graded';
    const body = { title: t, status: st, data: out };
    const done = (r: SchoolRecord) => { invalidate(cfg.key, r.id); toast({ title: record ? 'تم حفظ التعديلات' : 'تمت الإضافة بنجاح' }); onClose(); };
    if (record) update.mutate({ entity: cfg.key, id: record.id, data: body }, { onSuccess: done, onError: (er) => setError(errMsg(er)) });
    else create.mutate({ entity: cfg.key, data: body }, { onSuccess: done, onError: (er) => setError(errMsg(er)) });
  };

  const renderField = (f: Field) => {
    const v = data[f.key];
    switch (f.type) {
      case 'textarea': return <textarea className="field-input" rows={3} value={str(v)} onChange={(e) => set(f.key, e.target.value)} data-testid={`input-${f.key}`} />;
      case 'select': return (
        <select className="field-input" value={str(v)} onChange={(e) => set(f.key, e.target.value)} data-testid={`select-${f.key}`}>
          <option value="">— اختر —</option>{f.options?.filter(o=>f.key!=='level'||!data.languageId||!lookup.levels||Array.from(lookup.levels.values()).some(l=>Number(l.data.languageId)===Number(data.languageId)&&l.status==='active'&&String(l.data.code??l.title)===o.value)).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
      case 'rel': {
        const list = Array.from(lookup[f.entity ?? '']?.values() ?? []).filter((r) => !f.relFilter || f.relFilter(r, data));
        return (
            <select className="field-input" value={str(v)} onChange={(e) => {
              const value=e.target.value;
              if(f.key==='courseId'&&cfg.key==='enrollments') {
                const course=lookup.courses?.get(Number(value));
                if(course)setData(d=>({...d,courseId:Number(value),languageId:course.data.languageId,level:course.data.level,courseType:course.data.courseType,studyMode:course.data.studyMode,studySystem:course.data.studySystem,teacherId:nums(course.data.teacherIds)[0],weeklySessions:course.data.weeklySessions,totalSessions:course.data.totalSessions,startDate:course.data.startDate,days:course.data.days,time:course.data.time,examName:course.data.examName}));
                else set(f.key,value);
              }else{set(f.key,value);if(f.key==='languageId')set('level','');}
            }} data-testid={`select-${f.key}`}>
            <option value="">— اختر —</option>{list.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        );
      }
      case 'relmulti': {
        const list = Array.from(lookup[f.entity ?? '']?.values() ?? []).filter(r=>!['disabled','archived'].includes(r.status)).sort((a,b)=>b.id-a.id);
        const sel = nums(v);
        if (!list.length) return <p className="text-xs text-muted-foreground">لا توجد سجلات متاحة بعد.</p>;
        return (
          <div className="flex flex-wrap gap-2">
            {list.map((r) => <button type="button" key={r.id} className="chip" data-on={sel.includes(r.id)} data-testid={`chip-${f.key}-${r.id}`} onClick={() => set(f.key, sel.includes(r.id) ? sel.filter((x) => x !== r.id) : [...sel, r.id])}>{r.title}</button>)}
          </div>
        );
      }
      case 'chips': {
        const sel = Array.isArray(v) ? (v as string[]) : [];
        return <div className="flex flex-wrap gap-2">{f.options?.map((o) => <button type="button" key={o.value} className="chip" data-on={sel.includes(o.value)} onClick={() => set(f.key, sel.includes(o.value) ? sel.filter((x) => x !== o.value) : [...sel, o.value])}>{o.label}</button>)}</div>;
      }
      case 'days': {
        const sel = nums(v);
        return <div className="flex flex-wrap gap-2">{DAYS.map((d, i) => <button type="button" key={d} className="chip" data-on={sel.includes(i)} data-testid={`chip-day-${i}`} onClick={() => set(f.key, sel.includes(i) ? sel.filter((x) => x !== i) : [...sel, i].sort())}>{d}</button>)}</div>;
      }
      case 'file': return <FileField value={str(v)} accept={f.accept} courseId={data.courseId ? Number(data.courseId) : undefined} onChange={(p) => set(f.key, p)} onType={cfg.key === 'resources' ? (t) => set('contentType', t) : undefined} />;
      case 'questions': return <QuestionsField value={Array.isArray(v) ? (v as Q[]) : []} onChange={(q) => set(f.key, q)} />;
      case 'answers': {
        const qs = (lookup.assignments?.get(Number(data.assignmentId))?.data.questions as Q[] | undefined) ?? [];
        return <AnswersField questions={qs} value={Array.isArray(v) ? (v as string[]) : []} onChange={(a) => set(f.key, a)} />;
      }
      case 'langlevels': return <LangLevelsField value={(v as Record<string, string[]>) ?? {}} onChange={(x) => set(f.key, x)} langIds={nums(data.languageIds)} lookup={lookup} />;
      case 'account': return <AccountSelect value={str(v)} onChange={(id, acc) => { set(f.key, id); if (acc) { set('role', acc.role); set('permissions', acc.permissions); } }} />;
      case 'enrollments': return <EnrollmentsField value={Array.isArray(v) ? (v as EDraft[]) : []} onChange={(x) => set(f.key, x)} lookup={lookup} />;
      default: return <input className="field-input" type={f.type === 'datetime' ? 'datetime-local' : f.type} min={f.min} max={f.max} value={str(v)} onChange={(e) => set(f.key, e.target.value)} dir={f.type === 'email' || f.type === 'url' ? 'ltr' : undefined} data-testid={`input-${f.key}`} />;
    }
  };

  const heading = readOnly ? cfg.singular : record ? `تعديل ${cfg.singular}` : `إضافة ${cfg.singular}`;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl" dir="rtl">
        <DialogHeader className="text-start">
          <DialogTitle className="text-xl font-extrabold">{readOnly && record ? record.title : heading}</DialogTitle>
          <DialogDescription>{cfg.hint}</DialogDescription>
        </DialogHeader>
        {readOnly && record ? (
          <div className="space-y-4" data-testid="record-view">
            {cfg.statuses.length > 1 && <div><span className="text-xs text-muted-foreground">الحالة: </span><span className="font-bold">{cfg.statuses.find((s) => s.value === record.status)?.label ?? record.status}</span></div>}
            {base.filter(f=>f.type!=='password').map((f) => (
              <div key={f.key}><p className="mb-1 text-xs font-bold text-muted-foreground">{f.label}</p><div className="text-sm"><ViewValue f={f} data={record.data} lookup={lookup} role={role} /></div></div>
            ))}
            <div className="flex justify-end"><Button variant="outline" onClick={onClose} data-testid="button-cancel">إغلاق</Button></div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {staticView.length > 0 && record && (
              <div className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3">
                {staticView.map((f) => <div key={f.key}><p className="mb-1 text-xs font-bold text-muted-foreground">{f.label}</p><div className="text-sm"><ViewValue f={f} data={record.data} lookup={lookup} role={role} /></div></div>)}
              </div>
            )}
            <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
              {!cfg.hideTitle && (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-sm font-semibold">{cfg.titleLabel}{!cfg.autoTitle && ' *'}</label>
                  {cfg.titleOptions ? (
                    <select className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="select-title"><option value="">— اختر —</option>{cfg.titleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                  ) : (
                    <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={cfg.autoTitle ? 'يُولَّد تلقائيًا إن تُرك فارغًا' : ''} data-testid="input-title" />
                  )}
                </div>
              )}
              {visible.map((f) => (
                <div key={f.key} className={f.wide || ['file', 'questions', 'answers', 'langlevels', 'enrollments'].includes(f.type) ? 'sm:col-span-2' : ''}>
                  <label className="mb-1 block text-sm font-semibold">{f.label}{f.required && ' *'}</label>
                  {renderField(f)}
                  {f.hint && <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>}
                </div>
              ))}
              {cfg.statuses.length > 1 && role !== 'student' && !(cfg.key === 'payments') && (
                <div>
                  <label className="mb-1 block text-sm font-semibold">الحالة</label>
                  <select className="field-input" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="select-status">{cfg.statuses.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
                </div>
              )}
            </fieldset>
            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-form-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">إلغاء</Button>
              <Button type="submit" disabled={pending} data-testid="button-save">{pending && <Loader2 className="ms-2 h-4 w-4 animate-spin" />} حفظ</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
