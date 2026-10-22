import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { Camera, Check, KeyRound, Loader2, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { getListSchoolRecordsQueryKey, requestSchoolUpload, useListSchoolRecords, useUpdateSchoolRecord } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { ErrorState, ListSkeleton, PageHeader } from '@/components/common';
import { useToast } from '@/hooks/use-toast';
import { useMe, useInvalidateSchool } from '@/hooks/use-school';
import { fileUrl, str, errMsg } from '@/lib/school';
import { useNativeAuth } from '@/lib/native-auth';

export default function ProfilePage() {
  const { me } = useMe();
  const { changePassword, logout } = useNativeAuth();
  const [, navigate] = useLocation();
  const entity = me?.role === 'teacher' ? 'teachers' : 'students';
  const records = useListSchoolRecords(entity);
  const profile = records.data?.find((r) => r.id === me?.profileId);
  const update = useUpdateSchoolRecord();
  const invalidate = useInvalidateSchool();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [photoPath, setPhotoPath] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const initialized = useRef<number | null>(null);

  useEffect(() => {
    if (profile && initialized.current !== profile.id) {
      initialized.current = profile.id;
      setEmail(str(profile.data.email));
      setPhone(str(profile.data.phone));
      setPhotoPath(str(profile.data.photoPath));
    }
  }, [profile]);

  async function onPhotoChange(e: FormEvent<HTMLInputElement>) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file || !profile) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) {
      toast({ title: 'اختر ملف صورة صالحًا', variant: 'destructive' });
      return;
    }
    if(file.size>5*1024*1024){toast({title:'يجب ألا يتجاوز حجم الصورة 5 ميغابايت.',variant:'destructive'});return;}
    setUploading(true);
    try {
      const { uploadURL, objectPath } = await requestSchoolUpload({ name: file.name, size: file.size, contentType: file.type }, { credentials: 'include' });
      const uploaded = await fetch(uploadURL, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!uploaded.ok) throw new Error('تعذّر رفع الصورة.');
      const previousPhoto=photoPath;
      setPhotoPath(objectPath);
      update.mutate({ entity, id: profile.id, data: { title: profile.title, status: profile.status, data: { email, phone, photoPath: objectPath } } }, {
        onSuccess: () => { invalidate(entity, profile.id); toast({ title: 'تم تحديث الصورة الشخصية' }); },
        onError: (error) => { setPhotoPath(previousPhoto); toast({ title: 'تعذّر حفظ الصورة', description: errMsg(error), variant: 'destructive' }); },
      });
    } catch (error) {
      toast({ title: 'تعذّر رفع الصورة', description: errMsg(error), variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile || saving) return;
    setSaving(true);
    const oldEmail=str(profile.data.email).trim().toLowerCase();
    const nextEmail=email.trim().toLowerCase();
    update.mutate({ entity, id: profile.id, data: { title: profile.title, status: profile.status, data: { email: nextEmail, phone: phone.trim(), photoPath } } }, {
      onSuccess: async () => {
        invalidate(entity, profile.id);
        if(nextEmail!==oldEmail) {
          toast({title:'تم تحديث البريد الإلكتروني',description:'سجّل الدخول مجددًا باستخدام البريد الجديد.'});
          try{await logout();}catch{}
          navigate('/sign-in');
        } else toast({ title: 'تم حفظ بيانات الملف الشخصي' });
      },
      onError: (error) => toast({ title: 'تعذّر حفظ البيانات', description: errMsg(error), variant: 'destructive' }),
      onSettled: () => setSaving(false),
    });
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 12) { toast({ title: 'كلمة المرور الجديدة يجب ألا تقل عن 12 حرفًا.', variant: 'destructive' }); return; }
    if (newPassword !== confirmPassword) { toast({ title: 'تأكيد كلمة المرور غير مطابق.', variant: 'destructive' }); return; }
    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      toast({ title: 'تم تغيير كلمة المرور' });
    } catch (error) {
      toast({ title: 'تعذّر تغيير كلمة المرور', description: errMsg(error), variant: 'destructive' });
    } finally { setPasswordBusy(false); }
  }

  return (
    <div dir="rtl">
      <PageHeader title="ملفي الشخصي" hint="حدّث بيانات التواصل والصورة، وأبقِ كلمة مرورك آمنة." />
      {records.isLoading ? <ListSkeleton rows={4} /> : records.isError ? <ErrorState message={errMsg(records.error)} onRetry={() => records.refetch()} /> : !profile ? (
        <div className="rounded-2xl border border-card-border bg-card p-8 text-center">
          <UserRound className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-extrabold">تعذّر العثور على ملف الحساب</h2>
          <p className="mt-1 text-sm text-muted-foreground">يرجى التواصل مع إدارة المدرسة لمراجعة ربط الحساب.</p>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
          <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex items-center gap-4">
              <div className="relative">
                <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl bg-secondary">
                  {photoPath ? <img src={fileUrl(photoPath)} alt="الصورة الشخصية" className="h-full w-full object-cover" /> : <UserRound className="h-8 w-8 text-muted-foreground" />}
                </div>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="تغيير الصورة الشخصية" className="absolute -bottom-2 -left-2 grid h-9 w-9 place-items-center rounded-xl border border-card-border bg-card text-primary shadow-sm disabled:opacity-60" data-testid="button-photo-upload">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                </button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onPhotoChange} aria-label="رفع صورة شخصية" />
              </div>
              <div><p className="text-xs font-semibold text-muted-foreground">الحساب</p><h2 className="mt-1 text-xl font-extrabold">{profile.title}</h2><p className="mt-1 text-sm text-muted-foreground">يمكنك تغيير البريد والهاتف والصورة فقط.</p></div>
            </div>
            <form onSubmit={saveProfile} className="space-y-4">
              <label className="block"><span className="mb-1.5 flex items-center gap-2 text-sm font-bold"><Mail className="h-4 w-4 text-primary" />البريد الإلكتروني</span><input className="field-input text-left" dir="ltr" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="profile-email" /></label>
              <label className="block"><span className="mb-1.5 flex items-center gap-2 text-sm font-bold"><Phone className="h-4 w-4 text-primary" />رقم الهاتف</span><input className="field-input text-left" dir="ltr" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="profile-phone" /></label>
              <Button type="submit" disabled={saving || update.isPending} className="w-full sm:w-auto" data-testid="button-profile-save">{saving || update.isPending ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <Check className="ms-2 h-4 w-4" />}حفظ التغييرات</Button>
            </form>
          </section>
          <section className="rounded-2xl border border-card-border bg-card p-5 shadow-sm sm:p-7">
            <div className="mb-5 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="h-5 w-5" /></span><div><h2 className="font-extrabold">أمان الحساب</h2><p className="text-xs text-muted-foreground">استخدم كلمة مرور قوية وفريدة.</p></div></div>
            <form onSubmit={savePassword} className="space-y-4">
              <label className="block"><span className="mb-1.5 block text-sm font-bold">كلمة المرور الحالية</span><input className="field-input text-left" dir="ltr" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
              <label className="block"><span className="mb-1.5 block text-sm font-bold">كلمة المرور الجديدة</span><input className="field-input text-left" dir="ltr" type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /><span className="mt-1 block text-xs text-muted-foreground">12 حرفًا على الأقل.</span></label>
              <label className="block"><span className="mb-1.5 block text-sm font-bold">تأكيد كلمة المرور الجديدة</span><input className="field-input text-left" dir="ltr" type="password" autoComplete="new-password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
              <Button type="submit" variant="outline" disabled={passwordBusy} className="w-full sm:w-auto" data-testid="button-password-save">{passwordBusy ? <Loader2 className="ms-2 h-4 w-4 animate-spin" /> : <KeyRound className="ms-2 h-4 w-4" />}تغيير كلمة المرور</Button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
