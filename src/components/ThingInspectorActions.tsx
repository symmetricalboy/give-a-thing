"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, RotateCcw, Send } from "lucide-react";
import { GiveThingModal, type GiveableThingSummary } from "./GiveThingModal";

interface ActiveEscrowView {
  offerTid: string;
  recipientHandle: string;
  note: string | null;
  revocableAfterIso: string;
  claimUrl: string;
  composerIntentUrl: string;
}

interface ThingInspectorActionsProps {
  thing: GiveableThingSummary;
  status: "held" | "escrowed";
  isViewerOwner: boolean;
  activeEscrow: ActiveEscrowView | null;
}

function formatRemainingWindow(revocableAfterIso: string, nowMs: number): string {
  const diff = Math.max(0, new Date(revocableAfterIso).getTime() - nowMs);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export function ThingInspectorActions({
  thing,
  status,
  isViewerOwner,
  activeEscrow,
}: ThingInspectorActionsProps) {
  const router = useRouter();
  const [giveOpen, setGiveOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [revoking, setRevoking] = useState(false);
  const [revokeErr, setRevokeErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!activeEscrow) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activeEscrow]);

  if (!isViewerOwner) return null;

  const canRevoke =
    activeEscrow && nowMs >= new Date(activeEscrow.revocableAfterIso).getTime();

  async function handleRevoke() {
    if (!activeEscrow) return;
    setRevoking(true);
    setRevokeErr(null);
    try {
      const res = await fetch(`/api/offers/${activeEscrow.offerTid}/revoke`, {
        method: "POST",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setRevokeErr(data.error ?? "Failed to revoke offer.");
        setRevoking(false);
        return;
      }
      router.refresh();
    } catch {
      setRevokeErr("Network error revoking offer.");
      setRevoking(false);
    }
  }

  if (status === "escrowed" && activeEscrow) {
    return (
      <div className="space-y-3 rounded border-2 border-[#5cc8ff] bg-[#5cc8ff]/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-pixel text-xs text-[#5cc8ff]">
            Set Aside for @{activeEscrow.recipientHandle}
          </p>
          {!canRevoke && (
            <span className="text-xs text-[#fbf4e4]">
              Revocable in{" "}
              <strong className="font-pixel">
                {formatRemainingWindow(activeEscrow.revocableAfterIso, nowMs)}
              </strong>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={activeEscrow.composerIntentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rpg-btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 font-pixel text-[11px]"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Mention on Bluesky
          </a>

          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(activeEscrow.claimUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="rpg-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 font-pixel text-[11px]"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-[#4be3a0]" />
                Copied Link
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                Copy Claim Link
              </>
            )}
          </button>

          <button
            type="button"
            disabled={!canRevoke || revoking}
            onClick={handleRevoke}
            title={
              canRevoke
                ? "Reclaim this Thing to your active bag"
                : "Available after 24 hours if unclaimed"
            }
            className="rpg-btn-secondary inline-flex items-center gap-1.5 border-[#ff5c8a]/60 px-3 py-2 font-pixel text-[11px] text-[#ff9bb6]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {revoking
              ? "Revoking..."
              : canRevoke
                ? "Revoke Offer"
                : "Revoke Locked (24h)"}
          </button>
        </div>

        {revokeErr && (
          <p role="alert" className="text-xs text-[#ff9bb6]">
            {revokeErr}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setGiveOpen(true)}
        className="rpg-btn-primary inline-flex items-center gap-2 px-5 py-3 font-pixel text-xs"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
        Give This Thing Away
      </button>

      <GiveThingModal
        open={giveOpen}
        onClose={() => setGiveOpen(false)}
        thing={thing}
      />
    </div>
  );
}
