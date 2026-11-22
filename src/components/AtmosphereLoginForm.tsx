"use client";

import React, { useId, useRef, useState } from "react";
import { CircleHelp, ExternalLink } from "lucide-react";

interface AtmosphereLoginFormProps {
  returnTo: string;
  onCancel?: () => void;
}

export function AtmosphereLoginForm({
  returnTo,
  onCancel,
}: AtmosphereLoginFormProps) {
  const handleInputId = useId();
  const rawTipId = useId();
  const tooltipId = `atmo-tip-${rawTipId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const popoverRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [handleInput, setHandleInput] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [manualTipOpen, setManualTipOpen] = useState(false);

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function showTooltipOnHover() {
    clearHideTimer();
    const el = popoverRef.current;
    if (el && typeof el.showPopover === "function") {
      try {
        el.showPopover();
      } catch {
        // Already open
      }
    } else {
      setManualTipOpen(true);
    }
  }

  function scheduleHideTooltip() {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      const el = popoverRef.current;
      if (el && typeof el.hidePopover === "function") {
        try {
          el.hidePopover();
        } catch {
          // Already hidden
        }
      } else {
        setManualTipOpen(false);
      }
    }, 180);
  }

  async function handleLoginSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!handleInput.trim()) return;
    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: handleInput.trim(),
          returnTo: returnTo || "/",
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setLoginError(
          data.error ?? "Unable to start ATmosphere Account login."
        );
        setLoginBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setLoginError("Network error starting ATmosphere Account login.");
      setLoginBusy(false);
    }
  }

  return (
    <form onSubmit={handleLoginSubmit} className="space-y-4">
      <p className="text-sm text-[#cfc3e8]">
        Log in with your{" "}
        <span className="inline-flex items-center gap-1 font-semibold text-[#fdf6e9]">
          ATmosphere Account
          <button
            type="button"
            aria-label="Don't have an ATmosphere Account?"
            onMouseEnter={showTooltipOnHover}
            onMouseLeave={scheduleHideTooltip}
            onClick={() => {
              if (
                !popoverRef.current ||
                typeof popoverRef.current.showPopover !== "function"
              ) {
                setManualTipOpen((prev) => !prev);
              }
            }}
            {...({
              popovertarget: tooltipId,
              popovertargetaction: "toggle",
            } as Record<string, string>)}
            className="atmo-tooltip-trigger inline-flex h-5 w-5 items-center justify-center rounded-full border border-[#4da6ff]/70 bg-[#160f24] text-[#8ec8ff] hover:border-[#ffd15c] hover:text-[#ffd15c]"
          >
            <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>{" "}
        to unwrap daily things, curate your Top 8, and give things away to your
        friends!
      </p>

      <div
        ref={popoverRef}
        id={tooltipId}
        onMouseEnter={clearHideTimer}
        onMouseLeave={scheduleHideTooltip}
        {...({ popover: "auto" } as Record<string, string>)}
        className="atmo-tooltip-popover"
      >
        <div className="rpg-panel-blue px-3.5 py-2.5 text-xs shadow-xl">
          <a
            href="https://bsky.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-[#8ec8ff] underline hover:text-[#ffd15c]"
          >
            <span>
              Don&apos;t have an ATmosphere Account? Make one on Bluesky!
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </a>
        </div>
      </div>

      {manualTipOpen && (
        <div className="rpg-panel-blue px-3.5 py-2.5 text-xs">
          <a
            href="https://bsky.app"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-semibold text-[#8ec8ff] underline hover:text-[#ffd15c]"
          >
            <span>
              Don&apos;t have an ATmosphere Account? Make one on Bluesky!
            </span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          </a>
        </div>
      )}

      <div>
        <label
          htmlFor={handleInputId}
          className="mb-1.5 block font-pixel text-xs text-[#ffd15c]"
        >
          ATmosphere Account Handle
        </label>
        <input
          id={handleInputId}
          type="text"
          autoFocus
          required
          autoComplete="username"
          placeholder="alice.bsky.social"
          value={handleInput}
          onChange={(e) => setHandleInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (e.nativeEvent.isComposing || e.keyCode === 229) {
                e.preventDefault();
              }
            }
          }}
          className="rpg-slot w-full px-3.5 py-2.5 text-sm text-[#fdf6e9] placeholder:text-[#cfc3e8]/50 focus:border-[#4da6ff] focus:outline-none"
        />
      </div>

      {loginError && (
        <p
          role="alert"
          className="rounded border border-[#ff4d6d] bg-[#ff4d6d]/15 px-3 py-2 text-xs text-[#ff99ac]"
        >
          {loginError}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rpg-btn-secondary px-4 py-2 font-pixel text-xs"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loginBusy}
          className="rpg-btn-blue px-5 py-2 font-pixel text-xs"
        >
          {loginBusy ? "Connecting..." : "Login"}
        </button>
      </div>
    </form>
  );
}
