"use client";

import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

interface RpgModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  wide?: boolean;
  children: React.ReactNode;
}

/**
 * Accessible 16-Bit RPG Dialog built on the native HTML `<dialog>` element:
 * - Opened via `showModal()` for top-layer focus containment & Esc / back-gesture dismissal
 * - Uses declarative `closedby="any"` with a press-and-release coordinate Safari fallback
 * - Resets `dialog.returnValue = ''` on close
 */
export function RpgModal({
  open,
  onClose,
  title,
  wide = false,
  children,
}: RpgModalProps) {
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
      const isOutside = (event: PointerEvent) => {
        const rect = dialog.getBoundingClientRect();
        return (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        );
      };
      let pressedOutside = false;
      const onPointerDown = (event: PointerEvent) => {
        pressedOutside = isOutside(event);
      };
      const onPointerUp = (event: PointerEvent) => {
        if (pressedOutside && isOutside(event)) {
          dialog.close();
        }
      };
      dialog.addEventListener("pointerdown", onPointerDown);
      dialog.addEventListener("pointerup", onPointerUp);
      cleanupFallback = () => {
        dialog.removeEventListener("pointerdown", onPointerDown);
        dialog.removeEventListener("pointerup", onPointerUp);
      };
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
      className={wide ? "rpg-dialog-wide" : undefined}
      {...({ closedby: "any" } as Record<string, string>)}
    >
      <div className="rpg-panel max-h-[88dvh] overflow-y-auto p-5 sm:p-6">
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
