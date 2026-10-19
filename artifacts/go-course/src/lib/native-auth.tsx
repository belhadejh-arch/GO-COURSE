import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getAuthSession, loginSchoolAccount, logoutSchoolAccount, changeSchoolPassword } from '@workspace/api-client-react';
import type { AuthSession } from '@workspace/api-client-react';
import { AuthStatusContext } from './auth-status';

type Session = AuthSession & { loaded: boolean };
type AuthValue = {
  session: Session;
  login: (email: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refresh: () => Promise<void>;
};
const Context = createContext<AuthValue | null>(null);
export function useNativeAuth() {
  const value = useContext(Context);
  if (!value) throw new Error('Native auth provider is missing.');
  return value;
}
export function NativeAuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session>({ loaded: false, signedIn: false, mustChangePassword: false });
  const previousId = useRef<string | null | undefined>(undefined);
  const channel = useRef<BroadcastChannel | null>(null);
  const apply = (next: AuthSession) => {
    const id = next.user?.id ?? null;
    if (previousId.current !== undefined && previousId.current !== id) qc.clear();
    previousId.current = id;
    setSession({ ...next, loaded: true });
  };
  const refresh = async () => {
    try { apply(await getAuthSession({ credentials: 'include' })); }
    catch { apply({ signedIn: false, mustChangePassword: false }); }
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 20_000);
    const focus = () => { void refresh(); void qc.invalidateQueries(); };
    window.addEventListener('focus', focus);
    if ('BroadcastChannel' in window) {
      channel.current = new BroadcastChannel('go-course-session');
      channel.current.onmessage = () => { void refresh(); };
    }
    return () => { window.clearInterval(timer); window.removeEventListener('focus', focus); channel.current?.close(); };
  }, []);
  const login = async (email: string, password: string) => {
    const result = await loginSchoolAccount({ email, password }, { credentials: 'include' });
    qc.clear(); apply(result); channel.current?.postMessage('changed');
    return { mustChangePassword: result.mustChangePassword };
  };
  const logout = async () => {
    await logoutSchoolAccount({ credentials: 'include' });
    qc.clear(); apply({ signedIn: false, mustChangePassword: false });
    channel.current?.postMessage('changed');
  };
  const changePassword = async (currentPassword: string, newPassword: string) => {
    await changeSchoolPassword({ currentPassword, newPassword }, { credentials: 'include' });
    await refresh(); channel.current?.postMessage('changed');
  };
  return (
    <Context.Provider value={{ session, login, logout, changePassword, refresh }}>
      <AuthStatusContext.Provider value={{ available: true, isLoaded: session.loaded, isSignedIn: session.signedIn }}>
        {children}
      </AuthStatusContext.Provider>
    </Context.Provider>
  );
}
