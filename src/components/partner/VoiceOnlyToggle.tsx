import { START_SECONDS } from '../../lib/partner';

/** 🎧 Voice-only: hide the partner's text and start speaking within 5 seconds after each line. */
export function VoiceOnlyToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 rounded-xl bg-slate-50 p-2.5 text-sm dark:bg-slate-800/60">
      <input type="checkbox" className="mt-0.5 accent-blue-600" checked={value} onChange={(e) => onChange(e.target.checked)} data-testid="voice-only" />
      <span><b>🎧 Voice-only</b> <span className="text-slate-500">· no text, just listen and reply. The mic opens by itself and you get {START_SECONDS} seconds to start talking.</span></span>
    </label>
  );
}
