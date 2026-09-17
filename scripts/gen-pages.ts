/**
 * `npm run gen:pages` — writes every page on this origin that is not a game.
 *
 * There are sixteen of them and none is a scroll:
 *
 *   /verify/              how every figure on the site is made, and checked
 *   /<slug>/about/        the threshold — what this room is, and why it is not a clone
 *   /<slug>/how/          leaf i of four: the problem
 *   /<slug>/how/table/    leaf ii: what is on the table
 *   /<slug>/how/band/     leaf iii: what other ways of playing return
 *   /<slug>/how/check/    leaf iv: how to check it
 *
 * They were one page each until they were four, and the reason is the same one
 * that emptied the door: a player who wants to play should not scroll past a
 * derivation, and a judge who wants the derivation should not have to find it
 * three screens under a paytable. The four leaves are a SEQUENCE — you cannot
 * read the band before you know what is on the table — which is the only thing
 * that earns them numerals.
 *
 * They are GENERATED, static, and carry no JavaScript at all. Three reasons,
 * in order of how much they matter:
 *
 *  1. **No number on them is typed.** Every figure comes out of that game's own
 *     dynamic program at build time, in exact rationals, exactly as `gen:readme`
 *     does it. Retune a manifest and these pages move with it or CI fails.
 *  2. A document does not need a framework. Zero JS keeps them off the bundle
 *     budget and makes them open instantly.
 *  3. They are not entries. No jam widget, no manifest, no metrics — the widget
 *     marks a submission and these are not submitted.
 *
 * They are written into `public/`, which Vite copies verbatim, so they are
 * served at the paths above in dev and in production alike.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GAMES, type GameEntry } from '../src/lobby/catalogue';
import { COPY, LEAF, VERIFY } from '../src/lobby/copy';
import { accentFor, SHEET } from '../src/lobby/accents';
import { CANDLELIGHT, DAYLIGHT, LAMPLIGHT, LEVEL_FULL, css, paletteAtWax, type Room } from '../src/shared/render/light';
import * as R from '../src/shared/math/rational';

// --- CANDLE ----------------------------------------------------------------
import { LOTS, WEIGHT_DENOM as CANDLE_WEIGHT, FACE_DENOM } from '../src/games/candle/core/paytable';
import { WAX_BP, INCHES } from '../src/games/candle/core/wax';
import {
  solve as solveCandle,
  strategyBand as candleBand,
  optimalPolicy as candleOptimal,
  evaluate as evaluateCandle,
  probabilityOfNothing,
  meanRoundLength,
} from '../src/games/candle/core/solve';

// --- THE SURVEY ------------------------------------------------------------
import {
  CARGOES,
  WEIGHT_DENOM as SURVEY_WEIGHT,
  VALUE_DENOM,
  MAX_SURVEYS,
  PREMIUM_BP,
  PREMIUM_DENOM,
  DECLINE_BP,
  PRIOR_SOUND_NUM,
  PRIOR_SOUND_DEN,
  ACCURACY_NUM,
  ACCURACY_DEN,
} from '../src/games/survey/core/vessel';
import {
  solve as solveSurvey,
  strategyBand as surveyBand,
  optimalPolicy as surveyOptimal,
  evaluate as evaluateSurvey,
  meanSurveys,
} from '../src/games/survey/core/solve';

// --- THE BROKERS -----------------------------------------------------------
import {
  HOUSE,
  BROKER_LIST,
  WEIGHT_DENOM as BROKER_WEIGHT,
  PRICE_DENOM,
  TOTAL_FEES_BP,
  MAX_PAYOUT_BP,
} from '../src/games/brokers/core/market';
import { reservationPrice, meanPrice, askingOrder } from '../src/games/brokers/core/weitzman';
import {
  solve as solveBrokers,
  strategyBand as brokersBand,
  optimalPolicy as brokersOptimal,
  evaluate as evaluateBrokers,
  roundShape,
  takeValue,
} from '../src/games/brokers/core/solve';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..');

const ROOMS: Record<GameEntry['room'], Room> = { candle: CANDLELIGHT, roads: DAYLIGHT, floor: LAMPLIGHT };

/** HTML-escape. Every string on these pages goes through it. */
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Row = readonly string[];

type Section = {
  readonly head: string;
  /** One or more paragraphs, already plain text. */
  readonly body?: readonly string[];
  readonly table?: { readonly columns: Row; readonly rows: readonly Row[]; readonly numeric?: readonly number[] };
  /** Label / value pairs, set as a run of small figures. */
  readonly facts?: ReadonlyArray<readonly [string, string]>;
  /** The rules of the game, one sentence per line, set as a rule block. */
  readonly rules?: readonly string[];
  /** A command and what it prints. Set as a list, never a table — a command
   *  broken across two lines is a command nobody can copy. */
  readonly commands?: ReadonlyArray<readonly [string, string]>;
};

/** One of the four leaves of a game's `how` sequence. */
type Leaf = {
  /** The path segment under `how/`. The first leaf has none: it IS `how/`. */
  readonly at: string;
  /** What the gathering mark calls it — the game's own word, not a category. */
  readonly nav: string;
  /** The leaf's own title, set as the page head. */
  readonly head: string;
  readonly sections: readonly Section[];
};

type Book = {
  readonly game: GameEntry;
  /** The one number, and the fraction under it. */
  readonly headline: { readonly value: string; readonly label: string; readonly exact: string };
  readonly leaves: readonly [Leaf, Leaf, Leaf, Leaf];
};

// ---------------------------------------------------------------------------
//  The document
// ---------------------------------------------------------------------------

/**
 * One stylesheet for all sixteen, written to `public/how.css` and linked
 * rather than inlined.
 *
 * Inlining it cost a copy of the type system per page to say the same thing
 * sixteen times over. These are documents, not the game pages — the 400 ms
 * cold-open budget is theirs, not these — so one cached request is the right
 * trade, and it means the type system has one home instead of copies that can
 * drift.
 *
 * What stays per-page is only what differs: the four room colours, written into
 * a short inline block so the rail paints on the first frame with no second
 * round trip.
 */
const STYLE = String.raw`
/*
  Generated by scripts/gen-pages.ts — do not edit.

  The door's own paper, set as a leaf of the ledger rather than as its front.
  Class selectors only: a type selector inside a class selector outranks a plain
  class, and that is how the one number this page exists to show once got
  quietly shrunk.

  The same line the door holds is held here: light belongs inside a room and ink
  belongs on paper. So the rail at the top of every page is the room you are at
  the threshold of — its own ink, under its own light — and the moment the page
  becomes a document it becomes paper, and stays paper to the foot.
*/
*, *::before, *::after { box-sizing: border-box; }

:root {
  --sheet: SHEET_HEX;
  --sheet-deep: #c8c2b3;
  --sheet-edge: #b6af9e;
  --iron: #17140f;
  --iron-soft: #4d463a;
  --font: ui-serif, 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
  --font-num: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  --column: min(58rem, 100% - clamp(2.5rem, 10vw, 6rem));
  --wide: min(76rem, 100% - clamp(2.5rem, 10vw, 6rem));
}

html, body { margin: 0; background: var(--sheet); }

body {
  color: var(--iron);
  font-family: var(--font);
  font-size: 1rem;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  background-image:
    repeating-linear-gradient(90deg, rgb(23 20 15 / 0.012) 0 1px, transparent 1px 7px),
    repeating-linear-gradient(0deg, rgb(23 20 15 / 0.01) 0 1px, transparent 1px 34px);
}

.doc { display: grid; grid-template-columns: 1fr var(--column) 1fr; row-gap: clamp(2rem, 5.5vh, 3.25rem); padding-bottom: clamp(3rem, 10vh, 6rem); }

/*
  min-width: 0 on every child, and minmax(0, 1fr) on every single-column grid
  below them.

  A grid item's automatic minimum size is its max-content contribution, so ONE
  wide table — or one canvas, or one unbroken fraction — sizes the track it is
  in to itself and drags the whole column off the right of a phone. It is not
  the table that looks broken when that happens: it is the masthead, the
  gathering marks and the running head, all of which are suddenly laid out in a
  column 700px wide inside a 390px screen. The scroller can only scroll what is
  allowed to be narrower than its contents.
*/
.doc > * { grid-column: 2; min-width: 0; }

/* --- the rail: the room, at the threshold ------------------------------- */

/*
  The page begins IN the room and comes out onto paper. The rail is that game's
  own ink with its own light over it — the same two colours the canvas on the
  door is drawn from, so the header cannot drift from the game it introduces.
*/
.rail {
  grid-column: 1 / -1;
  background: var(--room-ink);
  background-image: radial-gradient(95% 105% at 50% 0%, var(--room-light) 0%, transparent 68%);
  display: grid;
  grid-template-columns: 1fr var(--column) 1fr;
  padding-block: clamp(1rem, 3vh, 1.5rem) clamp(1.5rem, 5vh, 2.5rem);
}
.rail__inner { grid-column: 2; min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 0.85rem; }

/*
  The threshold. On /<slug>/about/ the room is not a header strip, it is the
  page you are standing in before you go through — so it takes half the viewport
  and carries nothing but the name and the pitch. Every figure waits for paper.
*/
.rail--threshold { padding-block: clamp(1rem, 3vh, 1.5rem) clamp(1.5rem, 5vh, 2.5rem); min-height: min(58vh, 32rem); align-content: space-between; row-gap: clamp(2rem, 8vh, 4rem); }
.rail--threshold .rail__inner { align-content: start; }

.crumbs { display: flex; flex-wrap: wrap; gap: 0.5rem 1.5rem; justify-content: space-between; align-items: baseline; font-family: var(--font-num); font-size: 0.6875rem; letter-spacing: 0.2em; text-transform: uppercase; }
.crumbs__back { color: var(--room-money); text-decoration: none; border-bottom: 1px solid transparent; }
.crumbs__back:hover, .crumbs__back:focus-visible { border-bottom-color: currentColor; }
.crumbs__date { color: rgb(255 255 255 / 0.42); }
.crumbs__play { color: var(--room-text); text-decoration: none; border-bottom: 1px solid var(--room-money); }
.crumbs__play:hover, .crumbs__play:focus-visible { color: var(--room-money); }

.eyebrow { margin: 0; font-family: var(--font-num); font-size: 0.6875rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--room-money); }
.title { margin: 0; font-size: clamp(2.1rem, 7vw, 4.25rem); font-weight: 400; line-height: 0.96; letter-spacing: -0.024em; color: var(--room-text); }
.pitch { margin: 0; max-width: 42rem; font-size: 1.125rem; line-height: 1.6; text-wrap: pretty; color: rgb(255 255 255 / 0.7); }
.lit { grid-column: 2; margin: 0; padding-top: 0.7rem; border-top: 1px solid rgb(255 255 255 / 0.13); font-family: var(--font-num); font-size: 0.6875rem; letter-spacing: 0.12em; color: rgb(255 255 255 / 0.45); }

/* --- the gathering marks ------------------------------------------------ */

/*
  Four leaves, and which one you are on. It is a nav and a progress mark in one
  element, which is the only reason it may be numbered at all: the leaves are a
  real sequence, so the order carries something a reader needs. The numerals are
  Roman because a folio in 1728 is, and because 01 / 02 / 03 is what a generated
  page marks a list with whether or not the list has an order.
*/
.folio { margin: 0; }
.folio__leaves { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0 clamp(0.5rem, 2vw, 1.5rem); }
.folio__leaf { display: grid; grid-template-columns: minmax(0, 1fr); }
.folio__link { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 0.3rem; padding-top: 0.6rem; border-top: 1px solid var(--sheet-edge); text-decoration: none; color: var(--iron-soft); }
.folio__leaf--here .folio__link { border-top: 2px solid var(--accent); color: var(--iron); padding-top: calc(0.6rem - 1px); }
.folio__num { font-family: var(--font-num); font-size: 0.6875rem; letter-spacing: 0.16em; text-transform: uppercase; }
.folio__leaf--here .folio__num { color: var(--accent); }
.folio__name { font-size: 0.875rem; line-height: 1.3; }
.folio__link:hover, .folio__link:focus-visible { color: var(--iron); border-top-color: var(--iron); }

/* --- the leaf ----------------------------------------------------------- */

.leaf { margin: 0; font-size: clamp(1.6rem, 4vw, 2.3rem); font-weight: 400; line-height: 1.08; letter-spacing: -0.018em; text-wrap: balance; max-width: 22ch; }

/* The one number, set as an object. */
.headline { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem 1.5rem; padding-top: clamp(1rem, 3vh, 1.5rem); border-top: 2px solid var(--iron); }
.headline__value { font-family: var(--font-num); font-size: clamp(2.4rem, 8vw, 3.75rem); font-variant-numeric: tabular-nums; letter-spacing: -0.03em; line-height: 1; color: var(--accent); }
.headline__label { font-family: var(--font-num); font-size: 0.6875rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--iron-soft); }
.headline__exact { width: 100%; margin: 0; font-family: var(--font-num); font-size: 0.8125rem; color: var(--iron-soft); }

.section { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 0.9rem; }
.section__head { margin: 0; font-family: var(--font-num); font-size: 0.6875rem; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); }
.section__body { margin: 0; max-width: 42rem; line-height: 1.68; }

/*
  The rules, set the way a rule is posted rather than the way a paragraph is
  set: one sentence per line, hung off a rule in the room's own ink. A player
  who reads nothing else on the page can play from this block.
*/
.rules { margin: 0; padding: 0 0 0 clamp(0.9rem, 3vw, 1.5rem); border-left: 2px solid var(--accent); display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 0.5rem; }
.rules__line { margin: 0; font-size: 1.0625rem; line-height: 1.5; text-wrap: pretty; }

.facts { margin: 0; display: flex; flex-wrap: wrap; gap: 0.9rem 2.5rem; }
.facts__pair { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 0.1rem; }
.facts__label { font-family: var(--font-num); font-size: 0.625rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--iron-soft); }
.facts__value { margin: 0; font-family: var(--font-num); font-size: 1.0625rem; font-variant-numeric: tabular-nums; }

.scroller { min-width: 0; overflow-x: auto; }
.grid { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.grid__head { font-family: var(--font-num); font-size: 0.625rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--iron-soft); text-align: left; font-weight: 400; padding: 0 1.25rem 0.5rem 0; border-bottom: 1px solid var(--iron); white-space: nowrap; }
.grid__cell { padding: 0.5rem 1.25rem 0.5rem 0; border-bottom: 1px solid var(--sheet-edge); vertical-align: baseline; }
.grid__cell--num { font-family: var(--font-num); font-variant-numeric: tabular-nums; white-space: nowrap; }
.grid__head--num { text-align: left; }

.commands { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.45rem 1.25rem; align-items: baseline; }
.commands__row { display: contents; font-size: 0.8125rem; }
.commands__code { font-family: var(--font-num); font-size: 0.8125rem; padding: 0.15rem 0.45rem; background: var(--sheet-deep); white-space: nowrap; }
.commands__what { font-size: 0.875rem; color: var(--iron-soft); }

/* --- the way on --------------------------------------------------------- */

.exits { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
.play { display: inline-block; padding: 0.85rem 1.75rem; font-size: 0.75rem; letter-spacing: 0.18em; text-transform: uppercase; text-decoration: none; color: var(--sheet); background: var(--accent); }
.play:hover, .play:focus-visible { filter: brightness(0.86); }
.read { display: inline-block; padding: 0.85rem 1.75rem; font-size: 0.75rem; letter-spacing: 0.18em; text-transform: uppercase; text-decoration: none; color: var(--iron); border: 1px solid var(--sheet-edge); }
.read:hover, .read:focus-visible { border-color: var(--iron); }

/*
  Turning the leaf. Set as two facing pages with the rule between them, because
  that is what the reader is actually doing and a pair of chevrons in a pill is
  not.
*/
.turn { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 clamp(1rem, 4vw, 2.5rem); padding-top: clamp(1rem, 3vh, 1.5rem); border-top: 2px solid var(--iron); }
.turn__side { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 0.25rem; text-decoration: none; color: var(--iron); align-content: start; }
.turn__side--next { text-align: right; }
.turn__dir { font-family: var(--font-num); font-size: 0.625rem; letter-spacing: 0.18em; text-transform: uppercase; color: var(--iron-soft); }
.turn__name { font-size: 1.0625rem; line-height: 1.3; border-bottom: 1px solid transparent; justify-self: start; }
.turn__side--next .turn__name { justify-self: end; }
.turn__side:hover .turn__name, .turn__side:focus-visible .turn__name { border-bottom-color: var(--accent); }

/* --- /verify/ ----------------------------------------------------------- */

/*
  Three declared returns, side by side, each in its own room's ink. It is the
  only place on the site where the three palettes meet, and it is the right one:
  the page exists to be compared against.
*/
.ledger { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: clamp(1rem, 3vw, 2rem); }
.ledger__row { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 0.4rem; align-content: start; padding-top: 0.85rem; border-top: 2px solid var(--accent); }
.ledger__name { font-family: var(--font-num); font-size: 0.6875rem; letter-spacing: 0.18em; text-transform: uppercase; }
.ledger__name-link { color: var(--iron); text-decoration: none; border-bottom: 1px solid transparent; }
.ledger__name-link:hover, .ledger__name-link:focus-visible { border-bottom-color: var(--accent); }
.ledger__value { font-family: var(--font-num); font-size: clamp(1.5rem, 3.5vw, 2rem); font-variant-numeric: tabular-nums; letter-spacing: -0.025em; line-height: 1; color: var(--accent); }
.ledger__exact { margin: 0; font-family: var(--font-num); font-size: 0.75rem; line-height: 1.5; color: var(--iron-soft); word-break: break-all; }

:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

@media (max-width: 52rem) {
  .folio__leaves { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem clamp(0.5rem, 2vw, 1.5rem); }
  .ledger { grid-template-columns: minmax(0, 1fr); }
}

@media (max-width: 40rem) {
  .grid { font-size: 0.8125rem; }
  .commands { grid-template-columns: minmax(0, 1fr); gap: 0.2rem; }
  .commands__row { display: grid; row-gap: 0.2rem; }
  .commands__code { justify-self: start; }
  .turn { grid-template-columns: minmax(0, 1fr); row-gap: 1.25rem; }
  .turn__side--next { text-align: left; }
  .turn__side--next .turn__name { justify-self: start; }
}
`;

/**
 * The stylesheet, as it is served.
 *
 * The comments above are the design, and they live in this file where they can
 * be read next to the code that writes them — but a served stylesheet is a
 * build artifact, and every byte of prose in it is a byte on the wire that the
 * reader of the design will never see. So the source keeps them and the output
 * does not, the same trade every other generated file here makes.
 */
function squeeze(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{}:;,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/\s+/g, ' ')
    .trim();
}

function table(spec: NonNullable<Section['table']>): string {
  const numeric = new Set(spec.numeric ?? []);
  const head = spec.columns
    .map((c, i) => `<th class="grid__head${numeric.has(i) ? ' grid__head--num' : ''}" scope="col">${esc(c)}</th>`)
    .join('');
  const body = spec.rows
    .map(
      row =>
        `<tr>${row
          .map((cell, i) => `<td class="grid__cell${numeric.has(i) ? ' grid__cell--num' : ''}">${esc(cell)}</td>`)
          .join('')}</tr>`,
    )
    .join('');
  return `<div class="scroller"><table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function section(s: Section): string {
  const parts = [`<h2 class="section__head">${esc(s.head)}</h2>`];
  for (const p of s.body ?? []) parts.push(`<p class="section__body">${esc(p)}</p>`);
  if (s.rules) {
    parts.push(
      `<blockquote class="rules">${s.rules.map(line => `<p class="rules__line">${esc(line)}</p>`).join('')}</blockquote>`,
    );
  }
  if (s.facts) {
    parts.push(
      `<dl class="facts">${s.facts
        .map(
          ([label, value]) =>
            `<div class="facts__pair"><dt class="facts__label">${esc(label)}</dt><dd class="facts__value">${esc(value)}</dd></div>`,
        )
        .join('')}</dl>`,
    );
  }
  if (s.commands) {
    parts.push(
      `<ul class="commands">${s.commands
        .map(
          ([command, what]) =>
            `<li class="commands__row"><code class="commands__code">${esc(command)}</code><span class="commands__what">${esc(what)}</span></li>`,
        )
        .join('')}</ul>`,
    );
  }
  if (s.table) parts.push(table(s.table));
  return `<section class="section">${parts.join('')}</section>`;
}

/** `/candle/how/table/` — the first leaf has no segment, because it IS `how/`. */
const leafHref = (slug: string, at: string) => `/${slug}/how/${at ? `${at}/` : ''}`;

/** The four gathering marks, with the one you are on inked solid. */
function folio(book: Book, index: number): string {
  const marks = book.leaves
    .map((leaf, i) => {
      const inside = `<span class="folio__num">${esc(LEAF.numerals[i] ?? String(i + 1))}</span><span class="folio__name">${esc(leaf.nav)}</span>`;
      const body =
        i === index
          ? `<span class="folio__link" aria-current="page">${inside}</span>`
          : `<a class="folio__link" href="${esc(leafHref(book.game.slug, leaf.at))}">${inside}</a>`;
      return `<li class="folio__leaf${i === index ? ' folio__leaf--here' : ''}">${body}</li>`;
    })
    .join('');
  return `<nav class="folio" aria-label="${esc(`${book.game.name} — ${LEAF.running}`)}"><ol class="folio__leaves">${marks}</ol></nav>`;
}

/** Back one leaf and on one leaf. The ends of the sequence turn out of it. */
function turn(book: Book, index: number): string {
  const { slug, name } = book.game;
  const numeral = (i: number) => LEAF.numerals[i] ?? String(i + 1);

  const back =
    index === 0
      ? { href: `/${slug}/about/`, label: LEAF.toAbout }
      : { href: leafHref(slug, book.leaves[index - 1]!.at), label: `${numeral(index - 1)} · ${book.leaves[index - 1]!.nav}` };

  const on =
    index === book.leaves.length - 1
      ? { href: `/${slug}/`, label: `${COPY.play} ${name}` }
      : { href: leafHref(slug, book.leaves[index + 1]!.at), label: `${numeral(index + 1)} · ${book.leaves[index + 1]!.nav}` };

  return `<nav class="turn">
        <a class="turn__side turn__side--prev" href="${esc(back.href)}"><span class="turn__dir">${esc(LEAF.prev)}</span><span class="turn__name">${esc(back.label)}</span></a>
        <a class="turn__side turn__side--next" href="${esc(on.href)}"><span class="turn__dir">${esc(LEAF.next)}</span><span class="turn__name">${esc(on.label)}</span></a>
      </nav>`;
}

/** Only what a room does not share with the other two. */
/**
 * The four colours a room is set in, as a CSS rule.
 *
 * They used to be written into an inline block on every page, on the reasoning
 * that the rail would then paint on the first frame. It would not: the rail
 * needs `.rail` from the stylesheet before it is a rail at all, so the inline
 * block bought nothing and cost a copy of the palette on sixteen documents.
 * They are a `[data-room]` rule in `how.css` now, which is also where the door
 * keeps its three, and the page says which room it is in on the html element.
 */
function roomRule(room: GameEntry['room']): string {
  const lit = paletteAtWax(LEVEL_FULL, ROOMS[room]);
  const vars = [
    `--accent:${css(accentFor(ROOMS[room]))}`,
    `--room-ink:${css(lit.ink)}`,
    `--room-light:rgb(${lit.tallow.r} ${lit.tallow.g} ${lit.tallow.b}/0.16)`,
    `--room-money:${css(lit.brass)}`,
    `--room-text:${css(lit.tallow)}`,
  ].join(';');
  return `[data-room='${room}']{${vars}}`;
}

/**
 * `/verify/` is in no room. It is the paper the whole site is printed on, so
 * its rail is iron rather than a fourth light nobody lit.
 */
const IRON_ROOM = "[data-room='none']{--accent:#17140f;--room-ink:#17140f;--room-light:rgb(216 211 199/0.1);--room-money:#d8d3c7;--room-text:#d8d3c7}";

/** What the browser chrome around the document is painted. */
function themeOf(room: GameEntry['room'] | null): string {
  return room === null ? '#17140f' : css(paletteAtWax(LEVEL_FULL, ROOMS[room]).ink);
}

/**
 * Squeeze the whitespace out of a finished document.
 *
 * These are build artifacts written sixteen times, and the gzip budget is
 * measured per FILE — so a repeated six-space indent is not deduplicated across
 * the set the way it would be inside one bundle, it is paid sixteen times.
 *
 * Only the whitespace BETWEEN tags goes. Nothing in this stylesheet lays out on
 * an inter-element text node — every row is a flex or grid container with a
 * gap — so removing it cannot move anything, and text inside an element is left
 * exactly as it was written.
 */
const tighten = (html: string): string => `${html.replace(/>\s+</g, '><').trim()}\n`;

type Doc = {
  readonly room: GameEntry['room'] | null;
  readonly title: string;
  readonly description: string;
  /** The rail. `play` is the persistent way into the room from any leaf. */
  readonly eyebrow: string;
  readonly head: string;
  readonly pitch?: string;
  readonly lit?: string;
  readonly play?: { readonly href: string; readonly label: string };
  readonly threshold?: boolean;
  readonly body: string;
};

function document_(doc: Doc): string {
  const play = doc.play
    ? `<a class="crumbs__play" href="${esc(doc.play.href)}">${esc(doc.play.label)} →</a>`
    : `<span class="crumbs__date">${esc(COPY.dateline)}</span>`;

  return tighten(`<!doctype html>
<html lang="en" data-room="${doc.room ?? 'none'}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>${esc(doc.title)}</title>
    <meta name="description" content="${esc(doc.description)}" />
    <meta name="theme-color" content="${themeOf(doc.room)}" />
    <meta property="og:title" content="${esc(doc.title)}" />
    <meta property="og:description" content="${esc(doc.description)}" />
    <!-- GENERATED by npm run gen:pages — do not edit. Not an entry: no widget, no manifest, no metrics. -->
    <link rel="stylesheet" href="/how.css" />
  </head>
  <body>
    <div class="doc">
      <div class="rail${doc.threshold ? ' rail--threshold' : ''}">
        <div class="rail__inner">
          <nav class="crumbs">
            <a class="crumbs__back" href="/">${esc(LEAF.backToList)}</a>
            ${play}
          </nav>
          <p class="eyebrow">${esc(doc.eyebrow)}</p>
          <h1 class="title">${esc(doc.head)}</h1>
          ${doc.pitch ? `<p class="pitch">${esc(doc.pitch)}</p>` : ''}
        </div>
        ${doc.lit ? `<p class="lit">${esc(doc.lit)}</p>` : ''}
      </div>

      ${doc.body}
    </div>
  </body>
</html>`);
}

// ---------------------------------------------------------------------------
//  The three books
// ---------------------------------------------------------------------------

const entry = (slug: string): GameEntry => {
  const found = GAMES.find(g => g.slug === slug);
  if (!found) throw new Error(`no catalogue entry for ${slug}`);
  return found;
};

const pct = (r: R.Rational, places = 4) => `${R.toPercent(r, places)}%`;

const CHECK_LEAF = (command: string, what: string): Leaf => ({
  at: 'check',
  nav: 'The check',
  head: 'How to check it',
  sections: [
    {
      head: 'Recomputed, not stored',
      body: [
        'Every figure in this book was recomputed when it was built, from the model in this repository, in exact BigInt fractions. Nothing here is read from a constant, and the contract is generated from the same source, so the page and the chain cannot disagree.',
      ],
      commands: [[command, what]],
    },
  ],
});

/**
 * The jam asks for a theoretical RTP inside 93–98%. For a game with a decision
 * in it there is no single such number, so every one of these pages prints the
 * whole band — and each row says for itself whether it lands in the window.
 *
 * The column is not decoration. Two of these three bands reach below the floor
 * on purpose (CANDLE's greedy player, THE SURVEY's pair who read no evidence),
 * and a table that printed those numbers under a sentence claiming everything
 * was inside would be contradicting itself in the same breath.
 */
const inJamBand = (value: R.Rational): boolean =>
  R.compare(value, R.rat(93n, 100n)) >= 0 && R.compare(value, R.rat(98n, 100n)) <= 0;

const BAND_LEAF = (head: string, body: readonly string[], rows: readonly (readonly [string, R.Rational])[]): Leaf => ({
  at: 'band',
  nav: 'The band',
  head,
  sections: [
    {
      head: 'Every published policy',
      body,
      table: {
        columns: ['How you play', 'Returns', 'Against the window'],
        numeric: [1],
        rows: rows.map(([label, value]) => [
          label,
          pct(value, 3),
          inJamBand(value) ? 'inside 93–98%' : 'outside',
        ]),
      },
    },
  ],
});

function candleBook(): Book {
  const solution = solveCandle();
  const optimal = candleOptimal(solution);
  return {
    game: entry('candle'),
    headline: { value: pct(solution.rtp), label: 'Returns, played best', exact: `Exactly ${R.toExactString(solution.rtp)}` },
    leaves: [
      {
        at: '',
        nav: 'The problem',
        head: 'A sequence of offers, under a decay',
        sections: [
          { head: 'The problem', body: [entry('candle').provenance] },
          {
            head: 'The numbers it comes out at',
            facts: [
              ['House edge', pct(R.sub(R.rat(1n), solution.rtp))],
              ['Most it pays', '25×'],
              ['Rounds that pay nothing', pct(probabilityOfNothing(optimal), 2)],
              ['Mean inches watched', R.toFixed(meanRoundLength(optimal), 3)],
            ],
          },
        ],
      },
      {
        at: 'table',
        nav: 'The table',
        head: 'The lots, and what an inch costs',
        sections: [
          {
            head: 'The lots on the table',
            table: {
              columns: ['Lot', 'Face', 'Chance'],
              numeric: [1, 2],
              rows: LOTS.map(lot => [
                lot.name,
                `${(lot.faceBp / FACE_DENOM).toFixed(2)}×`,
                `${R.toPercent(R.rat(lot.weight, CANDLE_WEIGHT), 2)}%`,
              ]),
            },
          },
          {
            head: 'And what an inch costs',
            body: [
              'The candle is the discount. Every inch that burns is worth less than the one before it, by a ladder fixed before the round begins — so waiting is never free and the decision is never about luck running out.',
            ],
            table: {
              columns: ['Inch', 'A lot claimed here is worth'],
              numeric: [0, 1],
              rows: WAX_BP.map((bp, i) => [`${i + 1} of ${INCHES}`, `${(bp / 100).toFixed(0)}% of its face`]),
            },
          },
        ],
      },
      BAND_LEAF(
        'What other ways of playing return',
        [
          'This is a game with a decision in it, so the return depends on how you play. The whole band is published, careless end included: the three rules a person would actually settle into are inside the jam’s 93–98% window, and the ones below it are the rules nobody holds — waiting out a 2.00× lot, or claiming an empty crate.',
        ],
        candleBand(solution).map(p => [p.note ? `${p.label} — ${p.note}` : p.label, evaluateCandle(p.policy)] as const),
      ),
      CHECK_LEAF('npm run verify:rtp', 'the paytable, the dynamic program over all 30 reachable states, and the declared return'),
    ],
  };
}

function surveyBook(): Book {
  const solution = solveSurvey();
  const optimal = surveyOptimal(solution);
  return {
    game: entry('survey'),
    headline: { value: pct(solution.rtp), label: 'Returns, played best', exact: `Exactly ${R.toExactString(solution.rtp)}` },
    leaves: [
      {
        at: '',
        nav: 'The problem',
        head: 'Buying evidence, until it stops being worth its price',
        sections: [
          { head: 'The problem', body: [entry('survey').provenance] },
          {
            head: 'What is hidden, and how',
            body: [
              'Every hook on this contract is view-only and holds no storage, so the whole of a session is public and so is every random word it consumes. If the ship’s condition were drawn at the start it could simply be read.',
              'So the model is factored the other way. A report is drawn from the predictive distribution, which depends only on the evidence so far and is safe to compute in the open; her condition is drawn at settlement from the posterior, out of a word that does not exist until the call is already locked in. The joint distribution is identical either way — it is the same probability model, factored so that nothing which decides the voyage exists while the player can still act on it.',
            ],
          },
        ],
      },
      {
        at: 'table',
        nav: 'The manifest',
        head: 'What she carries, and what a surveyor costs',
        sections: [
          {
            head: 'The manifest',
            table: {
              columns: ['Cargo', 'She pays', 'Chance'],
              numeric: [1, 2],
              rows: CARGOES.map(c => [
                c.name,
                `${(c.valueBp / VALUE_DENOM).toFixed(2)}×`,
                `${R.toPercent(R.rat(c.weight, SURVEY_WEIGHT), 2)}%`,
              ]),
            },
          },
          {
            head: 'The evidence, and its price',
            facts: [
              ['Ships that are sound', `${PRIOR_SOUND_NUM}/${PRIOR_SOUND_DEN}`],
              ['A surveyor is right', `${ACCURACY_NUM}/${ACCURACY_DEN}`],
              ['One report multiplies the odds by', `${ACCURACY_NUM}/${ACCURACY_DEN - ACCURACY_NUM}`],
              ['A surveyor costs', `${((PREMIUM_BP[0]! - PREMIUM_BP[1]!) / 100).toFixed(2)}% of the premium`],
              ['Surveyors available', String(MAX_SURVEYS)],
              ['Declining pays', `${(DECLINE_BP / 100).toFixed(2)}× of the premium`],
              ['Mean surveyors bought', R.toFixed(meanSurveys(optimal), 3)],
            ],
          },
          {
            head: 'The premium, as it is spent',
            table: {
              columns: ['Surveyors sent', 'Premium remaining'],
              numeric: [0, 1],
              rows: PREMIUM_BP.map((bp, i) => [String(i), `${((bp / PREMIUM_DENOM) * 100).toFixed(2)}%`]),
            },
          },
        ],
      },
      BAND_LEAF(
        'What other ways of playing return',
        [
          'Every way of BUYING EVIDENCE that this game publishes is inside the jam’s 93–98% window — from sending nobody to sending everybody. That is a stricter claim than the band alone, and it is the constraint the manifest was tuned around: sharper evidence pays the careful player out of the top of the band and drops the careless one below the bottom of it.',
          'The last two rows read no evidence at all — one takes every risk offered, the other takes none — and both fall below the window. They are printed rather than left out, because there are two decisions in this game and a band that varied only one of them was not telling you what the other one costs.',
        ],
        surveyBand(solution).map(p => [p.note ? `${p.label} — ${p.note}` : p.label, evaluateSurvey(p.policy, p.call)] as const),
      ),
      CHECK_LEAF(
        'npm run verify:survey',
        'the manifest, the belief table as exact fractions, and the dynamic program over all 126 reachable states',
      ),
    ],
  };
}

function brokersBook(): Book {
  const solution = solveBrokers();
  const optimal = brokersOptimal(solution);
  const shape = roundShape(optimal);
  const worst = takeValue((1 << BROKER_LIST.length) - 1, Math.min(...HOUSE.map(q => q.priceBp)));
  const order = askingOrder();
  return {
    game: entry('brokers'),
    headline: { value: pct(solution.rtp), label: 'Returns, played best', exact: `Exactly ${R.toExactString(solution.rtp)}` },
    leaves: [
      {
        at: '',
        nav: 'The problem',
        head: 'Buying options you can always go back to',
        sections: [
          { head: 'The problem', body: [entry('brokers').provenance] },
          {
            head: 'The rule, in full',
            body: [
              'Give every broker a reservation price z, the price at which you would not care whether you asked him: the one solving E[(X − z)⁺] = c, where X is what he might name and c is his fee. Ask in descending z, and stop the moment what you already hold beats the best remaining z.',
              'That rule is not a heuristic and not an approximation of the dynamic program. It is the dynamic program — the same choice at every one of the 120 reachable states, which is checked rather than claimed. The whole of it is printed inside the game, asking order included: this game is not selling an information edge over you, it is selling the ten seconds in which you decide whether to believe a theorem.',
              'On this floor the index order is the exact reverse of the average-price order. The broker whose prices average highest is the last one worth asking, and the one who averages worst goes first, because what an index prices is the upside, not the middle.',
            ],
          },
        ],
      },
      {
        at: 'table',
        nav: 'The floor',
        head: 'Who is on the floor, and what each one is worth asking',
        sections: [
          {
            head: 'The floor',
            table: {
              columns: ['Broker', 'Fee', 'What he names', 'Average', 'Index (z)', 'Ask'],
              numeric: [1, 3, 4, 5],
              rows: [
                [
                  'The house’s man',
                  'nothing',
                  HOUSE.map(q => `${(q.priceBp / PRICE_DENOM).toFixed(2)}× at ${R.toPercent(R.rat(q.weight, BROKER_WEIGHT), 0)}%`).join(' · '),
                  '—',
                  '—',
                  'first',
                ],
                ...BROKER_LIST.map(b => [
                  b.name,
                  `${(b.feeBp / 100).toFixed(2)}%`,
                  b.quotes.map(q => `${(q.priceBp / PRICE_DENOM).toFixed(2)}× at ${R.toPercent(R.rat(q.weight, BROKER_WEIGHT), 2)}%`).join(' · '),
                  `${R.toFixed(meanPrice(b), 4)}×`,
                  `${R.toFixed(reservationPrice(b), 4)}×`,
                  String(order.findIndex(o => o.id === b.id) + 1),
                ]),
              ],
            },
          },
          {
            head: 'The numbers',
            facts: [
              ['House edge', pct(R.sub(R.rat(1n), solution.rtp))],
              ['Most it pays', `${(MAX_PAYOUT_BP / PRICE_DENOM).toFixed(4)}×`],
              ['Least it pays', `${R.toFixed(worst, 4)}×`],
              ['All four fees together', `${(TOTAL_FEES_BP / 100).toFixed(2)}%`],
              ['Mean brokers asked', R.toFixed(shape.meanAsked, 3)],
              ['Kept the house’s own price', pct(shape.keptTheHouse, 1)],
            ],
          },
        ],
      },
      BAND_LEAF(
        'What other ways of playing return',
        [
          'Every policy this game publishes is inside the jam’s 93–98% window. The fees are what hold it there, and they work from both ends: large enough that asking everybody is a real mistake, small enough that taking the first price offered is not a disaster. There is no losing state in this game at all — the worst it can do is hand back less than you staked.',
        ],
        brokersBand(solution).map(p => [p.note ? `${p.label} — ${p.note}` : p.label, evaluateBrokers(p.policy)] as const),
      ),
      CHECK_LEAF(
        'npm run verify:brokers',
        'the market, the index checked against its own defining equation, and that Pandora’s rule is the dynamic program at all 120 reachable states',
      ),
    ],
  };
}

// ---------------------------------------------------------------------------
//  The pages, from the books
// ---------------------------------------------------------------------------

/**
 * The threshold. It carries the argument — what this room is, why it is not a
 * clone of anything, and that the mechanism it is dressed in was real — and it
 * carries the rules, so a player who reads only this page can play. It carries
 * no derivation at all: that is what the four leaves are for.
 */
function aboutPage(book: Book): string {
  const { game } = book;
  const body = `<div class="headline">
        <span class="headline__value">${esc(book.headline.value)}</span>
        <span class="headline__label">${esc(book.headline.label)}</span>
        <p class="headline__exact">${esc(book.headline.exact)}</p>
      </div>

      ${[
        { head: 'The rules', rules: game.rules },
        { head: 'Why this is not a clone of anything', body: [game.why] },
        { head: 'And why the dressing is not a costume', body: [game.dressing] },
        {
          head: 'The numbers on it',
          facts: [
            [COPY.figureRtp, book.headline.value] as const,
            [COPY.figureMax, game.maxPayout] as const,
            [COPY.figureFrom, game.source] as const,
          ],
        },
      ]
        .map(section)
        .join('\n      ')}

      <p class="exits">
        <a class="play" href="/${esc(game.slug)}/">${esc(COPY.play)} ${esc(game.name)}</a>
        <a class="read" href="${esc(leafHref(game.slug, ''))}">${esc(COPY.how)}</a>
      </p>`;

  return document_({
    room: game.room,
    title: `${game.name} — ${COPY.about.toLowerCase()}`,
    description: game.line,
    eyebrow: game.primitive,
    head: game.name,
    pitch: game.line,
    lit: `${COPY.litPrefix} ${game.lit}`,
    threshold: true,
    play: { href: `/${game.slug}/`, label: `${COPY.play} ${game.name}` },
    body,
  });
}

/** One leaf of a book. */
function leafPage(book: Book, index: number): string {
  const leaf = book.leaves[index]!;
  const { game } = book;
  // The declared return rides the first leaf as an object and every other leaf
  // as a fact in the rail, because it is the number a judge came for and a
  // sequence that hides it after page one is a sequence that loses them.
  const headline =
    index === 0
      ? `<div class="headline">
        <span class="headline__value">${esc(book.headline.value)}</span>
        <span class="headline__label">${esc(book.headline.label)}</span>
        <p class="headline__exact">${esc(book.headline.exact)}</p>
      </div>`
      : '';

  const body = `${folio(book, index)}

      <h2 class="leaf">${esc(leaf.head)}</h2>

      ${headline}

      ${leaf.sections.map(section).join('\n      ')}

      ${turn(book, index)}`;

  return document_({
    room: game.room,
    title: `${game.name} — ${leaf.head}`,
    description: `${game.name}, ${LEAF.running.toLowerCase()}, ${LEAF.numerals[index] ?? index + 1} ${LEAF.of} ${LEAF.numerals[book.leaves.length - 1]}: ${leaf.head}.`,
    eyebrow: `${LEAF.running} · ${LEAF.numerals[index] ?? index + 1} ${LEAF.of} ${LEAF.numerals[book.leaves.length - 1]}`,
    head: game.name,
    play: { href: `/${game.slug}/`, label: `${COPY.play} ${game.name}` },
    body,
  });
}

/** `/verify/` — the one argument the site actually has to win. */
function verifyPage(books: readonly Book[]): string {
  const rows = books
    .map(
      book =>
        `<li class="ledger__row" data-room="${esc(book.game.room)}">
          <p class="ledger__name"><a class="ledger__name-link" href="/${esc(book.game.slug)}/about/">${esc(book.game.name)}</a></p>
          <span class="ledger__value">${esc(book.headline.value)}</span>
          <p class="ledger__exact">${esc(book.headline.exact.replace('Exactly ', ''))}</p>
        </li>`,
    )
    .join('');

  const body = `<section class="section">
        <h2 class="section__head">${esc(VERIFY.fractionsHead)}</h2>
        <p class="section__body">${esc(VERIFY.fractionsBody)}</p>
        <ol class="ledger">${rows}</ol>
      </section>

      ${section({ head: VERIFY.commandsHead, body: [VERIFY.commandsBody], commands: VERIFY.commands })}

      ${section({ head: VERIFY.madeHead, body: [VERIFY.madeBody] })}`;

  return document_({
    room: null,
    title: `${VERIFY.title} — Chain Jam Vol. 1`,
    description: VERIFY.lede,
    eyebrow: VERIFY.eyebrow,
    head: VERIFY.title,
    pitch: VERIFY.lede,
    body,
  });
}

// ---------------------------------------------------------------------------

const books = [candleBook(), surveyBook(), brokersBook()];

const write = (parts: readonly string[], html: string, note: string): void => {
  const out = resolve(ROOT, 'public', ...parts, 'index.html');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`wrote ${out.replace(`${ROOT}/`, '')}  ${note}`);
};

const sheet = resolve(ROOT, 'public', 'how.css');
const rooms = [IRON_ROOM, ...(['candle', 'roads', 'floor'] as const).map(roomRule)].join('');
writeFileSync(
  sheet,
  `/* Generated by scripts/gen-pages.ts — do not edit. The design is commented at its source. */\n${squeeze(STYLE.replace('SHEET_HEX', css(SHEET)))}${rooms}\n`,
);
console.log(`wrote ${sheet.replace(`${ROOT}/`, '')}`);

for (const book of books) {
  write([book.game.slug, 'about'], aboutPage(book), `${book.game.name} — the threshold`);
  book.leaves.forEach((leaf, i) => {
    write(
      [book.game.slug, 'how', ...(leaf.at ? [leaf.at] : [])],
      leafPage(book, i),
      `${book.game.name} — ${LEAF.numerals[i]} · ${leaf.nav}`,
    );
  });
}

write(['verify'], verifyPage(books), `all three, ${books.map(b => b.headline.value).join(' · ')}`);
