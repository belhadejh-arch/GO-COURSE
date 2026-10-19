import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { AlertTriangle, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import { useNativeAuth } from '@/lib/native-auth';

const base = import.meta.env.BASE_URL;

function PasswordField({ id, label, value, onChange, testId, autoComplete, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void; testId: string; autoComplete: string; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">{label}</label>
      <div className="relative">
        <input id={id} dir="ltr" type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete} required className="field-input pe-11 text-left" data-testid={testId} />
        <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'} aria-pressed={show}
          className="absolute inset-y-0 end-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground" data-testid={`${testId}-toggle`}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" data-testid="login-error">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{message}</span>
    </div>
  );
}

const btn = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-md transition-opacity disabled:opacity-60';

export default function NativeLoginPage() {
  const { session, login, changePassword } = useNativeAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [forceChange, setForceChange] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [conf, setConf] = useState('');

  useEffect(() => {
    if (session.loaded && session.signedIn && !session.mustChangePassword && !forceChange) navigate('/dashboard');
  }, [session.loaded, session.signedIn, session.mustChangePassword, forceChange, navigate]);

  const changing = forceChange || (session.loaded && session.signedIn && session.mustChangePassword);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (email.trim().toLowerCase() === password.trim().toLowerCase()) {
      setError('كلمة المرور ليست عنوان البريد الإلكتروني. استخدم كلمة المرور المؤقتة التي أعطاها لك المدير، أو اطلب منه إعادة ضبطها.');
      return;
    }
    setPending(true); setError('');
    try {
      const r = await login(email.trim(), password);
      if (r.mustChangePassword) { setForceChange(true); setCur(password); setPassword(''); }
      else navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'تعذّر تسجيل الدخول. حاول مرة أخرى.');
    } finally { setPending(false); }
  }

  async function onChange(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setError('');
    if (next.length < 12) { setError('كلمة المرور الجديدة يجب ألا تقل عن 12 حرفًا.'); return; }
    if (next !== conf) { setError('تأكيد كلمة المرور غير مطابق.'); return; }
    if (next === cur) { setError('اختر كلمة مرور مختلفة عن المؤقتة.'); return; }
    setPending(true);
    try {
      await changePassword(cur, next);
      setForceChange(false);
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'تعذّر تغيير كلمة المرور.');
    } finally { setPending(false); }
  }

  return (
    <div className="grid min-h-[100dvh] place-items-center px-4 py-10">
      <div className="rise w-full max-w-md">
        <Link href="/" className="mb-6 flex items-center justify-center gap-3" data-testid="link-home">
          <img src={`${base}logo-transparent.png`} alt="GO COURSE" className="h-14 w-auto" />
          <span className="text-xl font-extrabold tracking-wide">GO COURSE</span>
        </Link>
        <div className="rounded-2xl border border-card-border bg-card p-6 shadow-lg sm:p-8">
          {!session.loaded ? (
            <div className="space-y-3" data-testid="state-loading" aria-busy="true">
              <div className="h-6 w-1/2 animate-pulse rounded-lg bg-muted" />
              <div className="h-11 animate-pulse rounded-xl bg-muted" />
              <div className="h-11 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : changing ? (
            <form onSubmit={onChange} className="space-y-4" noValidate>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-extrabold">تغيير كلمة المرور مطلوب</h1>
              </div>
              <p className="text-sm text-muted-foreground">أنشأ مدير المدرسة حسابك بكلمة مرور مؤقتة. اختر كلمة مرور خاصة بك قبل متابعة استخدام المنصة.</p>
              {error && <ErrorBox message={error} />}
              <PasswordField id="pw-cur" label="كلمة المرور الحالية (المؤقتة)" value={cur} onChange={setCur} testId="password-current" autoComplete="current-password" />
              <PasswordField id="pw-new" label="كلمة المرور الجديدة" value={next} onChange={setNext} testId="password-new" autoComplete="new-password" hint="12 حرفًا على الأقل." />
              <PasswordField id="pw-conf" label="تأكيد كلمة المرور الجديدة" value={conf} onChange={setConf} testId="password-confirm" autoComplete="new-password" />
              <button type="submit" disabled={pending} className={btn} data-testid="password-submit">
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}{pending ? 'جارٍ الحفظ...' : 'حفظ والمتابعة'}
              </button>
            </form>
          ) : (
            <form onSubmit={onLogin} className="space-y-4" noValidate>
              <div>
                <h1 className="text-2xl font-extrabold">تسجيل الدخول</h1>
                <p className="mt-1 text-sm text-muted-foreground">للمدير والأساتذة والطلاب.</p>
              </div>
              {error && <ErrorBox message={error} />}
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold">البريد الإلكتروني</label>
                <input id="login-email" dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required
                  className="field-input text-left" data-testid="login-email" />
              </div>
              <PasswordField id="login-password" label="كلمة المرور" value={password} onChange={setPassword} testId="login-password" autoComplete="current-password" hint="أدخل كلمة المرور المؤقتة التي سلّمها لك المدير؛ عنوان البريد الإلكتروني ليس كلمة المرور." />
              <button type="submit" disabled={pending || !email || !password} className={btn} data-testid="login-submit">
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}{pending ? 'جارٍ الدخول...' : 'دخول'}
              </button>
              <p className="rounded-xl bg-secondary/60 p-3 text-center text-xs text-secondary-foreground">
                الحسابات يُنشئها مدير المدرسة فقط. للحصول على بيانات الدخول أو إعادة تعيين كلمة المرور، تواصل مع إدارة المدرسة.
              </p>
            </form>
          )}
        </div>
        <p className="mt-5 text-center text-sm"><Link href="/" className="font-semibold text-primary hover:underline" data-testid="link-back-home">العودة إلى الصفحة الرئيسية</Link></p>
      </div>
    </div>
  );
}
