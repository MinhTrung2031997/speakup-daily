import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-label="Loading" />;
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  if (!error) return null;
  const needsKey = /key not set up|settings/i.test(error);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200 sm:flex-row sm:items-center">
      <span className="flex-1">😕 {error}</span>
      <div className="flex gap-2">
        {needsKey && <Link to="/settings" className="btn-soft !py-1.5" title="Turn on demo mode to try sample answers">Open Settings</Link>}
        {onRetry && <button className="btn-soft !py-1.5" onClick={onRetry}>Try again</button>}
      </div>
    </div>
  );
}

export function PageTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="muted mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Empty({ icon, title, text, children }: { icon: string; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-10 text-center">
      <div className="text-4xl">{icon}</div>
      <p className="font-semibold">{title}</p>
      {text && <p className="muted max-w-sm">{text}</p>}
      {children}
    </div>
  );
}
