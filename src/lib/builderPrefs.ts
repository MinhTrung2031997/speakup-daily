import type { BuilderLength, BuilderLevel } from './types';

const KEY = 'speakup.builderPrefs';

export interface BuilderPrefs {
  level: BuilderLevel;
  seconds: BuilderLength;
  /** Answer builder: let the AI pick the ideas (skips the idea-chip step). */
  auto: boolean;
}

/** Last-used builder level / length (also the daily suggested answer's default level). */
export function loadBuilderPrefs(): BuilderPrefs {
  let p: Partial<BuilderPrefs> = {};
  try { p = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<BuilderPrefs>; } catch { /* ignore */ }
  return {
    level: p.level === 'Simple' || p.level === 'Fluent' ? p.level : 'Natural',
    seconds: p.seconds === 20 || p.seconds === 90 || p.seconds === 120 ? p.seconds : 45,
    auto: p.auto !== false,
  };
}

export function saveBuilderPrefs(patch: Partial<BuilderPrefs>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...loadBuilderPrefs(), ...patch })); } catch { /* ignore */ }
}
