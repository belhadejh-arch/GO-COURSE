import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { arSA } from '@clerk/localizations';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { AppShell } from '@/components/layouts';
import { EntityPage } from '@/components/entity-page';
import Landing from '@/pages/landing';
import { Catalog, CourseDetail } from '@/pages/catalog';
import Dashboard from '@/pages/dashboard';
import SessionsPage from '@/pages/sessions';
import { DocPage, InvoicePage, NotificationsPage, ReportsPage, SettingsPage } from '@/pages/misc';
import { PublicLayout } from '@/components/layouts';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, refetchInterval: 30_000 } } });

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo-transparent.png`,
  },
  variables: {
    colorPrimary: 'hsl(217 80% 55%)',
    colorForeground: 'hsl(232 42% 17%)',
    colorMutedForeground: 'hsl(235 18% 38%)',
    colorDanger: 'hsl(348 72% 52%)',
    colorBackground: 'hsl(250 80% 99.5%)',
    colorInput: 'hsl(250 80% 99.5%)',
    colorInputForeground: 'hsl(232 42% 17%)',
    colorNeutral: 'hsl(247 30% 70%)',
    fontFamily: "'Changa', system-ui, sans-serif",
    borderRadius: '0.8rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[hsl(250_80%_99.5%)] rounded-3xl w-[440px] max-w-full overflow-hidden shadow-2xl border border-[hsl(247_40%_90%)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[hsl(232_42%_17%)] font-extrabold',
    headerSubtitle: 'text-[hsl(235_18%_38%)]',
    socialButtonsBlockButtonText: 'text-[hsl(232_42%_17%)] font-semibold',
    formFieldLabel: 'text-[hsl(232_42%_17%)] font-semibold',
    footerActionLink: 'text-[hsl(217_80%_45%)] font-bold',
    footerActionText: 'text-[hsl(235_18%_38%)]',
    dividerText: 'text-[hsl(235_18%_38%)]',
    identityPreviewEditButton: 'text-[hsl(217_80%_45%)]',
    formFieldSuccessText: 'text-[hsl(217_80%_40%)]',
    alertText: 'text-[hsl(348_72%_40%)]',
    logoBox: 'h-28 justify-center',
    logoImage: 'h-28 w-auto',
    formButtonPrimary: 'bg-[hsl(217_80%_55%)] hover:bg-[hsl(217_80%_48%)] font-bold',
    formFieldInput: 'border-[hsl(247_30%_82%)]',
    dividerLine: 'bg-[hsl(247_40%_90%)]',
  },
};

function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-secondary via-background to-accent/25 px-4 py-8">{children}</div>
  );
}
const SignInPage = () => <AuthFrame><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></AuthFrame>;
const SignUpPage = () => <AuthFrame><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></AuthFrame>;

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in"><Redirect to="/dashboard" /></Show>
      <Show when="signed-out"><Landing /></Show>
    </>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const unsub = addListener(({ user }) => {
      const id = user?.id ?? null;
      if (prev.current !== undefined && prev.current !== id) qc.clear();
      prev.current = id;
    });
    return unsub;
  }, [addListener, qc]);
  return null;
}

const shell = (c: ReactNode) => <AppShell>{c}</AppShell>;
type CatalogKey = 'languages' | 'levels' | 'courses' | 'plans';
function Adaptive({ entity }: { entity: CatalogKey }) {
  return (
    <>
      <Show when="signed-in">{shell(<EntityPage entity={entity} />)}</Show>
      <Show when="signed-out"><Catalog entity={entity} /></Show>
    </>
  );
}
function CourseDetailRoute() {
  return (
    <>
      <Show when="signed-in">{shell(<CourseDetailInShell />)}</Show>
      <Show when="signed-out"><CourseDetail /></Show>
    </>
  );
}
function CourseDetailInShell() {
  return <CourseDetail />;
}

const managed = ['students', 'teachers', 'enrollments', 'groups', 'lessons', 'resources', 'assignments', 'submissions', 'attendance', 'subscriptions', 'payments', 'invoices'];

function Router() {
  const [location] = useLocation();
  return (
    <ErrorBoundary resetKey={location}>
      <Switch>
        <Route path="/" component={HomeRedirect} />
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route path="/languages">{() => <Adaptive entity="languages" />}</Route>
        <Route path="/levels">{() => <Adaptive entity="levels" />}</Route>
        <Route path="/courses">{() => <Adaptive entity="courses" />}</Route>
        <Route path="/courses/:id" component={CourseDetailRoute} />
        <Route path="/plans">{() => <Adaptive entity="plans" />}</Route>
        <Route path="/dashboard">{() => shell(<Dashboard />)}</Route>
        <Route path="/sessions">{() => shell(<SessionsPage />)}</Route>
        <Route path="/notifications">{() => shell(<NotificationsPage />)}</Route>
        <Route path="/reports">{() => shell(<ReportsPage />)}</Route>
        <Route path="/settings">{() => shell(<SettingsPage />)}</Route>
        <Route path="/invoices/:id">{() => shell(<InvoicePage />)}</Route>
        {managed.map((e) => <Route key={e} path={`/${e}`}>{() => shell(<EntityPage entity={e} />)}</Route>)}
        <Route path="/support">{() => <DocPage doc="support" />}</Route>
        <Route path="/terms">{() => <DocPage doc="terms" />}</Route>
        <Route path="/privacy">{() => <DocPage doc="privacy" />}</Route>
        <Route>{() => <PublicLayout><NotFound /></PublicLayout>}</Route>
      </Switch>
    </ErrorBoundary>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={arSA}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <Router />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
