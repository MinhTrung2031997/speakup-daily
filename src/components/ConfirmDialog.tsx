// Accessible confirm popup (replaces window.confirm): role="alertdialog", focus moves to Cancel,
// Esc / backdrop = Cancel, Tab stays inside. Usage: if (await askConfirm({ title, confirmLabel: 'Delete', danger: true })) ...
import { useEffect, useRef, useState } from 'react';

export interface ConfirmOptions { title: string; body?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
let show: ((p: Pending) => void) | null = null;

export function askConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(window.confirm(opts.title)); // host not mounted (should not happen)
    show({ ...opts, resolve });
  });
}

export default function ConfirmHost() {
  const [p, setP] = useState<Pending | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const back = useRef<Element | null>(null);
  useEffect(() => { show = (x) => { back.current = document.activeElement; setP(x); }; return () => { show = null; }; }, []);
  useEffect(() => { if (p) setTimeout(() => cancelRef.current?.focus(), 0); }, [p]);
  if (!p) return null;
  const done = (ok: boolean) => { p.resolve(ok); setP(null); (back.current as HTMLElement | null)?.focus?.(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); done(false); }
    if (e.key === 'Tab') {
      const els = [...(box.current?.querySelectorAll<HTMLElement>('button') || [])];
      const i = els.indexOf(document.activeElement as HTMLElement);
      e.preventDefault();
      els[(i + (e.shiftKey ? -1 : 1) + els.length) % els.length]?.focus();
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && done(false)}>
      <div ref={box} role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={p.body ? 'confirm-body' : undefined} onKeyDown={onKey}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900" data-testid="confirm-dialog">
        <h2 id="confirm-title" className="text-base font-semibold text-slate-900 dark:text-white">{p.title}</h2>
        {p.body && <p id="confirm-body" className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{p.body}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} className="btn-ghost" onClick={() => done(false)} data-testid="confirm-cancel">{p.cancelLabel || 'Cancel'}</button>
          <button className={p.danger ? 'btn bg-rose-600 text-white hover:bg-rose-700 dark:bg-rose-500 dark:text-white dark:hover:bg-rose-600' : 'btn-primary'} onClick={() => done(true)} data-testid="confirm-ok">{p.confirmLabel || 'OK'}</button>
        </div>
      </div>
    </div>
  );
}
