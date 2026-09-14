/**
 * Three Web Audio graphs, **zero audio files** (claude.md I12, docs.md §6.2).
 *
 *   room    filtered noise bed, a coffee-house murmur. Gain follows the flame.
 *   wax     crackle: short filtered noise bursts, density keyed to the flame.
 *   event   pin drop, gavel on claim, the flare at the last inch.
 *
 * Every sound is synthesised from an oscillator or a generated noise buffer, so
 * the bundle carries no audio at all.
 *
 * What each sound MEANS lives in `voice.ts` and is tested there. This file is
 * the plumbing: it decides nothing.
 *
 * Unmuted is the default setting, but a browser will not let an AudioContext
 * start without a gesture, so the context is created lazily on the first one.
 * Nothing that matters is audio-only (prd.md §7).
 */
import { pinDropHz, roomGain, crackleDensityHz } from './voice';
import { waxBpAt } from '../../games/candle/core/wax';

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

/** A silent implementation, for jsdom and for browsers without Web Audio. */
function silentAudio(): CandleAudio {
  let enabled = true;
  return {
    unlock() {},
    setEnabled(value) {
      enabled = value;
    },
    isEnabled: () => enabled,
    setInch() {},
    play() {},
    destroy() {},
  };
}

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function createAudio(): CandleAudio {
  const Ctor = audioContextCtor();
  if (!Ctor) return silentAudio();
  const AudioContextCtor: Ctor = Ctor;

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let roomBed: { gain: GainNode; source: AudioBufferSourceNode } | null = null;
  let crackleTimer: ReturnType<typeof setTimeout> | null = null;
  let enabled = true;
  let inch = 1;
  let destroyed = false;

  /** A second of noise, generated once and looped. No file, no fetch. */
  function noiseBuffer(context: AudioContext, seconds: number, brown: boolean): AudioBuffer {
    const length = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        // A leaky integrator: brown noise, which sits under a room rather than
        // hissing over it.
        last = (last + 0.02 * white) / 1.02;
        data[i] = last * 3.5;
      } else {
        data[i] = white;
      }
    }
    return buffer;
  }

  function ensure(): AudioContext | null {
    if (destroyed) return null;
    if (ctx) return ctx;
    try {
      ctx = new AudioContextCtor();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = enabled ? 1 : 0;
    master.connect(ctx.destination);
    startRoom();
    scheduleCrackle();
    return ctx;
  }

  // --- graph 1: the room --------------------------------------------------
  function startRoom(): void {
    if (!ctx || !master) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, 2, true);
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
    gain.gain.value = roomGain(waxBpAt(inch));

    source.connect(lowpass).connect(presence).connect(gain).connect(master);
    source.start();
    roomBed = { gain, source };
  }

  // --- graph 2: the wax ---------------------------------------------------
  function crackle(): void {
    if (!ctx || !master || !enabled) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, 0.05, false);

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
  }

  function scheduleCrackle(): void {
    if (destroyed) return;
    const rate = crackleDensityHz(waxBpAt(inch));
    // Exponential gaps, so the crackle is Poisson rather than metronomic.
    const gap = (-Math.log(1 - Math.random()) / rate) * 1000;
    crackleTimer = setTimeout(() => {
      crackle();
      scheduleCrackle();
    }, Math.max(40, gap));
  }

  // --- graph 3: events ----------------------------------------------------
  function pin(faceBp: number): void {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const hz = pinDropHz(faceBp);

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
    tick.buffer = noiseBuffer(ctx, 0.02, false);
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
  }

  function gavel(): void {
    if (!ctx || !master) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(58, now + 0.13);

    const thud = ctx.createGain();
    thud.gain.setValueAtTime(0, now);
    thud.gain.linearRampToValueAtTime(0.3, now + 0.005);
    thud.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    const knock = ctx.createBufferSource();
    knock.buffer = noiseBuffer(ctx, 0.04, false);
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
  }

  function flare(): void {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, 0.6, false);

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
  }

  function burn(): void {
    if (!ctx || !master) return;
    const now = ctx.currentTime;
    // A short breath of air: the flame taking the next inch.
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer(ctx, 0.25, true);
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
  }

  return {
    unlock() {
      const context = ensure();
      if (context?.state === 'suspended') void context.resume();
    },

    setEnabled(value) {
      enabled = value;
      if (master && ctx) {
        master.gain.setTargetAtTime(value ? 1 : 0, ctx.currentTime, 0.02);
      }
      if (value) this.unlock();
    },

    isEnabled: () => enabled,

    setInch(next) {
      inch = next;
      if (roomBed && ctx) {
        // Follow the wax rather than jumping: the room dims, it does not cut.
        roomBed.gain.gain.setTargetAtTime(roomGain(waxBpAt(inch)), ctx.currentTime, 0.25);
      }
    },

    play(event) {
      if (!enabled) return;
      if (!ensure()) return;
      switch (event.kind) {
        case 'pin':
          return pin(event.faceBp);
        case 'gavel':
          return gavel();
        case 'flare':
          return flare();
        case 'burn':
          return burn();
      }
    },

    destroy() {
      destroyed = true;
      if (crackleTimer !== null) clearTimeout(crackleTimer);
      crackleTimer = null;
      try {
        roomBed?.source.stop();
      } catch {
        // already stopped
      }
      roomBed = null;
      void ctx?.close();
      ctx = null;
      master = null;
    },
  };
}
