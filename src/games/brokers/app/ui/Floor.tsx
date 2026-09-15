/**
 * Mounts the one canvas and keeps the DOM lit by the SAME light model.
 *
 * There is one light model, not two. The canvas draws the floor; the controls
 * and the accessible text are DOM, and their colours come from CSS custom
 * properties written from `paletteAtWax` at this game's own level — what the
 * day has cost so far.
 *
 * If the browser has no 2D context the scene is skipped and the page still
 * works: the accessible layer carries everything (claude.md — no information is
 * carried by colour alone, and none by height alone either).
 */
import { useEffect, useRef } from 'react';
import { mountFloor, levelFor, type Desk, type Slip, type FloorHandle } from '../render/floor';
import { paletteAtWax, css, type InkName, LAMPLIGHT } from '../../../../shared/render/light';

export type FloorProps = {
  readonly slips: readonly Slip[];
  readonly desks: readonly Desk[];
  readonly feesBp: number;
  readonly payoutText: string | null;
  readonly settled: boolean;
  readonly label: string;
};

/** Writes the palette for a fee level onto the document root. */
export function applyFloorLight(feesBp: number, root: HTMLElement | null = document.documentElement): void {
  if (!root) return;
  const level = levelFor(feesBp);
  const palette = paletteAtWax(level, LAMPLIGHT);
  for (const name of Object.keys(palette) as InkName[]) {
    root.style.setProperty(`--${name}`, css(palette[name]));
  }
  root.style.setProperty('--wax', String(level / 10_000));
}

export function Floor(props: FloorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<FloorHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      handleRef.current = mountFloor(canvas);
    } catch {
      handleRef.current = null;
    }
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    applyFloorLight(props.feesBp);
    handleRef.current?.update({
      slips: props.slips,
      desks: props.desks,
      feesBp: props.feesBp,
      payoutText: props.payoutText,
      settled: props.settled,
    });
  }, [props.slips, props.desks, props.feesBp, props.payoutText, props.settled]);

  return <canvas ref={canvasRef} className="scene" role="img" aria-label={props.label} />;
}
