import { useMemo, useState } from 'react';
import { BookOpen, Download, FileAudio2, FileText, FileVideo2, Search, SlidersHorizontal } from 'lucide-react';
import { useListSchoolRecords } from '@workspace/api-client-react';
import type { SchoolRecord } from '@workspace/api-client-react';
import { ErrorState, ListSkeleton, PageHeader } from '@/components/common';
import { useMe } from '@/hooks/use-school';
import { CURRICULA_BY_LANGUAGE, curriculumLanguage } from '@/lib/curricula';
import { errMsg, fileUrl, str } from '@/lib/school';

function mediaIcon(type: string) {
  if (type.startsWith('audio/')) return FileAudio2;
  if (type.startsWith('video/')) return FileVideo2;
  return FileText;
}

export default function LibraryPage() {
  const { me } = useMe();
  const items = useListSchoolRecords('resources');
  const languages = useListSchoolRecords('languages');
  const [language, setLanguage] = useState('');
  const [level, setLevel] = useState('');
  const [search, setSearch] = useState('');
  const ownProfileQuery = useListSchoolRecords('teachers', { query: { enabled: me?.role === 'teacher', queryKey: ['/api/school/records/teachers'] } });
  const teacher = ownProfileQuery.data?.find((record) => record.id === me?.profileId);
  const teacherLanguageIds = Array.isArray(teacher?.data.languageIds) ? teacher.data.languageIds.map(Number) : [];
  const languageRows = languages.data ?? [];

  const catalogRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return languageRows
      .filter((lang) => me?.role !== 'teacher' || teacherLanguageIds.includes(lang.id))
      .filter((lang) => !language || String(lang.id) === language)
      .flatMap((lang) => {
        const key = curriculumLanguage(lang.title, str(lang.data.code));
        if (!key) return [];
        return CURRICULA_BY_LANGUAGE[key]
          .filter((title) => !term || title.toLocaleLowerCase().includes(term))
          .map((title) => ({ title, languageTitle: lang.title, languageId: lang.id }));
      });
  }, [languageRows, language, search, me?.role, teacherLanguageIds.join(',')]);

  const rows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return (items.data ?? [])
      .filter((r) => r.status === 'published' && r.data.scope === 'library')
      .filter((r) => me?.role !== 'teacher' || teacherLanguageIds.includes(Number(r.data.languageId)))
      .filter((r) => !language || String(r.data.languageId) === language)
      .filter((r) => !level || str(r.data.level) === level)
      .filter((r) => !term || `${r.title} ${str(r.data.curriculumName)} ${str(r.data.level)}`.toLocaleLowerCase().includes(term))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [items.data, language, level, search, me?.role, teacherLanguageIds.join(',')]);

  function languageName(record: SchoolRecord) {
    const langId = Number(record.data.languageId);
    return languageRows.find((l) => l.id === langId)?.title ?? '—';
  }

  return (
    <div dir="rtl">
      <PageHeader title="مكتبة المعلّم" hint="عناوين المناهج وملفات الإدارة للغات التي تدرّسها." />
      <section className="mb-5 rounded-2xl border border-card-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-extrabold"><SlidersHorizontal className="h-4 w-4 text-primary" />تصفّح حسب المنهج</div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr]">
          <select className="field-input" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="تصفية حسب اللغة" data-testid="library-language">
            <option value="">كل اللغات المتاحة</option>{languageRows.filter((l) => me?.role !== 'teacher' || teacherLanguageIds.includes(l.id)).map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
          <select className="field-input" value={level} onChange={(e) => setLevel(e.target.value)} aria-label="تصفية حسب المستوى" data-testid="library-level">
            <option value="">كل المستويات</option>{['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => <option key={l}>{l}</option>)}
          </select>
          <div className="relative"><Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className="field-input ps-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن عنوان المنهج..." data-testid="library-search" /></div>
        </div>
      </section>
      {items.isLoading || languages.isLoading || (me?.role === 'teacher' && ownProfileQuery.isLoading) ? <ListSkeleton rows={5} /> :
        items.isError ? <ErrorState message={errMsg(items.error)} onRetry={() => items.refetch()} /> :
        languages.isError ? <ErrorState message={errMsg(languages.error)} onRetry={() => languages.refetch()} /> :
        (me?.role === 'teacher' && ownProfileQuery.isError) ? <ErrorState message={errMsg(ownProfileQuery.error)} onRetry={() => ownProfileQuery.refetch()} /> :
        rows.length === 0 && catalogRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-card-border bg-card/70 px-6 py-14 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary"><BookOpen className="h-7 w-7" /></span>
            <h2 className="mt-4 text-lg font-extrabold">{search || language || level ? 'لا توجد ملفات مطابقة' : 'المكتبة بانتظار موادها'}</h2>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">{search || language || level ? 'جرّب تغيير خيارات التصفية.' : 'ستظهر هنا ملفات المناهج التي تنشرها إدارة المدرسة للغات التي تدرّسها.'}</p>
          </div>
        ) : (
          <div className="space-y-7">
            {catalogRows.length > 0 && <section aria-labelledby="library-catalog-heading">
              <div className="mb-3"><h2 id="library-catalog-heading" className="text-lg font-extrabold">عناوين المناهج</h2><p className="text-sm text-muted-foreground">اختر منهجًا لطلب ملفاته من إدارة المدرسة عبر صفحة طلب المناهج.</p></div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {catalogRows.map((item) => <article key={`${item.languageId}-${item.title}`} className="flex items-start gap-3 rounded-2xl border border-card-border bg-card p-4 shadow-sm" data-testid={`curriculum-title-${item.languageId}-${item.title.replaceAll(' ','-')}`}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><BookOpen className="h-5 w-5" /></span>
                  <div className="min-w-0"><span className="text-xs font-bold text-primary">{item.languageTitle}</span><h3 className="mt-1 font-extrabold leading-6">{item.title}</h3><a href="/curriculum-requests" className="mt-2 inline-flex text-xs font-bold text-primary hover:underline">طلب هذا المنهج</a></div>
                </article>)}
              </div>
            </section>}
            {rows.length > 0 && <section aria-labelledby="library-files-heading">
              <div className="mb-3"><h2 id="library-files-heading" className="text-lg font-extrabold">ملفات إدارة المدرسة</h2><p className="text-sm text-muted-foreground">الملفات المنشورة متاحة للفتح والتنزيل.</p></div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((r) => {
                  const Icon = mediaIcon(str(r.data.contentType));
                  const href = fileUrl(r.data.objectPath);
                  return <article key={r.id} className="group flex min-h-40 flex-col justify-between rounded-2xl border border-card-border bg-card p-5 shadow-sm transition-transform hover:-translate-y-0.5" data-testid={`library-item-${r.id}`}>
                    <div className="flex items-start gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                      <div className="min-w-0"><span className="text-xs font-bold text-primary">{languageName(r)} <span className="mx-1 text-border">/</span> {str(r.data.level) || '—'}</span><h2 className="mt-1 font-extrabold leading-6">{str(r.data.curriculumName) || r.title}</h2><p className="mt-1 truncate text-xs text-muted-foreground">{r.title}</p></div>
                    </div>
                    <a href={href} target="_blank" rel="noreferrer" className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-secondary px-4 text-sm font-bold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground" data-testid={`library-download-${r.id}`}><Download className="h-4 w-4" />تنزيل الملف</a>
                  </article>;
                })}
              </div>
            </section>}
          </div>
        )}
    </div>
  );
}
