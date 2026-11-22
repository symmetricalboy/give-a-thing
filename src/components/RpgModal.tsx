"use client";

import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

interface RpgModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

/**
 * Accessible 16-Bit RPG Dialog built on the native HTML `<dialog>` element:
 * - Opened via `showModal()` for top-layer focus containment & Esc / back-gesture dismissal
 * - Uses declarative `closedby="any"` with a coordinate-checked Safari fallback
 * - Resets `dialog.returnValue = ''` on close
 */
export function RpgModal({ open, onClose, title, children }: RpgModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = "";
      onClose();
    };

    dialog.addEventListener("close", handleClose);

    // Fallback for browsers without native `<dialog closedby="any">` support (e.g. Safari)
    let cleanupFallback: (() => void) | undefined;
    if (!("closedBy" in HTMLDialogElement.prototype)) {
      const handleBackdropClick = (event: MouseEvent) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isInside =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (!isInside) {
          dialog.close();
        }
      };
      dialog.addEventListener("click", handleBackdropClick);
      cleanupFallback = () =>
        dialog.removeEventListener("click", handleBackdropClick);
    }

    return () => {
      dialog.removeEventListener("close", handleClose);
      cleanupFallback?.();
    };
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      {...({ closedby: "any" } as Record<string, string>)}
    >
      <div className="rpg-panel p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3 border-b-2 border-[#8c6826]/60 pb-3">
          <h2
            id={titleId}
            className="font-pixel text-sm sm:text-base text-[#f5c451]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close dialog"
            className="rpg-btn-secondary inline-flex h-8 w-8 items-center justify-center text-sm"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
