import { useEffect } from "react";
export function useDialogs() {
  useEffect(() => {
    let dialog: HTMLElement | null = null;
    const openers = new WeakMap<HTMLElement, HTMLElement>();
    const selectors =
      'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]';
    const observer = new MutationObserver(() => {
      const next =
        [...document.querySelectorAll<HTMLElement>('[role="dialog"]')]
          .filter((element) => element.getClientRects().length > 0)
          .at(-1) ?? null;
      if (next !== dialog) {
        const closing = dialog;
        dialog = next;
        if (closing && !closing.isConnected) {
          const opener = openers.get(closing);
          if (opener?.isConnected) {
            opener.focus({ preventScroll: true });
            if (!next || next.contains(opener)) return;
          }
        }
        if (next) {
          if (!openers.has(next))
            openers.set(next, document.activeElement as HTMLElement);
          queueMicrotask(() => {
            if (dialog === next && next.isConnected)
              next
                .querySelector<HTMLElement>(selectors)
                ?.focus({ preventScroll: true });
          });
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const handler = (event: KeyboardEvent) => {
      if (!dialog) return;
      if (event.key === "Escape") {
        const close = dialog.querySelector<HTMLButtonElement>(".close");
        close?.click();
        return;
      }
      if (event.key !== "Tab") return;
      const items = [...dialog.querySelectorAll<HTMLElement>(selectors)].filter(
        (e) => e.offsetParent !== null,
      );
      if (!items.length) {
        event.preventDefault();
        return;
      }
      const first = items[0],
        last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", handler);
    };
  }, []);
}
