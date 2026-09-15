/**
 * CANDLE's three Web Audio graphs, **zero audio files** (claude.md I12, docs.md §6.2).
 *
 *   room    filtered noise bed, a coffee-house murmur. Gain follows the flame.
 *   wax     crackle: short filtered noise bursts, density keyed to the flame.
 *   event   pin drop, gavel on claim, the flare at the last inch.
 *
 * Every sound is synthesised from an oscillator or a generated noise buffer, so
 * the bundle carries no audio at all.
 *
 * The context, the master gain the mute key rides, the noise buffers and the
 * Poisson grain scheduler are `shared/audio/engine.ts` — the same plumbing THE
 * SURVEY runs on. What each sound MEANS lives in `voice.ts` and is tested there.
 * This file is the wiring between them: it decides nothing.
 *
 * Unmuted is the default setting, but a browser will not let an AudioContext
 * start without a gesture, so the context is created lazily on the first one.
 * Nothing that matters is audio-only (prd.md §7).
 */
import { createEngine, type AudioEngine, type Voice } from '../../../../shared/audio/engine';
import { pinDropHz, roomGain, crackleDensityHz } from './voice';
import { waxBpAt } from '../../core/wax';

export type AudioEvent =
  /** A lot lands on the table. Pitch rises with its face value. */
  | { readonly kind: 'pin'; readonly faceBp: number }
  /** The player claims. */
  | { readonly kind: 'gavel' }
  /** The wick flares before it dies — Pepys' tell. */
  | { readonly kind: 'flare' }
  /** An inch of wax goes. */
  | { readonly kind: 'burn' };

export type CandleAudio = {
  /** Called on the first gesture; a browser will not start a context before one. */
  unlock(): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  /** The room and the crackle follow the wax, exactly as the light does. */
  setInch(inch: number): void;
  play(event: AudioEvent): void;
  destroy(): void;
};

export function createAudio(): CandleAudio {
  const engine: AudioEngine = createEngine();
  let inch = 1;
  let roomLevel: AudioParam | null = null;

  const wax = () => waxBpAt(inch);

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
    gain.gain.value = roomGain(wax());
    roomLevel = gain.gain;

    source.connect(lowpass).connect(presence).connect(gain).connect(master);
    source.start();
    return { stop: () => source.stop() };
  });

  // --- graph 2: the wax ---------------------------------------------------
  // Short filtered bursts, Poisson rather than metronomic, thinning as there is
  // less wax left to crackle.
  engine.grains(
    () => crackleDensityHz(wax()),
    (ctx, master, now) => {
      const source = ctx.createBufferSource();
      source.buffer = engine.noise(ctx, 0.05, false);

      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      // Each crackle sits somewhere different, so a repeat never sounds like one.
      band.frequency.value = 1_200 + Math.random() * 2_600;
      band.Q.value = 6 + Math.random() * 8;

      const gain = ctx.createGain();
      const peak = 0.05 + Math.random() * 0.06;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05 + Math.random() * 0.05);

      source.connect(band).connect(gain).connect(master);
      source.start(now);
      source.stop(now + 0.14);
    },
  );

  // --- graph 3: events ----------------------------------------------------
  const pin = (faceBp: number): Voice => {
    const hz = pinDropHz(faceBp);
    return (ctx, master, now) => {
      // The pin itself: a short pitched body that drops a little as it falls.
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(hz, now);
      osc.frequency.exponentialRampToValueAtTime(hz * 0.82, now + 0.16);

      const body = ctx.createGain();
      body.gain.setValueAtTime(0, now);
      body.gain.linearRampToValueAtTime(0.16, now + 0.006);
      body.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      // The tap of metal on wax, a breath before the tone.
      const tick = ctx.createBufferSource();
      tick.buffer = engine.noise(ctx, 0.02, false);
      const tickBand = ctx.createBiquadFilter();
      tickBand.type = 'bandpass';
      tickBand.frequency.value = hz * 3;
      tickBand.Q.value = 4;
      const tickGain = ctx.createGain();
      tickGain.gain.setValueAtTime(0.09, now);
      tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);

      osc.connect(body).connect(master);
      tick.connect(tickBand).connect(tickGain).connect(master);
      osc.start(now);
      osc.stop(now + 0.26);
      tick.start(now);
      tick.stop(now + 0.06);
    };
  };

  const gavel: Voice = (ctx, master, now) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.13);

    const thud = ctx.createGain();
    thud.gain.setValueAtTime(0, now);
    thud.gain.linearRampToValueAtTime(0.3, now + 0.005);
    thud.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    const knock = ctx.createBufferSource();
    knock.buffer = engine.noise(ctx, 0.04, false);
    const knockFilter = ctx.createBiquadFilter();
    knockFilter.type = 'lowpass';
    knockFilter.frequency.value = 1_100;
    const knockGain = ctx.createGain();
    knockGain.gain.setValueAtTime(0.2, now);
    knockGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.connect(thud).connect(master);
    knock.connect(knockFilter).connect(knockGain).connect(master);
    osc.start(now);
    osc.stop(now + 0.34);
    knock.start(now);
    knock.stop(now + 0.1);
  };

  const flare: Voice = (ctx, master, now) => {
    const source = ctx.createBufferSource();
    source.buffer = engine.noise(ctx, 0.6, false);

    // A swell that opens upward: the wick brightening before it goes.
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.setValueAtTime(700, now);
    band.frequency.exponentialRampToValueAtTime(2_600, now + 0.28);
    band.Q.value = 1.6;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.13, now + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    source.connect(band).connect(gain).connect(master);
    source.start(now);
    source.stop(now + 0.6);
  };

  const burn: Voice = (ctx, master, now) => {
    // A short breath of air: the flame taking the next inch.
    const source = ctx.createBufferSource();
    source.buffer = engine.noise(ctx, 0.25, true);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.9;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.1, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);

    source.connect(filter).connect(gain).connect(master);
    source.start(now);
    source.stop(now + 0.3);
  };

  return {
    unlock: () => engine.unlock(),
    setEnabled: value => engine.setEnabled(value),
    isEnabled: () => engine.isEnabled(),

    setInch(next) {
      inch = next;
      // Follow the wax rather than jumping: the room dims, it does not cut.
      engine.ease(roomLevel, roomGain(wax()));
    },

    play(event) {
      switch (event.kind) {
        case 'pin':
          return engine.play(pin(event.faceBp));
        case 'gavel':
          return engine.play(gavel);
        case 'flare':
          return engine.play(flare);
        case 'burn':
          return engine.play(burn);
      }
    },

    destroy: () => engine.destroy(),
  };
}
