/**
 * Connects the audio graphs to the round (claude.md §5, audio law).
 *
 * The sounds are keyed to events, never polled: a pin drops when a lot lands, the
 * gavel falls when the player claims, the wick flares at the last inch. A pin's
 * fall and its sound are the same event (docs.md §6.1).
 *
 * Unmuted is the default, but a browser will not start an AudioContext without a
 * gesture, so the first key or click unlocks it.
 */
import { useEffect, useRef } from 'react';
import { createAudio, type CandleAudio } from '../audio/graphs';
import { INCHES } from '../../core/wax';
import { lotById } from '../../core/paytable';
import type { SessionView } from '../../../../shared/bridge';

export function useCandleAudio(enabled: boolean, session: SessionView | null): void {
  const audioRef = useRef<CandleAudio | null>(null);
  const lastLotKey = useRef<string | null>(null);
  const lastFlareKey = useRef<string | null>(null);
  const lastSettledKey = useRef<string | null>(null);
  const lastInch = useRef<number>(1);

  useEffect(() => {
    const audio = createAudio();
    audioRef.current = audio;

    // The first gesture of any kind is enough to start the context.
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      audio.destroy();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioRef.current?.setEnabled(enabled);
  }, [enabled]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const inch = session?.inch ?? 1;
    audio.setInch(inch);

    if (!session) {
      lastLotKey.current = null;
      lastFlareKey.current = null;
      lastSettledKey.current = null;
      lastInch.current = 1;
      return;
    }

    // An inch went: the wax takes a breath.
    if (inch > lastInch.current) {
      audio.play({ kind: 'burn' });
      lastInch.current = inch;
    }

    // A lot landed. The pitch is the information (voice.ts).
    const lotKey = `${session.sessionKey}:${session.inch}`;
    if (session.lotId !== null && lastLotKey.current !== lotKey) {
      lastLotKey.current = lotKey;
      audio.play({ kind: 'pin', faceBp: lotById(session.lotId).faceBp });
    }

    // The wick flares before it dies — Pepys' tell, once per round.
    if (inch >= INCHES && lastFlareKey.current !== session.sessionKey) {
      lastFlareKey.current = session.sessionKey;
      audio.play({ kind: 'flare' });
    }

    // The gavel falls on a settled round.
    if (session.isSettled && lastSettledKey.current !== session.sessionKey) {
      lastSettledKey.current = session.sessionKey;
      audio.play({ kind: 'gavel' });
    }
  }, [session]);
}
