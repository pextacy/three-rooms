/**
 * Mounts the one canvas (docs.md §6.1) and keeps the DOM lit by the SAME light
 * model.
 *
 * There is one light model, not two. The canvas draws the scene; the controls
 * and the accessible text are DOM, and their colours come from CSS custom
 * properties written from `paletteAtWax` on every change. So the buttons dim
 * with the room rather than floating above it in a fixed palette.
 *
 * If the browser has no 2D context the scene is skipped and the page still
 * works: the accessible layer carries everything (claude.md — no information is
 * carried by colour alone).
 */
import { useEffect, useRef } from 'react';
import { mountScene, type LotFace, type SceneHandle } from '../render/scene';
import { paletteAtWax, css, type InkName } from '../render/light';
import { waxBpAt } from '../game/wax';

export type SceneProps = {
  readonly inch: number;
  readonly lot: LotFace | null;
  readonly burnedLot: LotFace | null;
  readonly payoutText: string | null;
  readonly settled: boolean;
  readonly label: string;
};

/** Writes the palette for `waxBp` onto the document root as CSS variables. */
export function applySceneLight(waxBp: number, root: HTMLElement | null = document.documentElement): void {
  if (!root) return;
  const palette = paletteAtWax(waxBp);
  for (const name of Object.keys(palette) as InkName[]) {
    root.style.setProperty(`--${name}`, css(palette[name]));
  }
  root.style.setProperty('--wax', String(waxBp / 10_000));
}

export function Scene(props: SceneProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<SceneHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      handleRef.current = mountScene(canvas);
    } catch {
      // No 2D context — jsdom, or a browser with canvas disabled. The
      // accessible layer below still carries the whole game.
      handleRef.current = null;
    }
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, []);

  useEffect(() => {
    applySceneLight(waxBpAt(props.inch));
    handleRef.current?.update({
      inch: props.inch,
      lot: props.lot,
      burnedLot: props.burnedLot,
      payoutText: props.payoutText,
      settled: props.settled,
    });
  }, [props.inch, props.lot, props.burnedLot, props.payoutText, props.settled]);

  return (
    // `role="img"` with a label rather than `aria-hidden`: the scene carries real
    // information (which inch, which lot), and the readout beside it repeats the
    // same facts in text. Neither is the only source.
    <canvas ref={canvasRef} className="scene" role="img" aria-label={props.label} />
  );
}
