/**
 * I10 for THE SURVEY — the page is fully playable standalone: no host, no
 * wallet, no modal, no splash.
 *
 * A render that throws is exactly the kind of break that ships silently, so the
 * whole loop is driven here through the real components and the real demo host:
 * open the book, read the manifest, send surveyors, underwrite, decline, and the
 * next voyage — plus the keyboard path, which has no other coverage.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../src/games/survey/app/ui/App';
import { ErrorBoundary } from '../src/games/survey/app/ui/ErrorBoundary';
import { COPY, tallyPhrase } from '../src/games/survey/app/ui/copy';
import { CARGOES, MAX_SURVEYS } from '../src/games/survey/core/vessel';
import { DWELL_SLOW_MS } from '../src/games/survey/app/audio/voice';

let container: HTMLDivElement;
let root: Root;

const text = () => container.textContent ?? '';
const buttonSaying = (needle: string) =>
  Array.from(container.querySelectorAll('button')).find(b => (b.textContent ?? '').includes(needle)) ?? null;

/**
 * Waits for the demo host's scheduled step.
 *
 * The pacing is DERIVED from how close a state sits to the DP's own indifference
 * point, so a step takes anywhere from 260 ms to DWELL_SLOW_MS. Polling rather
 * than sleeping keeps the common case fast and the knife-edge case correct.
 */
const CEILING_MS = DWELL_SLOW_MS + 400;

const settle = async (until?: () => boolean) => {
  const deadline = Date.now() + CEILING_MS;
  for (;;) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 40));
    });
    if (until ? until() : Date.now() >= deadline) return;
    if (Date.now() >= deadline) return;
  }
};

const onTheDesk = () => text().includes(COPY.manifestLabel);
const settledBoard = () => /Underwritten|Declined/.test(text());

const press = async (key: string, init: KeyboardEventInit = {}) => {
  await act(async () => {
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, ...init }));
    await Promise.resolve();
  });
};

beforeEach(async () => {
  // Standalone: not embedded, so `selectSurveyHost` must pick the demo host with
  // no connect screen and no splash.
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<App />);
  });
  await settle(onTheDesk);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('I10 — the standalone page', () => {
  it('renders without a host, and says so', () => {
    expect(text()).toContain(COPY.title);
    expect(text()).toContain(COPY.demoBadge);
  });

  it('shows no wallet prompt, no modal and no splash', () => {
    expect(text()).not.toContain(COPY.walletDisconnected);
    expect(text()).not.toContain(COPY.hostUnreachable);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('ZERO CLICKS TO COMPREHENSION — the design law, on load', () => {
    // claude.md §5, prd.md §2. A judge with 90 seconds gets one look: the
    // voyage, what it pays, where the surveys stand, and three switches.
    const body = text();
    expect(body, 'the manifest').toContain(COPY.manifestLabel);
    expect(CARGOES.some(cargo => body.includes(cargo.name)), 'a named cargo').toBe(true);
    expect(body, 'how many surveyors have been sent').toContain(COPY.surveysBought(0));
    expect(body, 'the premium remaining').toContain(COPY.premiumRemaining);
    expect(body, 'what underwriting pays').toContain(COPY.ifSheComesHome);
    expect(body, 'what declining pays').toContain(COPY.declineAndTake);
    expect(body, 'where the reports stand').toContain(tallyPhrase(0, 0));
    expect(buttonSaying(COPY.underwrite), 'UNDERWRITE').not.toBeNull();
    expect(buttonSaying(COPY.survey), 'SEND A SURVEYOR').not.toBeNull();
    expect(buttonSaying(COPY.decline), 'DECLINE').not.toBeNull();
  });

  it('shows no form standing between the player and the game', () => {
    expect(buttonSaying(COPY.openTheBook), 'no OPEN THE BOOK gate in free play').toBeNull();
  });

  it('still shows the purse and the DEMO badge, so free play is never mistaken for real', () => {
    expect(text()).toContain(COPY.purse);
    expect(buttonSaying(COPY.refill)).not.toBeNull();
  });

  it('writes nothing to browser storage', () => {
    expect(window.localStorage?.length ?? 0).toBe(0);
    expect(window.sessionStorage?.length ?? 0).toBe(0);
  });
});

describe('the loop', () => {
  it('offers three switches, with their keys printed on them', () => {
    expect(buttonSaying(COPY.underwrite)?.textContent).toContain(COPY.underwriteKey);
    expect(buttonSaying(COPY.survey)?.textContent).toContain(COPY.surveyKey);
    expect(buttonSaying(COPY.decline)?.textContent).toContain(COPY.declineKey);
    expect(buttonSaying(COPY.survey)?.hasAttribute('disabled')).toBe(false);
  });

  it('a surveyor reports, and the tally moves with him', async () => {
    await act(async () => {
      buttonSaying(COPY.survey)?.click();
    });
    await settle(() => text().includes(COPY.surveysBought(1)));

    expect(text()).toContain(COPY.surveysBought(1));
    // One report in: either way round, but never still at nobody aboard.
    expect(text()).toMatch(/report for sound|report for rot/);
    expect(text()).not.toContain(tallyPhrase(0, 0));
  });

  it('every survey costs premium, and the readout says so', async () => {
    expect(text()).toContain('100%');
    await act(async () => {
      buttonSaying(COPY.survey)?.click();
    });
    await settle(() => text().includes(COPY.surveysBought(1)));
    // A point and a half, and printed as a point and a half: rounding the ladder
    // to whole percents would show two different rungs as the same number.
    expect(text(), 'the premium a surveyor cost').toContain('98.5%');
  });

  it('underwriting settles the voyage and says what became of her', async () => {
    await act(async () => {
      buttonSaying(COPY.underwrite)?.click();
    });
    await settle(settledBoard);
    expect(text()).toContain(COPY.underwrittenAt(0));
    expect(text()).toMatch(new RegExp(`${COPY.cameHome}|${COPY.wasRotten}`));
    expect(buttonSaying(COPY.dealAgain)).not.toBeNull();
  });

  it('declining settles at once, and never claims to know what she was', async () => {
    await act(async () => {
      buttonSaying(COPY.decline)?.click();
    });
    await settle(settledBoard);
    expect(text()).toContain(COPY.declinedAt(0));
    expect(text(), 'a declined voyage sails without you').toContain(COPY.declineNote);
    expect(text()).not.toContain(COPY.cameHome);
    expect(text()).not.toContain(COPY.wasRotten);
  });

  it('spends every surveyor, after which SEND is refused', async () => {
    for (let k = 0; k < MAX_SURVEYS; k++) {
      expect(text(), `survey ${k}`).toContain(COPY.surveysBought(k));
      await act(async () => {
        buttonSaying(COPY.survey)?.click();
      });
      await settle(() => text().includes(COPY.surveysBought(k + 1)));
    }
    expect(text()).toContain(COPY.nobodyLeft);
    expect(buttonSaying(COPY.survey)?.hasAttribute('disabled')).toBe(true);
    // The call is still the player's: both remaining switches are live.
    expect(buttonSaying(COPY.underwrite)?.hasAttribute('disabled')).toBe(false);
    expect(buttonSaying(COPY.decline)?.hasAttribute('disabled')).toBe(false);
    // Five real steps, each paced from the numbers: this one test is allowed to
    // take longer than the default rather than racing its own game.
  }, 20_000);

  it('offers the stake on the settled board, so changing it is still a decision', async () => {
    await act(async () => {
      buttonSaying(COPY.decline)?.click();
    });
    await settle(settledBoard);
    expect(text()).toContain(COPY.stake);
    expect(container.querySelector('#stake')).not.toBeNull();
  });

  it('opens the next voyage without a form in between', async () => {
    await act(async () => {
      buttonSaying(COPY.decline)?.click();
    });
    await settle(settledBoard);
    await act(async () => {
      buttonSaying(COPY.dealAgain)?.click();
    });
    await settle(() => onTheDesk() && !settledBoard());
    expect(text()).toContain(COPY.manifestLabel);
    expect(text()).toContain(COPY.surveysBought(0));
  });
});

describe('the keyboard path', () => {
  it('S sends a surveyor', async () => {
    await press('S');
    await settle(() => text().includes(COPY.surveysBought(1)));
    expect(text()).toContain(COPY.surveysBought(1));
  });

  it('ArrowDown sends one too', async () => {
    await press('ArrowDown');
    await settle(() => text().includes(COPY.surveysBought(1)));
    expect(text()).toContain(COPY.surveysBought(1));
  });

  it('Space underwrites, Enter opens the next voyage', async () => {
    await press(' ');
    await settle(settledBoard);
    expect(text()).toContain(COPY.dealAgain);

    await press('Enter');
    await settle(() => onTheDesk() && !settledBoard());
    expect(text()).toContain(COPY.manifestLabel);
  });

  it('D declines', async () => {
    await press('D');
    await settle(settledBoard);
    expect(text()).toContain(COPY.declinedAt(0));
  });

  it('? opens the panel and Escape closes it', async () => {
    await press('?');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(text()).toContain(COPY.helpTitle);
    await press('Escape');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('M toggles the sound label', async () => {
    expect(text()).toContain(COPY.soundOn);
    await press('M');
    expect(text()).toContain(COPY.soundOff);
  });
});

describe('the ? panel publishes the math', () => {
  it('shows the manifest, the premium ladder, the belief table, the RTP and the band', async () => {
    await press('?');
    const body = text();
    for (const cargo of CARGOES) expect(body, cargo.name).toContain(cargo.name);
    expect(body).toContain(COPY.premiumTitle);
    expect(body).toContain(COPY.beliefTitle);
    expect(body).toContain(COPY.callTitle);
    expect(body, 'the declared RTP').toContain('97.4141%');
    expect(body, 'and it as an exact rational').toContain('60883787 / 62500000');
    expect(body).toContain(COPY.bandTitle);
    // The prior and the two extremes of belief, so nothing about the model is hidden.
    expect(body, 'the prior').toContain('40.00%');
    expect(body, 'the deepest belief in rot').toContain('8.07%');
    await press('Escape');
  });

  it('prints the belief table the game itself never shows on the desk', async () => {
    // The desk shows the tally and the fog; the exact posterior lives here, with
    // the rest of the maths. Published, not hidden — and not played for you.
    await press('?');
    expect(text()).toContain(COPY.beliefNote);
    await press('Escape');
  });
});

describe('the voice', () => {
  it('never exclaims, never taunts, never says you lost', () => {
    const strings = Object.values(COPY).flatMap(value =>
      typeof value === 'string' ? [value] : Array.isArray(value) ? value.flat().filter(v => typeof v === 'string') : [],
    );
    const forbidden = [/!/, /you lose/i, /so close/i, /unlucky/i, /bad luck/i, /try again/i, /jackpot/i, /congratulat/i];
    for (const value of strings) {
      for (const pattern of forbidden) expect(pattern.test(value), `"${value}" matches ${pattern}`).toBe(false);
    }
  });

  it('states the Ghost Report flatly and says it changed nothing', () => {
    expect(COPY.ghostNote).toMatch(/changed nothing/i);
    expect(COPY.ghostLabel).not.toMatch(/would have won|missed/i);
  });
});

describe('the last line of defence', () => {
  it('shows the room, not a blank page, when something throws', async () => {
    const Boom = () => {
      throw new Error('the lamp went out');
    };
    const holder = document.createElement('div');
    document.body.appendChild(holder);
    const crashRoot = createRoot(holder);

    // React logs the caught error; that is the point of it, but it is noise here.
    const consoleError = console.error;
    console.error = () => {};
    try {
      await act(async () => {
        crashRoot.render(
          <ErrorBoundary>
            <Boom />
          </ErrorBoundary>,
        );
      });

      const body = holder.textContent ?? '';
      expect(body, 'the page is not blank').not.toBe('');
      expect(body).toContain(COPY.title);
      expect(body).toContain(COPY.crashed);
      expect(body, 'the error is shown, not swallowed').toContain('the lamp went out');
    } finally {
      console.error = consoleError;
      await act(async () => crashRoot.unmount());
      holder.remove();
    }
  });

  it('says nothing that could be mistaken for a lost stake', () => {
    expect(COPY.crashed).toContain('already settled on chain');
  });
});

describe('the book', () => {
  it('opens on L and closes on Escape', async () => {
    await press('L');
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(text()).toContain(COPY.ledgerTitle);
    await press('Escape');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('says plainly that nothing has settled yet', async () => {
    await press('L');
    expect(text()).toContain(COPY.ledgerEmpty);
    await press('Escape');
  });

  it('records a settled voyage, with the ghost in a column of its own', async () => {
    await press(' ');
    await settle(settledBoard);

    await press('L');
    const body = text();
    expect(body).toContain(COPY.ledgerCall);
    expect(body).toContain(COPY.ledgerNext);
    expect(body).toContain(COPY.ledgerRealised);
    expect(body, 'the declared RTP, so a short run can be read against it').toContain('97.41');
    await press('Escape');
  });

  it('never tallies what the player could have won', async () => {
    const forbidden = [/missed/i, /could have won/i, /would have won/i, /left on the table/i, /if only/i];
    const strings = [
      COPY.ledgerTitle, COPY.ledgerEmpty, COPY.ledgerRound, COPY.ledgerCargo, COPY.ledgerSurveys,
      COPY.ledgerCall, COPY.ledgerOutcome, COPY.ledgerPaid, COPY.ledgerNext, COPY.ledgerSoFar,
      COPY.ledgerRounds, COPY.ledgerStaked, COPY.ledgerReturned, COPY.ledgerRealised,
      COPY.ledgerDeclared, COPY.ledgerNote,
    ];
    for (const value of strings) {
      for (const pattern of forbidden) expect(pattern.test(value), `"${value}" matches ${pattern}`).toBe(false);
    }
    expect(COPY.ledgerNote).toMatch(/says little|wide/i);
  });

  it('only one panel is open at a time', async () => {
    await press('?');
    expect(text()).toContain(COPY.helpTitle);
    await press('L');
    expect(text()).toContain(COPY.ledgerTitle);
    expect(text()).not.toContain(COPY.manifestTitle);
    await press('Escape');
  });
});
