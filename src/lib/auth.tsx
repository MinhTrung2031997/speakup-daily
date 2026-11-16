import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './supabase';
import { StoreProvider } from './store';
import AuthPage from '../pages/Auth';

/** Every page requires sign-in: shows the sign-in page until there is a session. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  // Dark mode follows the system until the user's settings load.
  useEffect(() => {
    if (!session) document.documentElement.classList.toggle('dark', window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  }, [session]);

  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-sm">
        <h1 className="mb-2 text-xl font-bold">Supabase is not configured</h1>
        <p className="muted">Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> (or <code>VITE_SUPABASE_PUBLISHABLE_KEY</code>) in <code>.env.local</code> or in your Vercel project settings, then rebuild. See the README.</p>
      </div>
    );
  }
  if (!ready) return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" /></div>;
  if (!session) return <AuthPage />;
  return (
    <StoreProvider key={session.user.id} userId={session.user.id} email={session.user.email || ''}>
      {children}
    </StoreProvider>
  );
}
