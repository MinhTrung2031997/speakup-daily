import { useState } from 'react';
import { useStore } from '../lib/store';
import { errorText } from '../lib/gemini';
import { Spinner } from './ui';
import Icon from './Icon';

/** Offers a one-click copy of the old browser-only data into the user's account. */
export default function ImportBanner() {
  const { legacy, importData, dismissBrowserImport } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!legacy) return null;
  const n = { answers: legacy.entries.length, phrases: legacy.phrases.length, chats: legacy.chats.length };

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      await importData(legacy, true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card mb-4 space-y-2 border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30">
      <p className="font-semibold">📦 We found practice saved in this browser</p>
      <p className="muted">
        {n.answers} answer{n.answers === 1 ? '' : 's'}, {n.phrases} phrase{n.phrases === 1 ? '' : 's'} and {n.chats} chat{n.chats === 1 ? '' : 's'} from before you had an account.
        Copy them into your account so they're saved permanently and show up on every device. Importing twice won't create duplicates.
      </p>
      {error && <p className="text-sm text-rose-700 dark:text-rose-300">Import failed: {error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={run} disabled={busy}>{busy ? <Spinner /> : <Icon name="upload" className="h-4 w-4" />} Import my saved practice</button>
        <button className="btn-ghost" onClick={dismissBrowserImport} disabled={busy}>Not now</button>
      </div>
    </div>
  );
}
