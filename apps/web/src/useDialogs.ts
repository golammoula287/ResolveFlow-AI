import { useEffect } from "react";
export function useDialogs() {
  useEffect(() => {
    let dialog: HTMLElement | null = null;
    let previous: HTMLElement | null = null;
    const selectors =
      'button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]';
    const observer = new MutationObserver(() => {
      const next = document.querySelector<HTMLElement>('[role="dialog"]');
      if (next !== dialog) {
        if (!next) {
          previous?.focus();
          dialog = null;
          return;
        }
        previous = document.activeElement as HTMLElement;
        dialog = next;
        queueMicrotask(() =>
          dialog?.querySelector<HTMLElement>(selectors)?.focus(),
        );
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
