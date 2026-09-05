import type { RunPhase } from './autorun';

/** Only the released-and-pressed Space starts a run; held keys cannot repeat it. */
export function spaceAction(phase: RunPhase, paused: boolean, finishTime: number, repeat: boolean, needsRelease: boolean): 'start' | 'jump' | 'none' {
  if (repeat || paused || needsRelease) return 'none';
  if (phase === 'ready' || phase === 'finished' && finishTime >= 2.8) return 'start';
  return phase === 'running' ? 'jump' : 'none';
}
