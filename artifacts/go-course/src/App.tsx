import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell, PublicLayout } from '@/components/layouts';
import { EntityPage } from '@/components/entity-page';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/landing';
import { Catalog, CourseDetail } from '@/pages/catalog';
import Dashboard from '@/pages/dashboard';
import SessionsPage from '@/pages/sessions';
import { DocPage, InvoicePage, NotificationsPage, ReportsPage, SettingsPage } from '@/pages/misc';
import NativeLoginPage from '@/pages/native-login';
import { NativeAuthProvider, useNativeAuth } from '@/lib/native-auth';
import { SchoolRealtime } from '@/components/school-realtime';

const queryClient = new QueryClient({ defaultOptions: { queries: {
  retry: 1, refetchOnWindowFocus: true, refetchInterval: 5000,
} } });
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function PrivatePage({ children }: { children: ReactNode }) {
  const { session } = useNativeAuth();
  if (!session.loaded) return <PublicLayout><p className="px-4 py-20 text-center">جارٍ تحميل الحساب…</p></PublicLayout>;
  if (!session.signedIn || session.mustChangePassword) return <NativeLoginPage />;
  return <AppShell>{children}</AppShell>;
}
const shell = (child: ReactNode) => <PrivatePage>{child}</PrivatePage>;
type CatalogKey = 'languages' | 'levels' | 'courses' | 'plans';
function Adaptive({ entity }: { entity: CatalogKey }) {
  const { session } = useNativeAuth();
  return session.signedIn && !session.mustChangePassword
    ? shell(<EntityPage entity={entity} />) : <Catalog entity={entity} />;
}
function Home() {
  const { session } = useNativeAuth();
  return session.signedIn ? <Redirect to={session.mustChangePassword ? '/sign-in' : '/dashboard'} /> : <Landing />;
}
function CoursePage() {
  const { session } = useNativeAuth();
  return session.signedIn ? shell(<CourseDetail />) : <CourseDetail />;
}
const managed = ['students', 'teachers', 'enrollments', 'groups', 'lessons', 'resources', 'assignments', 'submissions', 'attendance', 'subscriptions', 'payments', 'invoices'];
function Routes() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Switch>
    <Route path="/" component={Home} />
    <Route path="/sign-in/*?" component={NativeLoginPage} />
    <Route path="/sign-up/*?"><Redirect to="/sign-in" /></Route>
    <Route path="/languages">{() => <Adaptive entity="languages" />}</Route>
    <Route path="/levels">{() => <Adaptive entity="levels" />}</Route>
    <Route path="/courses">{() => <Adaptive entity="courses" />}</Route>
    <Route path="/courses/:id" component={CoursePage} />
    <Route path="/plans">{() => <Adaptive entity="plans" />}</Route>
    <Route path="/dashboard">{() => shell(<Dashboard />)}</Route>
    <Route path="/sessions">{() => shell(<SessionsPage />)}</Route>
    <Route path="/notifications">{() => shell(<NotificationsPage />)}</Route>
    <Route path="/reports">{() => shell(<ReportsPage />)}</Route>
    <Route path="/settings">{() => shell(<SettingsPage />)}</Route>
    <Route path="/invoices/:id">{() => shell(<InvoicePage />)}</Route>
    {managed.map(entity => <Route key={entity} path={`/${entity}`}>{() => shell(<EntityPage entity={entity} />)}</Route>)}
    {(['support', 'terms', 'privacy'] as const).map(doc => <Route key={doc} path={`/${doc}`}><DocPage doc={doc} /></Route>)}
    <Route><PublicLayout><NotFound /></PublicLayout></Route>
  </Switch></ErrorBoundary>;
}
export default function App() {
  return <WouterRouter base={basePath}><QueryClientProvider client={queryClient}><TooltipProvider>
    <NativeAuthProvider><SchoolRealtime /><Routes /><Toaster /></NativeAuthProvider>
  </TooltipProvider></QueryClientProvider></WouterRouter>;
}
