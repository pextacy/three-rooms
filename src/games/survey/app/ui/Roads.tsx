/**
 * Mounts the one canvas and keeps the DOM lit by the SAME light model.
 *
 * There is one light model, not two. The canvas draws the roads; the controls
 * and the accessible text are DOM, and their colours come from CSS custom
 * properties written from `paletteAtWax` at this game's own level — the premium
 * ladder. So the desk dims with the day rather than floating above it in a fixed
 * palette.
 *
 * If the browser has no 2D context the scene is skipped and the page still
 * works: the accessible layer carries everything (claude.md — no information is
 * carried by colour alone).
 */
import { useEffect, useRef } from 'react';
import { mountRoads, levelFor, type Manifest, type RoadsHandle } from '../render/roads';
import { paletteAtWax, css, type InkName } from '../../../../shared/render/light';

export type RoadsProps = {
  readonly surveys: number;
  readonly margin: number;
  readonly manifest: Manifest | null;
  readonly surveyorOut: boolean;
  readonly payoutText: string | null;
  readonly settled: boolean;
  readonly wasSound: boolean | null;
  readonly label: string;
};

/** Writes the palette for a premium level onto the document root. */
export function applyRoomLight(levelBp: number, root: HTMLElement | null = document.documentElement): void {
  if (!root) return;
  const palette = paletteAtWax(levelBp);
  for (const name of Object.keys(palette) as InkName[]) {
    root.style.setProperty(`--${name}`, css(palette[name]));
  }
  root.style.setProperty('--wax', String(levelBp / 10_000));
}

export function Roads(props: RoadsProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const handleRef = useRef<RoadsHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      handleRef.current = mountRoads(canvas);
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
    applyRoomLight(levelFor(props.surveys));
    handleRef.current?.update({
      surveys: props.surveys,
      margin: props.margin,
      manifest: props.manifest,
      surveyorOut: props.surveyorOut,
      payoutText: props.payoutText,
      settled: props.settled,
      wasSound: props.wasSound,
    });
  }, [props.surveys, props.margin, props.manifest, props.surveyorOut, props.payoutText, props.settled, props.wasSound]);

  return (
    // `role="img"` with a label rather than `aria-hidden`: the scene carries real
    // information (how many surveys, which way they went), and the readout beside
    // it repeats the same facts in text. Neither is the only source.
    <canvas ref={canvasRef} className="scene" role="img" aria-label={props.label} />
  );
}
