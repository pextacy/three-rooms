/**
 * Where the DOM readout actually begins, as a fraction of the canvas height.
 *
 * Every scene reserves a band at the bottom of its canvas for the block of
 * words that sits over it — the lot on the table, the voyage on offer, the
 * claim in your hand. That band was a FIXED fraction, and a fraction cannot
 * know how tall the block is: it depends on how the words wrap, which depends
 * on the width and on the type scale. Both moved, and each time the scenes went
 * back to drawing lecterns and price slips straight through the text.
 *
 * So the scene stops guessing and asks. The readout is the canvas's sibling in
 * `.stage`, and it is bottom-aligned there, so its height is the whole answer.
 *
 * Returns the fallback when there is nothing to measure — a server, a test, or
 * a browser mid-layout — so a scene always has a number it can lay out against.
 */
export function readoutTopOf(canvas: HTMLCanvasElement, fallback: number): number {
  const readout = canvas.parentElement?.querySelector<HTMLElement>('.readout');
  const height = canvas.clientHeight;
  if (!readout || height <= 0) return fallback;

  const measured = 1 - readout.offsetHeight / height;
  if (!Number.isFinite(measured)) return fallback;
  /*
   * Floored at 0.58. In the gallery's 420px cartridge the block of words is
   * nearly half the canvas, and a scene given the top 45% to stand in is not a
   * room any more — the board compressed to a strip and the floor's lecterns
   * piled onto the text anyway. The scene keeps a usable stage, and whatever
   * ends up behind the words is covered by the ground the readout carries.
   */
  return Math.max(0.58, Math.min(0.94, measured));
}
