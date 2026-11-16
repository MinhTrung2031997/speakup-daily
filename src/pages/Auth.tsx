import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { Spinner } from '../components/ui';

type Mode = 'signin' | 'signup' | 'magic';

const redirectTo = () => `${window.location.origin}/`;

function friendly(msg: string): string {
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password. Try again, or use "Email me a sign-in link".';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first. Check your inbox for the confirmation link.';
  if (/already registered|already been registered/i.test(msg)) return 'This email already has an account. Sign in instead.';
  if (/rate limit|too many/i.test(msg)) return 'Too many emails were sent. Please wait a few minutes and try again.';
  return msg;
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const addr = email.trim();
      if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email: addr, options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        setInfo(`Check ${addr} for a sign-in link. You can close this tab after you click it.`);
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: addr, password, options: { emailRedirectTo: redirectTo() } });
        if (error) throw error;
        if (!data.session) setInfo(`Almost done! We sent a confirmation link to ${addr}. Click it, then sign in.`);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: addr, password });
        if (error) throw error;
      }
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const tab = (m: Mode, label: string) => (
    <button type="button" onClick={() => { setMode(m); setError(''); setInfo(''); }}
      className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium ${mode === m ? 'bg-white text-blue-700 shadow-sm dark:bg-slate-800 dark:text-blue-200' : 'text-slate-600 dark:text-slate-300'}`}>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-4 py-10 dark:from-slate-900 dark:to-slate-950">
      <div className="mx-auto max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-11 w-11" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">SpeakUp <span className="text-blue-600 dark:text-blue-400">Daily</span></h1>
            <p className="muted">Sign in to keep your practice saved on every device.</p>
          </div>
        </div>

        <form onSubmit={submit} className="card space-y-4">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-950">
            {tab('signin', 'Sign in')}
            {tab('signup', 'Create account')}
            {tab('magic', 'Email link')}
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          {mode !== 'magic' && (
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input id="password" className="input" type="password" required minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === 'signup' ? 'At least 6 characters' : ''} />
            </div>
          )}
          {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
          {info && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">{info}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy && <Spinner />} {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Email me a sign-in link'}
          </button>
          {mode === 'signin' && (
            <p className="text-center text-xs text-slate-500">
              Forgot your password? <button type="button" className="text-blue-600 underline dark:text-blue-300" onClick={() => setMode('magic')}>Get a sign-in link by email</button>
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
