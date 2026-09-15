/**
 * Three Web Audio graphs for THE BROKERS, **zero audio files** (claude.md I12).
 *
 *   room    the same coffee-house murmur the other two are played in — it is the
 *           same room, and this time the player is walking around it. Its gain
 *           follows what the day has cost.
 *   paper   the floor's own texture: pages turning, a pen, a chair. Poisson,
 *           so it never sounds like a loop.
 *   event   a man sent for, a price named, and the claim sold.
 *
 * The one that carries information is the price, and it says two things at once
 * (see `voice.ts`):
 *
 *   - **pitch is the price**, logarithmically, across the whole floor;
 *   - **the interval is the news** — a price that beats what you hold resolves
 *     upward into a second note, one that does not falls away from it. You hear
 *     whether the fee bought you anything before you have read the number.
 *
 * This file is plumbing: it decides nothing.
 */
import { createEngine, type AudioEngine, type Voice } from '../../../../shared/audio/engine';
import { priceHz, roomGain, murmurDensityHz } from './voice';
import { TOTAL_FEES_BP } from '../../core/market';

export type BrokersEvent =
  /** A broker is sent for. His fee is owed from this moment. */
  | { readonly kind: 'sent' }
  /** He names a price. Pitch is the price; the interval is whether it helps. */
  | { readonly kind: 'named'; readonly priceBp: number; readonly beatsBest: boolean }
  /** The claim is sold at the best price in hand. */
  | { readonly kind: 'sold'; readonly priceBp: number };

export type BrokersAudio = {
  unlock(): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  /** The room follows what the day has cost. */
  setFees(feesBp: number): void;
  play(event: BrokersEvent): void;
  destroy(): void;
};

export function createBrokersAudio(): BrokersAudio {
  const engine: AudioEngine = createEngine();
  let feesBp = 0;
  let roomLevel: AudioParam | null = null;

  /** What is left of the day, in the same basis points the light uses. */
  const level = () => 10_000 - Math.round((Math.min(feesBp, TOTAL_FEES_BP) / TOTAL_FEES_BP) * 3_000);

  // --- graph 1: the room --------------------------------------------------
  engine.bed((ctx, master) => {
    const source = ctx.createBufferSource();
    source.buffer = engine.noise(ctx, 2, true);
    source.loop = true;

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

  // --- graph 2: paper -----------------------------------------------------
  // A page turned, a pen set down, a chair moved. Short filtered bursts, high
  // and dry, thinning as the day goes.
  engine.grains(
    () => murmurDensityHz(level()),
    (ctx, master, now) => {
      const source = ctx.createBufferSource();
      source.buffer = engine.noise(ctx, 0.08, false);

      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 2_200 + Math.random() * 3_000;
      band.Q.value = 2 + Math.random() * 4;

      const gain = ctx.createGain();
      const peak = 0.02 + Math.random() * 0.03;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(peak, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08 + Math.random() * 0.08);

      source.connect(band).connect(gain).connect(master);
      source.start(now);
      source.stop(now + 0.2);
    },
  );

  // --- graph 3: events ----------------------------------------------------

  /** A man sent for: two knuckles on a desk. */
  const sent: Voice = (ctx, master, now) => {
    for (let i = 0; i < 2; i++) {
      const at = now + i * 0.13;
      const source = ctx.createBufferSource();
      source.buffer = engine.noise(ctx, 0.04, false);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.16 - i * 0.04, at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
      source.connect(filter).connect(gain).connect(master);
      source.start(at);
      source.stop(at + 0.1);
    }
  };

  /**
   * A price named.
   *
   * The pitch is the price. Then the interval: a fifth UP if it beats what you
   * hold, a fourth DOWN if it does not. Two notes, and the second one is the
   * whole of the news.
   */
  const named = (hz: number, beats: boolean): Voice => {
    return (ctx, master, now) => {
      const speak = (frequency: number, at: number, peak: number, length: number) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(peak, at + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
        osc.connect(gain).connect(master);
        osc.start(at);
        osc.stop(at + length + 0.05);
      };

      speak(hz, now, 0.16, 0.34);
      // 3:2 is a fifth up; 3:4 is a fourth down. Just intervals, so the two
      // outcomes are unmistakable even under a coffee-house murmur.
      speak(hz * (beats ? 1.5 : 0.75), now + 0.2, 0.13, beats ? 0.6 : 0.4);
    };
  };

  /** The claim sold: a pen, a line drawn under it, and the book closed. */
  const sold = (hz: number): Voice => {
    return (ctx, master, now) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(hz, now);
      osc.frequency.exponentialRampToValueAtTime(hz * 0.5, now + 0.4);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.17, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      osc.connect(gain).connect(master);
      osc.start(now);
      osc.stop(now + 0.75);

      const book = ctx.createBufferSource();
      book.buffer = engine.noise(ctx, 0.2, true);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      const bookGain = ctx.createGain();
      bookGain.gain.setValueAtTime(0, now + 0.28);
      bookGain.gain.linearRampToValueAtTime(0.14, now + 0.32);
      bookGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      book.connect(filter).connect(bookGain).connect(master);
      book.start(now + 0.28);
      book.stop(now + 0.65);
    };
  };

  return {
    unlock: () => engine.unlock(),
    setEnabled: value => engine.setEnabled(value),
    isEnabled: () => engine.isEnabled(),

    setFees(next) {
      feesBp = next;
      engine.ease(roomLevel, roomGain(level()));
    },

    play(event) {
      switch (event.kind) {
        case 'sent':
          return engine.play(sent);
        case 'named':
          return engine.play(named(priceHz(event.priceBp), event.beatsBest));
        case 'sold':
          return engine.play(sold(priceHz(event.priceBp)));
      }
    },

    destroy: () => engine.destroy(),
  };
}
