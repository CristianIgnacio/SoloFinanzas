import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./ui";

/** Native modality keeps the background inert; the panel follows the mobile keyboard. */
export function ModalDialog({ children, labelledBy, describedBy, busy = false, onClose, className, initialFocus }: {
  children: ReactNode;
  labelledBy: string;
  describedBy?: string;
  busy?: boolean;
  onClose: () => void;
  className?: string;
  initialFocus?: string;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    panelRef.current?.focus({ preventScroll: true });

    const viewport = window.visualViewport;
    const updateViewport = () => {
      if (!viewport || viewport.scale !== 1) return;
      dialog?.style.setProperty("--modal-height", `${viewport.height}px`);
      dialog?.style.setProperty("--modal-top", `${viewport.offsetTop}px`);
    };
    const resizeViewport = () => {
      updateViewport();
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && panelRef.current?.contains(focused) && focused !== panelRef.current) {
        focused.scrollIntoView({ block: "nearest" });
      }
    };
    updateViewport();
    viewport?.addEventListener("resize", resizeViewport);
    viewport?.addEventListener("scroll", updateViewport);
    return () => {
      viewport?.removeEventListener("resize", resizeViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected && trigger.getClientRects().length) {
        trigger.focus({ preventScroll: true });
      } else {
        // The triggering row may have been deleted.
        const heading = document.querySelector<HTMLElement>("main h1");
        if (heading) {
          const tabIndex = heading.getAttribute("tabindex");
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
          heading.addEventListener("blur", () => {
            if (tabIndex === null) heading.removeAttribute("tabindex");
            else heading.setAttribute("tabindex", tabIndex);
          }, { once: true });
        }
      }
    };
  }, []);

  useEffect(() => {
    const target = initialFocus ? panelRef.current?.querySelector<HTMLElement>(initialFocus) : panelRef.current;
    target?.focus({ preventScroll: true });
  }, [initialFocus]);

  return createPortal(
    <dialog ref={dialogRef} aria-labelledby={labelledBy} aria-describedby={describedBy}
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}
      onKeyDown={event => {
        if (event.key !== "Tab") return;
        const controls = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], summary, [tabindex="0"]',
        ) ?? []).filter(element => element.getClientRects().length > 0 && element.tabIndex >= 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); panelRef.current?.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }}
      className="fixed inset-x-0 bottom-auto top-[var(--modal-top,0px)] m-0 h-[min(100dvh,var(--modal-height,100dvh))] max-h-none w-full max-w-none overflow-hidden border-0 bg-transparent p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))] text-ink outline-none backdrop:bg-ink/50 backdrop:backdrop-blur-sm [&[open]]:flex [&[open]]:items-center [&[open]]:justify-center sm:p-4">
      <div ref={panelRef} tabIndex={-1} autoFocus className={cn("surface-card flex max-h-full w-full min-w-0 flex-col overflow-y-auto overscroll-contain outline-none [scroll-padding-block:12px]", className)}>
        {children}
      </div>
    </dialog>, document.body,
  );
}
