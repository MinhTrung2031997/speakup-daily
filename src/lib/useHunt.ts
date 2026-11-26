// Run the word hunt on a spoken answer and record the result (and an SRS success for a due phrase).
import { useCallback, useState } from 'react';
import { useStore } from './store';
import { useAIConfig } from './hooks';
import { wordHunt } from './ai';
import { errorText } from './gemini';
import { isDue, scheduleLevel } from './srs';
import { todayStr, uid } from './date';
import { phraseInText } from './learnPrompts';
import { ACTIVE_AT, huntKey, naturalCount } from './hunt';
import type { HuntSource, HuntUse } from './types';

export function useHunt() {
  const { state, update } = useStore();
  const ai = useAIConfig();
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [error, setError] = useState('');
  const today = todayStr();
  const day = state.hunt.days.find((d) => d.date === today);

  /** Grade today's targets in a spoken answer. `ref` identifies the answer so it counts once. */
  const run = useCallback(async (p: { ref: string; source: HuntSource; question: string; transcript: string }): Promise<HuntUse[]> => {
    const d = state.hunt.days.find((x) => x.date === todayStr());
    // Words spelled out in the question don't count (they'd be handed to him).
    const targets = (d?.targets || []).filter((t) => !phraseInText(t.phrase, p.question));
    if (!targets.length || !p.transcript.trim()) return [];
    setBusyRef(p.ref); setError('');
    try {
      const results = await wordHunt(ai, p.question, p.transcript, targets);
      const now = Date.now();
      const made: HuntUse[] = [];
      update((s) => {
        let uses = s.hunt.uses;
        let phrases = s.phrases;
        for (const r of results) {
          const old = uses.find((u) => u.ref === p.ref && huntKey(u.phrase) === huntKey(r.word));
          const use: HuntUse = { id: old?.id || uid(), date: todayStr(), phrase: r.word, ref: p.ref, source: p.source, level: r.level, evidence: r.evidence, note: r.note, better: r.better, question: p.question.slice(0, 500), createdAt: old?.createdAt || now };
          made.push(use);
          uses = old ? uses.map((u) => (u.id === old.id ? use : u)) : [...uses, use];
          // A Natural use is a real-life success: step the SRS forward, but only if the phrase is due (dates come from srs.ts).
          if (r.level === 'natural' && old?.level !== 'natural') {
            phrases = phrases.map((ph) => {
              if (huntKey(ph.phrase) !== huntKey(r.word)) return ph;
              const due = isDue(ph);
              return {
                ...ph, ...(due ? scheduleLevel(ph, 'natural') : {}), learnedByVoice: true,
                reviews: [...ph.reviews, { date: todayStr(), sentence: r.evidence || p.transcript.slice(0, 200), ok: true, feedback: 'Used naturally in a spoken answer.', level: 'natural' as const, drill: 'use' as const }],
              };
            });
          }
        }
        return { ...s, phrases, hunt: { ...s.hunt, uses } };
      });
      return made;
    } catch (e) {
      setError(errorText(e));
      return [];
    } finally { setBusyRef(null); }
  }, [ai, state.hunt.days, update]);

  return { day, run, busyRef, error, progress: (phrase: string) => naturalCount(state.hunt.uses, phrase), activeAt: ACTIVE_AT };
}
