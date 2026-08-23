"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Beskrivelse under tittelen, f.eks. hva dialogen brukes til. */
  description?: string;
  /** Bredden på dialogen. Standard er bred nok til varmekartet. */
  size?: "sm" | "md" | "lg";
  /** Knapperad nederst (avbryt/bekreft). */
  footer?: React.ReactNode;
}

const SIZES = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-5xl",
} as const;

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export default function Modal({
  title,
  onClose,
  children,
  description,
  size = "lg",
  footer,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Escape lukker, og Tab holdes inne i dialogen. Uten en felle kan tastatur-
  // fokus vandre ut i sida bak overlegget, der ingenting er klikkbart.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  // Flytt fokus inn i dialogen, og lever det tilbake der brukeren var da den
  // lukkes. Sida bak låses samtidig, så den ikke ruller under overlegget.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const target = panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    target?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-print-hide
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`flex max-h-[90vh] w-full ${SIZES[size]} flex-col rounded-xl border border-border bg-surface-raised shadow-xl outline-none`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-0.5 text-sm text-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Lukk"
            className="-mr-1 shrink-0 rounded-md p-1.5 text-subtle hover:bg-background hover:text-foreground"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}
