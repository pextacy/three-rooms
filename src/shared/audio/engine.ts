/**
 * The audio plumbing both games run on. **Zero audio files** (claude.md I12).
 *
 * Everything that is the same at either table lives here: the lazily-created
 * `AudioContext` (a browser will not start one without a gesture), one master
 * gain that the mute key rides, generated noise buffers, continuous beds, and a
 * Poisson grain scheduler so a repeating texture never sounds metronomic.
 *
 * What a game's sounds MEAN is not here and never should be — that lives in each
 * game's own `app/audio/voice.ts`, where it is pure and tested. This file
 * decides nothing.
 *
 * Nothing that matters is audio-only (prd.md §7): every fact a sound carries is
 * also on the screen and in the accessible readout.
 */

/** A one-shot sound. Given a live context, the master bus and `now`. */
export type Voice = (ctx: AudioContext, master: GainNode, now: number) => void;

/** A continuous source. Built once when the context starts. */
export type Bed = (ctx: AudioContext, master: GainNode) => { stop(): void };

export type AudioEngine = {
  /** Called on the first gesture; a browser will not start a context before one. */
  unlock(): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  /** Plays a one-shot. Silent before the first gesture and while muted. */
  play(voice: Voice): void;
  /** Registers a bed. It starts with the context and stops with the engine. */
  bed(create: Bed): void;
  /**
   * A grain source with exponential gaps — Poisson, not a metronome. `rate`
   * is read fresh before every grain, so a game can thin its texture out as its
   * own ladder falls without restarting anything.
   */
  grains(rate: () => number, fire: Voice): void;
  /** Eases an AudioParam toward a value. A no-op before the context exists. */
  ease(param: AudioParam | null, value: number, seconds?: number): void;
  /** A second of noise, generated rather than fetched. */
  noise(ctx: AudioContext, seconds: number, brown: boolean): AudioBuffer;
  destroy(): void;
};

/** A silent implementation, for jsdom and for browsers without Web Audio. */
function silentEngine(): AudioEngine {
  let enabled = true;
  return {
    unlock() {},
    setEnabled(value) {
      enabled = value;
    },
    isEnabled: () => enabled,
    play() {},
    bed() {},
    grains() {},
    ease() {},
    noise() {
      throw new Error('no audio context');
    },
    destroy() {},
  };
}

type Ctor = typeof AudioContext;

function audioContextCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export function createEngine(): AudioEngine {
  const Ctor = audioContextCtor();
  if (!Ctor) return silentEngine();
  const AudioContextCtor: Ctor = Ctor;

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let enabled = true;
  let destroyed = false;

  const bedFactories: Bed[] = [];
  const running: { stop(): void }[] = [];
  const grainSources: { rate: () => number; fire: Voice }[] = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();

  /** A stretch of noise, generated once. No file, no fetch. */
  function noise(context: AudioContext, seconds: number, brown: boolean): AudioBuffer {
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

  function scheduleGrain(source: { rate: () => number; fire: Voice }): void {
    if (destroyed) return;
    const rate = Math.max(0.05, source.rate());
    // Exponential gaps, so the texture is Poisson rather than metronomic.
    const gap = (-Math.log(1 - Math.random()) / rate) * 1000;
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (ctx && master && enabled) source.fire(ctx, master, ctx.currentTime);
      scheduleGrain(source);
    }, Math.max(40, gap));
    timers.add(timer);
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
    for (const create of bedFactories) running.push(create(ctx, master));
    for (const source of grainSources) scheduleGrain(source);
    return ctx;
  }

  return {
    unlock() {
      const context = ensure();
      if (context?.state === 'suspended') void context.resume();
    },

    setEnabled(value) {
      enabled = value;
      if (master && ctx) master.gain.setTargetAtTime(value ? 1 : 0, ctx.currentTime, 0.02);
      if (value) this.unlock();
    },

    isEnabled: () => enabled,

    play(voice) {
      if (!enabled) return;
      const context = ensure();
      if (!context || !master) return;
      voice(context, master, context.currentTime);
    },

    bed(create) {
      bedFactories.push(create);
      if (ctx && master) running.push(create(ctx, master));
    },

    grains(rate, fire) {
      const source = { rate, fire };
      grainSources.push(source);
      if (ctx) scheduleGrain(source);
    },

    ease(param, value, seconds = 0.25) {
      if (!param || !ctx) return;
      param.setTargetAtTime(value, ctx.currentTime, seconds);
    },

    noise,

    destroy() {
      destroyed = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      for (const bed of running) {
        try {
          bed.stop();
        } catch {
          // already stopped
        }
      }
      running.length = 0;
      void ctx?.close();
      ctx = null;
      master = null;
    },
  };
}
