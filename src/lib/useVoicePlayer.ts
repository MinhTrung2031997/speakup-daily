// Play one or more sentences in a row with the natural voice (US/UK from Settings), with a play/stop toggle per `tag`.
import { useEffect, useRef, useState } from 'react';
import { useStore } from './store';
import { preferredAccent } from './speech';
import { naturalSpeechUrl, speakNatural, stopVoice } from './tts';

export function useVoicePlayer() {
  const { state } = useStore();
  const [playing, setPlaying] = useState<string | null>(null);
  const run = useRef(0);
  const play = async (texts: string[], tag: string) => {
    const id = ++run.current;
    stopVoice();
    if (playing === tag) { setPlaying(null); return; }
    setPlaying(tag);
    const accent = preferredAccent();
    texts.slice(1).forEach((t) => naturalSpeechUrl(t, accent).catch(() => {})); // warm the cache while the first one plays
    for (const t of texts) {
      if (run.current !== id) return;
      const r = await speakNatural(t, { accent, voiceURI: state.settings.voiceURI, rate: state.settings.rate });
      if (r === 'blocked' || r === 'none') break;
    }
    if (run.current === id) setPlaying(null);
  };
  useEffect(() => () => { run.current++; stopVoice(); }, []);
  return { play, playing };
}
