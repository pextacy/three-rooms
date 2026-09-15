/**
 * Connects the audio graphs to the floor (claude.md §5, audio law).
 *
 * Keyed to events, never polled: knuckles on a desk when a man is sent for, two
 * notes when he names a price, a pen and a closing book when the claim sells.
 *
 * Unmuted is the default, but a browser will not start an AudioContext without a
 * gesture, so the first key or click unlocks it.
 */
import { useEffect, useRef } from 'react';
import { createBrokersAudio, type BrokersAudio } from '../audio/graphs';
import { feesForMask } from '../../core/market';
import type { BrokersSessionView } from '../bridge';

export function useBrokersAudio(enabled: boolean, session: BrokersSessionView | null): void {
  const audioRef = useRef<BrokersAudio | null>(null);
  const lastSentKey = useRef<string | null>(null);
  const lastNamedCount = useRef<number>(0);
  const lastSoldKey = useRef<string | null>(null);
  const bestBefore = useRef<number>(0);

  useEffect(() => {
    const audio = createBrokersAudio();
    audioRef.current = audio;

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

    audio.setFees(session ? feesForMask(session.askedMask) : 0);

    if (!session) {
      lastSentKey.current = null;
      lastNamedCount.current = 0;
      lastSoldKey.current = null;
      bestBefore.current = 0;
      return;
    }

    // A man sent for.
    const sentKey = `${session.sessionKey}:${session.askedMask}`;
    if (session.waitingOn !== null && lastSentKey.current !== sentKey) {
      lastSentKey.current = sentKey;
      audio.play({ kind: 'sent' });
    }

    // A price named. The interval says whether the fee bought anything, so the
    // comparison is against what was in hand BEFORE this one landed.
    if (session.named.length > lastNamedCount.current) {
      const latest = session.named[session.named.length - 1];
      if (latest) {
        audio.play({ kind: 'named', priceBp: latest.priceBp, beatsBest: latest.priceBp > bestBefore.current });
        bestBefore.current = Math.max(bestBefore.current, latest.priceBp);
      }
      lastNamedCount.current = session.named.length;
    }

    // The claim sold.
    if (session.isSettled && lastSoldKey.current !== session.sessionKey) {
      lastSoldKey.current = session.sessionKey;
      audio.play({ kind: 'sold', priceBp: session.bestBp });
    }
  }, [session]);
}
