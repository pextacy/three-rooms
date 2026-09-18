/**
 * Keeps keyboard focus inside a dialog while it is open, and gives it back to
 * whatever opened it on close.
 *
 * Without this, `aria-modal="true"` is a claim the dialog does not honour: Tab
 * walks straight out into a game the player cannot see, and on close focus is
 * lost to the document body — which strands anyone not using a mouse.
 *
 * It lived in each game's `HelpPanel`, three copies that had already drifted in
 * their comments, and the `?` panels were the only dialogs that had it. The
 * ledger and the book declared `aria-modal` too and honoured none of it: open
 * the book with `L`, press Tab, and you were tabbing through a game behind a
 * panel you could still see.
 *
 * Nothing here knows which game is asking, which is why it belongs in
 * `shared/ui` (claude.md §3).
 */
import { useEffect, useRef } from 'react';

/** Everything a browser will let you Tab to, in DOM order. */
const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T | null>(null);

  /**
   * Captured during RENDER, not in the effect.
   *
   * Every one of these dialogs puts `autoFocus` on its close button, and React
   * applies that while committing — before any effect runs. Reading
   * `document.activeElement` from inside the effect therefore captured the
   * dialog's own close button as "the opener", and closing then called
   * `.focus()` on a node being unmounted, which drops focus on `<body>`. That
   * is the exact thing this hook says it prevents, and it had never worked.
   *
   * Render has not committed yet, so focus is still wherever the player left
   * it. Reading it here changes nothing and is safe to repeat.
   */
  const openerRef = useRef<HTMLElement | null>(null);
  if (openerRef.current === null && typeof document !== 'undefined') {
    openerRef.current = document.activeElement as HTMLElement | null;
  }

  useEffect(() => {
    const opener = openerRef.current;
    const panel = ref.current;

    const focusable = () =>
      Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        element => !element.hasAttribute('disabled'),
      );

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;

      // Wrap at both ends, so Tab can never leave the dialog.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel?.addEventListener('keydown', onKeyDown);
    return () => {
      panel?.removeEventListener('keydown', onKeyDown);
      // Give focus back to the control that opened the panel.
      opener?.focus?.();
    };
  }, [onClose]);

  return ref;
}
