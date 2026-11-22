"use client";

import React, { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Gift, ScrollText, Sparkles } from "lucide-react";

interface ClaimOfferClientProps {
  offerTid: string;
  status: "open" | "claimed" | "revoked";
  recipientDid: string;
  recipientHandle: string;
  thingTid: string;
  viewerDid: string | null;
  viewerHandle: string | null;
}

export function ClaimOfferClient({
  offerTid,
  status,
  recipientDid,
  recipientHandle,
  thingTid,
  viewerDid,
  viewerHandle,
}: ClaimOfferClientProps) {
  const router = useRouter();
  const handleInputId = useId();

  const [loginHandle, setLoginHandle] = useState(recipientHandle);
  const [busy, setBusy] = useState(false);
  const [claimedDone, setClaimedDone] = useState(status === "claimed");
  const [error, setError] = useState<string | null>(null);

  if (claimedDone) {
    return (
      <div className="space-y-4 text-center pt-2">
        <div className="inline-flex items-center gap-2 rounded bg-[#4be3a0]/20 px-3.5 py-1.5 font-pixel text-xs text-[#4be3a0]">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          Added to Your Things &amp; ATProtocol PDS!
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href={`/thing/${thingTid}`}
            className="rpg-btn-primary inline-flex items-center gap-2 px-5 py-2.5 font-pixel text-xs"
          >
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            View Provenance Ledger
          </Link>
          <Link
            href="/"
            className="rpg-btn-secondary inline-flex items-center gap-2 px-5 py-2.5 font-pixel text-xs"
          >
            <Gift className="h-4 w-4" aria-hidden="true" />
            Get Today&apos;s Free Thing Too!
          </Link>
        </div>
      </div>
    );
  }

  if (status === "revoked") {
    return (
      <p className="rounded border border-[#ff5c8a]/50 bg-[#ff5c8a]/10 px-4 py-3 text-center text-xs text-[#ff9bb6]">
        This offer went unclaimed for over 24 hours and was returned to the
        sender.
      </p>
    );
  }

  if (viewerDid === recipientDid) {
    return (
      <div className="space-y-3 text-center">
        {error && (
          <p
            role="alert"
            className="border border-[#ff5c8a] bg-[#ff5c8a]/15 px-3 py-2 text-xs text-[#ff9bb6]"
          >
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await fetch(`/api/offers/${offerTid}/claim`, {
                method: "POST",
              });
              const data = (await res.json()) as { error?: string };
              if (!res.ok) {
                setError(data.error ?? "Failed to claim thing.");
                setBusy(false);
                return;
              }
              setClaimedDone(true);
              router.refresh();
            } catch {
              setError("Network error claiming thing.");
              setBusy(false);
            }
          }}
          className="rpg-btn-primary inline-flex items-center gap-2.5 px-7 py-3.5 font-pixel text-xs sm:text-sm"
        >
          <Gift className="h-4 w-4" aria-hidden="true" />
          {busy ? "Recording Claim on Your PDS..." : "Claim Your Thing!"}
        </button>
      </div>
    );
  }

  if (viewerDid && viewerDid !== recipientDid) {
    return (
      <div className="rounded border border-[#e5b54f]/50 bg-[#140f1d] p-4 text-center text-xs text-[#bfb2d6]">
        You are signed in as <strong>@{viewerHandle}</strong>, while this thing
        is locked specifically for <strong>@{recipientHandle}</strong>&apos;s
        Bluesky DID.
      </div>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              handle: loginHandle.trim(),
              returnTo: `/claim/${offerTid}`,
            }),
          });
          const data = (await res.json()) as { url?: string; error?: string };
          if (!res.ok || !data.url) {
            setError(data.error ?? "Could not start Bluesky sign-in.");
            setBusy(false);
            return;
          }
          window.location.href = data.url;
        } catch {
          setError("Network error starting Bluesky OAuth.");
          setBusy(false);
        }
      }}
      className="mx-auto max-w-md space-y-3 pt-2"
    >
      <label
        htmlFor={handleInputId}
        className="block font-pixel text-xs text-[#f5c451] text-center"
      >
        Sign in as @{recipientHandle} to Claim
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          id={handleInputId}
          type="text"
          required
          value={loginHandle}
          onChange={(e) => setLoginHandle(e.target.value)}
          className="rpg-slot flex-1 px-3.5 py-2.5 text-sm text-[#fbf4e4]"
        />
        <button
          type="submit"
          disabled={busy}
          className="rpg-btn-primary px-5 py-2.5 font-pixel text-xs"
        >
          {busy ? "Redirecting..." : "Sign in & Claim"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-center text-xs text-[#ff9bb6]">
          {error}
        </p>
      )}
    </form>
  );
}
