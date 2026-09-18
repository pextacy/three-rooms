/**
 * One thing only: stop jsdom shouting about a canvas nobody asked it to draw.
 *
 * jsdom does not implement `HTMLCanvasElement.prototype.getContext`, and rather
 * than returning null it logs a multi-line "Error: Not implemented" with a full
 * stack through its virtual console. Every UI spec mounts a game, every game
 * mounts a canvas, so `npm test` printed fifteen of those in red — while all 553
 * tests passed. A suite that looks broken and is not teaches a reader to stop
 * reading it, and this suite is meant to be run by a stranger.
 *
 * Returning null is what the code already handles and what a browser without a
 * 2D context would do: `mountFloor`/`mountScene`/`mountRoads` throw, the mount
 * effect catches, and the `<canvas>` stays in the tree with its role and label.
 * So this changes no path — it only stops the narration.
 *
 * It does NOT cost canvas coverage. What the rooms actually draw is checked by
 * `npm run frame-budget`, which runs every reachable state of all three games
 * through a recording context and measures the frames; jsdom was never where
 * that happened.
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function getContext() {
    return null;
  } as HTMLCanvasElement['getContext'];
}
