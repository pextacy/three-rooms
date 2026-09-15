/**
 * Connects the audio graphs to the voyage (claude.md §5, audio law).
 *
 * The sounds are keyed to events, never polled: the boat goes when a surveyor is
 * sent, the bell rings when his report lands, the seal presses when the player
 * underwrites. A report's slip falling into place and its bell are the same
 * event.
 *
 * Unmuted is the default, but a browser will not start an AudioContext without a
 * gesture, so the first key or click unlocks it.
 */
import { useEffect, useRef } from 'react';
import { createSurveyAudio, type SurveyAudio } from '../audio/graphs';
import type { SurveySessionView } from '../bridge';

export function useSurveyAudio(enabled: boolean, session: SurveySessionView | null): void {
  const audioRef = useRef<SurveyAudio | null>(null);
  const lastBoatKey = useRef<string | null>(null);
  const lastReportKey = useRef<string | null>(null);
  const lastCallKey = useRef<string | null>(null);
  const lastOutcomeKey = useRef<string | null>(null);

  useEffect(() => {
    const audio = createSurveyAudio();
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

    audio.setSurveys(session?.surveys ?? 0);

    if (!session) {
      lastBoatKey.current = null;
      lastReportKey.current = null;
      lastCallKey.current = null;
      lastOutcomeKey.current = null;
      return;
    }

    // A surveyor is away: oars, while his report is out.
    const boatKey = `${session.sessionKey}:${session.surveys}`;
    if (session.surveyorOut && lastBoatKey.current !== boatKey) {
      lastBoatKey.current = boatKey;
      audio.play({ kind: 'boat' });
    }

    // His report lands. The bell is the belief (voice.ts).
    const reportKey = `${session.sessionKey}:${session.surveys}`;
    if (session.lastReport !== null && session.surveys > 0 && lastReportKey.current !== reportKey) {
      lastReportKey.current = reportKey;
      audio.play({ kind: 'report', report: session.lastReport, margin: session.margin });
    }

    // The call: wax and a seal, or the book closing.
    if (session.call !== null && lastCallKey.current !== session.sessionKey) {
      lastCallKey.current = session.sessionKey;
      audio.play({ kind: session.call === 'UNDERWRITE' ? 'seal' : 'decline' });
    }

    // And what became of her. Only for an underwriting: a decline never learns.
    if (session.isSettled && session.wasSound !== null && lastOutcomeKey.current !== session.sessionKey) {
      lastOutcomeKey.current = session.sessionKey;
      audio.play({ kind: 'outcome', wasSound: session.wasSound });
    }
  }, [session]);
}
