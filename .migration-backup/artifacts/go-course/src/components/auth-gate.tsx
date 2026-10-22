import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { useAuthStatus } from '@/lib/auth-status';
import { PublicLayout } from './layouts';

export function AuthGate({ children }: { children: ReactNode }) {
  const { available, isLoaded } = useAuthStatus();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (isLoaded || !available) return;
    const timer = window.setTimeout(() => setTimedOut(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [available, isLoaded]);

  if (available && isLoaded) return children;
  return (
    <PublicLayout>
      <section className="mx-auto max-w-xl px-4 py-20 text-center" data-testid="auth-status">
        <h1 className="text-2xl font-extrabold">
          {!available ? 'تسجيل الدخول غير مهيّأ بعد' : timedOut ? 'تعذّر تحميل خدمة تسجيل الدخول' : 'جارٍ تحميل تسجيل الدخول'}
        </h1>
        <p className="mt-4 text-muted-foreground">
          {!available
            ? 'يمكنك تصفّح المنصة. لتفعيل الدخول، يجب ضبط مفتاح Clerk العام الصحيح في إعدادات Vercel ثم إعادة النشر.'
            : timedOut
              ? 'المنصة متاحة للتصفّح. تحقق من اتصالك، وإذا استمرت المشكلة يجب مراجعة نطاق ومفتاح خدمة الدخول.'
              : 'يمكنك تصفّح اللغات والدورات أثناء الاتصال بخدمة الدخول.'}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/" className="rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground">الصفحة الرئيسية</Link>
          <button onClick={() => window.location.reload()} className="rounded-xl border px-5 py-3 font-bold">إعادة المحاولة</button>
        </div>
      </section>
    </PublicLayout>
  );
}
