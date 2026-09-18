/**
 * `aria-modal="true"` is a promise, and every dialog here has to keep it.
 *
 * Six dialogs across the three games declare it. Three — the `?` panels — kept
 * it, with a focus trap each had its own copy of. The other three — the ledger
 * and the two books — declared `aria-modal` and honoured none of it: open the
 * book with `L`, press Tab, and you were tabbing through a game you could still
 * see behind a panel, with no way back; close it and focus was on the document
 * body. Nothing caught that, because nothing checked.
 *
 * The trap is one shared hook now, so this walks every dialog through the same
 * three promises rather than trusting that six components each remembered.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HelpPanel as CandleHelp } from '../src/games/candle/app/ui/HelpPanel';
import { Ledger } from '../src/games/candle/app/ui/Ledger';
import { HelpPanel as SurveyHelp } from '../src/games/survey/app/ui/HelpPanel';
import { Book as SurveyBook } from '../src/games/survey/app/ui/Book';
import { HelpPanel as BrokersHelp } from '../src/games/brokers/app/ui/HelpPanel';
import { Book as BrokersBook } from '../src/games/brokers/app/ui/Book';

let container: HTMLDivElement;
let root: Root;
let opener: HTMLButtonElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  // Something outside the dialog that Tab could escape to, and that focus
  // should come back to on close.
  opener = document.createElement('button');
  opener.textContent = 'the control that opened it';
  document.body.append(opener);
  opener.focus();
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  opener.remove();
});

const DIALOGS = [
  { name: 'CANDLE · the ? panel', render: (onClose: () => void) => <CandleHelp onClose={onClose} /> },
  { name: 'CANDLE · the ledger', render: (onClose: () => void) => <Ledger rows={[]} decimals={18} symbol="chUSD" onClose={onClose} /> },
  { name: 'THE SURVEY · the ? panel', render: (onClose: () => void) => <SurveyHelp onClose={onClose} /> },
  { name: 'THE SURVEY · the book', render: (onClose: () => void) => <SurveyBook rows={[]} decimals={18} symbol="chUSD" onClose={onClose} /> },
  { name: 'THE BROKERS · the ? panel', render: (onClose: () => void) => <BrokersHelp onClose={onClose} /> },
  { name: 'THE BROKERS · the book', render: (onClose: () => void) => <BrokersBook rows={[]} decimals={18} symbol="chUSD" onClose={onClose} /> },
] as const;

const dialog = () => container.querySelector('[role="dialog"]') as HTMLElement;
const focusable = () =>
  Array.from(
    dialog().querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ).filter(el => !el.hasAttribute('disabled'));

const tab = (shiftKey: boolean) =>
  dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));

for (const { name, render } of DIALOGS) {
  describe(name, () => {
    it('says it is a modal, and therefore owes a trap', () => {
      act(() => root.render(render(() => {})));
      expect(dialog().getAttribute('aria-modal')).toBe('true');
      expect(focusable().length, 'something inside is reachable').toBeGreaterThan(0);
    });

    it('Tab off the last control wraps to the first, rather than into the game behind', () => {
      act(() => root.render(render(() => {})));
      const items = focusable();
      const last = items[items.length - 1] as HTMLElement;
      act(() => last.focus());
      expect(document.activeElement).toBe(last);

      act(() => void tab(false));
      expect(document.activeElement, 'wrapped back inside the dialog').toBe(items[0]);
      expect(dialog().contains(document.activeElement), 'focus never left').toBe(true);
    });

    it('Shift+Tab off the first control wraps to the last', () => {
      act(() => root.render(render(() => {})));
      const items = focusable();
      const first = items[0] as HTMLElement;
      act(() => first.focus());

      act(() => void tab(true));
      expect(document.activeElement).toBe(items[items.length - 1]);
    });

    it('Escape closes it', () => {
      let closed = 0;
      act(() => root.render(render(() => void closed++)));
      act(() => {
        dialog().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      });
      expect(closed).toBe(1);
    });

    it('gives focus back to whatever opened it', () => {
      act(() => root.render(render(() => {})));
      const inside = focusable()[0] as HTMLElement;
      act(() => inside.focus());
      expect(document.activeElement).not.toBe(opener);

      act(() => root.render(<div />));
      expect(document.activeElement, 'not stranded on the document body').toBe(opener);
    });
  });
}
