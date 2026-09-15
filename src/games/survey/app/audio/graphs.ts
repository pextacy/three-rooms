/**
 * Three Web Audio graphs for THE SURVEY, **zero audio files** (claude.md I12).
 *
 *   room    the same coffee-house murmur CANDLE is played in — it is the same
 *           room, one table over. Its gain follows the premium ladder, so the
 *           room quietens exactly as the light goes.
 *   sea     a slow surf swell under everything, filtered brown noise. Thins with
 *           the premium too: the day is going.
 *   event   the surveyor's boat away, his report coming back, the seal on an
 *           underwriting, the chair pushed back on a decline, and the voyage's
 *           own end.
 *
 * The report is the one that matters and it says two things at once, which is
 * how the maths treats them (see `voice.ts`):
 *
 *   - **timbre is what he said** — a struck bell for SOUND, a dull wooden knock
 *     for ROT;
 *   - **pitch is where that leaves you** — the posterior the reports now add up
 *     to, so a pair that disagrees rings the same note twice.
 *
 * This file is plumbing: it decides nothing. The mapping lives in `voice.ts` and
 * is tested there.
 */
import { createEngine, type AudioEngine, type Voice } from '../../../../shared/audio/engine';
import { bellHz, roomGain, murmurDensityHz, levelAt } from './voice';
import type { Report } from '../../core/vessel';

export type SurveyEvent =
  /** A surveyor is sent: oars in the water, and the premium takes its cut. */
  | { readonly kind: 'boat' }
  /** His report comes back. Timbre is the report; pitch is the belief. */
  | { readonly kind: 'report'; readonly report: Report; readonly margin: number }
  /** The player underwrites: wax and a seal. */
  | { readonly kind: 'seal' }
  /** The player declines: the book closes. */
  | { readonly kind: 'decline' }
  /** The voyage resolves. She came home, or she did not. */
  | { readonly kind: 'outcome'; readonly wasSound: boolean };

export type SurveyAudio = {
  unlock(): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  /** The room and the sea follow the premium, exactly as the light does. */
  setSurveys(surveys: number): void;
  play(event: SurveyEvent): void;
  destroy(): void;
};

export function createSurveyAudio(): SurveyAudio {
  const engine: AudioEngine = createEngine();
  let surveys = 0;
  let roomLevel: AudioParam | null = null;
  let seaLevel: AudioParam | null = null;

  /** The room is mixed against the light, and the light is the day. */
  const level = () => levelAt(surveys);

  // --- graph 1: the room --------------------------------------------------
  engine.bed((ctx, master) => {
    const source = ctx.createBufferSource();
    source.buffer = engine.noise(ctx, 2, true);
    source.loop = true;

    // A murmur, not a hiss: everything above speech is gone, and a gentle peak
    // where a room full of voices sits.
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 620;
    lowpass.Q.value = 0.5;

    const presence = ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 340;
    presence.gain.value = 4;
    presence.Q.value = 0.8;

    const gain = ctx.createGain();
    gain.gain.value = roomGain(level());
    roomLevel = gain.gain;

    source.connect(lowpass).connect(presence).connect(gain).connect(master);
    source.start();
    return { stop: () => source.stop() };
  });

  // --- graph 2: the sea ---------------------------------------------------
  engine.bed((ctx, master) => {
    const source = ctx.createBufferSource();
    source.buffer = engine.noise(ctx, 3, true);
    source.loop = true;

    const band = ctx.createBiquadFilter();
    band.type = 'lowpass';
    band.frequency.value = 220;
    band.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.value = roomGain(level()) * 0.8;
    seaLevel = gain.gain;

    // The swell: one slow oscillator on the gain, so the surf breathes instead
    // of sitting still. 0.08 Hz is about a twelve-second period, which is what
    // a long swell actually does.
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.08;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.35;
    swell.connect(swellDepth).connect(gain.gain);
    swell.start();

    source.connect(band).connect(gain).connect(master);
    source.start();
    return {
      stop: () => {
        source.stop();
        swell.stop();
      },
    };
  });

  // --- graph 2b: the murmur's grain ---------------------------------------
  // Single voices surfacing out of the room — a chair, a cup, a word. Poisson,
  // and thinning as the premium goes, exactly like CANDLE's wax crackle.
  engine.grains(
    () => murmurDensityHz(level()),
    (ctx, master, now) => {
      const source = ctx.createBufferSource();
      source.buffer = engine.noise(ctx, 0.06, false);

      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 300 + Math.random() * 900;
      band.Q.value = 5 + Math.random() * 7;

      const gain = ctx.createGain();
      const peak = 0.035 + Math.random() * 0.04;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06 + Math.random() * 0.06);

      source.connect(band).connect(gain).connect(master);
      source.start(now);
      source.stop(now + 0.16);
    },
  );

  // --- graph 3: events ----------------------------------------------------

  /** Oars: two strokes of filtered noise, going away from the desk. */
  const boat: Voice = (ctx, master, now) => {
    for (let stroke = 0; stroke < 2; stroke++) {
      const at = now + stroke * 0.26;
      const source = ctx.createBufferSource();
      source.buffer = engine.noise(ctx, 0.3, false);

      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.setValueAtTime(900, at);
      band.frequency.exponentialRampToValueAtTime(320, at + 0.18);
      band.Q.value = 1.2;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.09 - stroke * 0.02, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);

      source.connect(band).connect(gain).connect(master);
      source.start(at);
      source.stop(at + 0.3);
    }
  };

  /**
   * The report. The pitch is the belief the reports now add up to; the timbre
   * is what this one said.
   *
   * SOUND is a struck bell: a sine with a detuned partial a fifth up, ringing
   * for most of a second. ROT is the same pitch with a short, hard, damped body
   * and a knock of noise across it — a hammer on wood, not metal.
   */
  const report = (hz: number, sound: boolean): Voice => {
    return (ctx, master, now) => {
      const osc = ctx.createOscillator();
      osc.type = sound ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(hz, now);
      if (!sound) osc.frequency.exponentialRampToValueAtTime(hz * 0.72, now + 0.18);

      const body = ctx.createGain();
      body.gain.setValueAtTime(0, now);
      body.gain.linearRampToValueAtTime(sound ? 0.18 : 0.2, now + (sound ? 0.008 : 0.004));
      body.gain.exponentialRampToValueAtTime(0.0001, now + (sound ? 0.9 : 0.22));
      osc.connect(body).connect(master);
      osc.start(now);
      osc.stop(now + (sound ? 1 : 0.3));

      if (sound) {
        // The partial that makes a bell a bell rather than a tone.
        const partial = ctx.createOscillator();
        partial.type = 'sine';
        partial.frequency.value = hz * 2.76; // the first inharmonic of a struck bell
        const partialGain = ctx.createGain();
        partialGain.gain.setValueAtTime(0.06, now);
        partialGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
        partial.connect(partialGain).connect(master);
        partial.start(now);
        partial.stop(now + 0.5);
      } else {
        const knock = ctx.createBufferSource();
        knock.buffer = engine.noise(ctx, 0.05, false);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1_400;
        const knockGain = ctx.createGain();
        knockGain.gain.setValueAtTime(0.18, now);
        knockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        knock.connect(filter).connect(knockGain).connect(master);
        knock.start(now);
        knock.stop(now + 0.1);
      }
    };
  };

  /** Wax and a seal: a short press, then the stamp. */
  const seal: Voice = (ctx, master, now) => {
    const source = ctx.createBufferSource();
    source.buffer = engine.noise(ctx, 0.2, false);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(260, now + 0.16);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    source.connect(filter).connect(gain).connect(master);
    source.start(now);
    source.stop(now + 0.22);

    const thud = ctx.createOscillator();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(120, now);
    thud.frequency.exponentialRampToValueAtTime(64, now + 0.12);
    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0, now);
    thudGain.gain.linearRampToValueAtTime(0.22, now + 0.006);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
    thud.connect(thudGain).connect(master);
    thud.start(now);
    thud.stop(now + 0.3);
  };

  /** The book closes. Flat, quiet, not a punishment. */
  const decline: Voice = (ctx, master, now) => {
    const source = ctx.createBufferSource();
    source.buffer = engine.noise(ctx, 0.25, true);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 480;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.11, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    source.connect(filter).connect(gain).connect(master);
    source.start(now);
    source.stop(now + 0.32);
  };

  /**
   * The voyage's end.
   *
   * She came home: the harbour bell, twice, an octave apart. She did not: one
   * low bell, once, and nothing after it. Neither is theatre — no swell, no
   * sting, no near miss. The game says what happened (claude.md §6).
   */
  const outcome = (wasSound: boolean): Voice => {
    return (ctx, master, now) => {
      const strikes = wasSound ? [0, 0.34] : [0];
      const base = wasSound ? 523 : 147;
      for (const [index, at] of strikes.entries()) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = base * (index === 1 ? 2 : 1);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now + at);
        gain.gain.linearRampToValueAtTime(wasSound ? 0.16 : 0.13, now + at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + (wasSound ? 0.8 : 1.1));
        osc.connect(gain).connect(master);
        osc.start(now + at);
        osc.stop(now + at + (wasSound ? 0.9 : 1.2));
      }
    };
  };

  return {
    unlock: () => engine.unlock(),
    setEnabled: value => engine.setEnabled(value),
    isEnabled: () => engine.isEnabled(),

    setSurveys(next) {
      surveys = next;
      // Follow the premium rather than jumping: the room dims, it does not cut.
      engine.ease(roomLevel, roomGain(level()));
      engine.ease(seaLevel, roomGain(level()) * 0.8);
    },

    play(event) {
      switch (event.kind) {
        case 'boat':
          return engine.play(boat);
        case 'report':
          return engine.play(report(bellHz(event.margin), event.report === 'SOUND'));
        case 'seal':
          return engine.play(seal);
        case 'decline':
          return engine.play(decline);
        case 'outcome':
          return engine.play(outcome(event.wasSound));
      }
    },

    destroy: () => engine.destroy(),
  };
}
