/**
 * The door.
 *
 * Lloyd's List was a printed sheet posted in the room, and that is what this is:
 * paper takes ink, not light, so the type is iron-gall dark and the only glowing
 * things on the page are the three rooms cut through it. That inversion is the
 * whole design — everything a player sees afterwards is a dark room, and the one
 * place that is not is the page that sends them there.
 *
 * What changed is the SCALE of it. The three rooms used to be 4:3 thumbnails
 * above three paragraphs of provenance, a table of figures each, and a colophon
 * about verification: an inversion stated at postcard size and then buried under
 * the text it was supposed to replace. Now the cuts are half the viewport and
 * they are the only thing on the page, and every paragraph they used to sit on
 * top of has its own page — `/<slug>/about/`, four leaves of `/<slug>/how/`, and
 * `/verify/`.
 *
 * A door, not a casino. It lists the rooms and lets you into them, and that is
 * all it is allowed to do: **no balance, no deposit, no wallet**. Inside
 * chain.wtf the host owns every one of those (`docs.md` §4.1, `claude.md` §7),
 * and a game origin that asks for money is the exact shape of a phishing page.
 *
 * It carries no jam widget either: the widget marks an ENTRY, and this is not
 * one. Neither are the pages it links to.
 */
import { useEffect, useRef, useState } from 'react';
import { GAMES } from './catalogue';
import { ATTENDED, UNATTENDED, drawWindow, restingLevel, type WindowId } from './windows';
import { COPY } from './copy';

/** The room fades up over this long on load. One animation, and it is lighting. */
const LIGHTING_MS = 900;
/** Each room is lit after the one before it, as though someone walked the row. */
const STAGGER_MS = 170;
/**
 * How fast a room answers attention, as an exponential time constant rather
 * than a duration — so the easing is identical whatever the frame rate, and a
 * pointer swept across all three leaves no room stranded mid-ladder.
 */
const ANSWER_TAU_MS = 130;
/** Below this many basis points from target, the ladder has arrived. */
const SETTLED_BP = 8;

/** Where a room stands while `attended` is whatever it is. */
function levelFor(id: WindowId, attended: WindowId | null): number {
  if (attended === null) return restingLevel(id);
  return attended === id ? ATTENDED : UNATTENDED;
}

/**
 * One room, seen through the sheet.
 *
 * Two axes, and they compose. `lit` is the page-load sequence, 0 → 1 once.
 * `level` is where the room stands on its own wax ladder, and it is what the
 * pointer and the keyboard move — the same ladder the games dim along and
 * `npm run verify:light` checks, run upwards.
 */
function Cut({ id, delayMs, attended }: { id: WindowId; delayMs: number; attended: WindowId | null }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const level = useRef(restingLevel(id));
  const target = useRef(restingLevel(id));
  const lit = useRef(0);
  const running = useRef(false);

  target.current = levelFor(id, attended);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let frame = 0;
    let started: number | null = null;
    let last: number | null = null;

    const paint = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawWindow(ctx, width, height, id, lit.current, level.current);
    };

    /**
     * Reduced motion removes the ANIMATION, not the feedback: the room still
     * answers, it simply arrives at once. Which room you are pointed at is
     * information the page is carrying in light, and withholding it would be a
     * worse page rather than a gentler one.
     */
    const step = (now: number) => {
      running.current = true;
      started ??= now;
      const dt = last === null ? 16 : Math.min(now - last, 64);
      last = now;

      if (reduced) {
        lit.current = 1;
        level.current = target.current;
      } else {
        const elapsed = now - started - delayMs;
        // Ease out: a wick takes hold quickly and then settles.
        const t = Math.max(0, Math.min(1, elapsed / LIGHTING_MS));
        lit.current = 1 - (1 - t) ** 3;
        level.current += (target.current - level.current) * (1 - Math.exp(-dt / ANSWER_TAU_MS));
      }

      paint();

      const settling = Math.abs(target.current - level.current) > SETTLED_BP;
      if (lit.current < 1 || settling) {
        frame = requestAnimationFrame(step);
      } else {
        level.current = target.current;
        running.current = false;
        last = null;
      }
    };

    frame = requestAnimationFrame(step);
    const onResize = () => paint();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      running.current = false;
      window.removeEventListener('resize', onResize);
    };
  }, [id, delayMs]);

  // The loop parks itself once the ladder has arrived; a change of attention is
  // what starts it again.
  useEffect(() => {
    if (running.current) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let frame = 0;
    let last: number | null = null;
    const step = (now: number) => {
      running.current = true;
      const dt = last === null ? 16 : Math.min(now - last, 64);
      last = now;
      level.current += (target.current - level.current) * (1 - Math.exp(-dt / ANSWER_TAU_MS));
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width > 0 && height > 0) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawWindow(ctx, width, height, id, lit.current, level.current);
      }
      if (Math.abs(target.current - level.current) > SETTLED_BP) {
        frame = requestAnimationFrame(step);
      } else {
        level.current = target.current;
        running.current = false;
      }
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      running.current = false;
    };
  }, [attended, id]);

  return <canvas className="room__cut" ref={ref} aria-hidden="true" />;
}

export function Lobby() {
  // The masthead rule draws itself across on load. Held in state rather than CSS
  // so it cannot run before the fonts settle and jump.
  const [ruled, setRuled] = useState(false);
  const [attended, setAttended] = useState<WindowId | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setRuled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="door">
      <header className="masthead">
        <p className="masthead__dateline">{COPY.dateline}</p>
        <hr className={`masthead__rule${ruled ? ' is-drawn' : ''}`} />
        <h1 className="masthead__title">
          {COPY.titleLead}
          <em className="masthead__em">{COPY.titleEm}</em>
        </h1>
        <p className="masthead__lede">{COPY.lede}</p>
      </header>

      <ol className="rooms" aria-label={COPY.windowsLabel}>
        {GAMES.map((game, i) => (
          <li
            className="room"
            key={game.slug}
            data-room={game.room}
            data-attended={attended === game.room ? 'true' : undefined}
            onPointerEnter={() => setAttended(game.room)}
            onPointerLeave={() => setAttended(current => (current === game.room ? null : current))}
            onFocus={() => setAttended(game.room)}
            onBlur={() => setAttended(current => (current === game.room ? null : current))}
          >
            <a className="room__door" href={`/${game.slug}/`}>
              <Cut id={game.room} delayMs={i * STAGGER_MS} attended={attended} />
              <span className="room__plate">
                <span className="room__primitive">{game.primitive}</span>
                <span className="room__title">
                  <span className="room__name">{game.name}</span>
                  <span className="room__go">{COPY.enter}</span>
                </span>
              </span>
            </a>

            <p className="room__line">{game.line}</p>

            {/*
              The literature the shape comes from. It is the whole claim this
              door makes — that these are known decision problems rather than a
              theme over a coin flip — and it was sitting unused in the
              catalogue while the card showed nothing but a percentage.
            */}
            <p className="room__source">{game.source}</p>

            <dl className="room__figures">
              <div>
                <dt>{COPY.figureRtp}</dt>
                <dd className="room__rtp-value">{game.rtp}</dd>
              </div>
              <div>
                <dt>{COPY.figureMax}</dt>
                <dd>{game.maxPayout}</dd>
              </div>
            </dl>

            <p className="room__lit">
              {COPY.litPrefix} {game.lit}
            </p>

            <p className="room__aside">
              <a className="room__aside-link" href={`/${game.slug}/about/`}>
                {COPY.about}
              </a>
              <a className="room__aside-link" href={`/${game.slug}/how/`}>
                {COPY.how}
              </a>
            </p>
          </li>
        ))}
      </ol>

      <p className="foot">
        <span className="foot__lead">{COPY.footLead}</span>
        <a className="foot__link" href="/verify/">
          {COPY.footLink}
        </a>
      </p>
    </div>
  );
}
