"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, ExternalLink, Send, Sparkles } from "lucide-react";
import { RpgModal } from "./RpgModal";

interface ActorCandidate {
  did: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  isRegisteredPlayer: boolean;
}

export interface GiveableThingSummary {
  thingTid: string;
  catalogNumber: number;
  name: string;
  iconUrl: string;
  iconAlt: string;
}

interface GiveThingModalProps {
  open: boolean;
  onClose: () => void;
  thing: GiveableThingSummary | null;
  onSuccess?: () => void;
}

export function GiveThingModal({
  open,
  onClose,
  thing,
  onSuccess,
}: GiveThingModalProps) {
  const router = useRouter();
  const recipientInputId = useId();
  const noteInputId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  const [query, setQuery] = useState("");
  const [selectedActor, setSelectedActor] = useState<ActorCandidate | null>(
    null
  );
  const [suggestions, setSuggestions] = useState<ActorCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [escrowCreated, setEscrowCreated] = useState<{
    claimUrl: string;
    composerIntentUrl: string;
    recipientHandle: string;
  } | null>(null);
  const [directSuccessHandle, setDirectSuccessHandle] = useState<string | null>(
    null
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedActor(null);
      setSuggestions([]);
      setNote("");
      setError(null);
      setEscrowCreated(null);
      setDirectSuccessHandle(null);
      setCopied(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || selectedActor || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/actors/search?q=${encodeURIComponent(query.trim())}`
        );
        if (res.ok) {
          const data = (await res.json()) as { actors?: ActorCandidate[] };
          setSuggestions(data.actors ?? []);
        }
      } catch {
        // Ignore transient network glitches during typeahead
      } finally {
        setSearching(false);
      }
    }, 220);

    return () => clearTimeout(handle);
  }, [query, selectedActor, open]);

  if (!thing) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!thing) return;
    setError(null);

    const targetActor = selectedActor?.handle || query.trim();
    if (!targetActor) {
      setError("Choose or enter a friend's Bluesky handle.");
      return;
    }

    setSubmitting(true);
    try {
      if (selectedActor?.isRegisteredPlayer) {
        const res = await fetch(`/api/things/${thing.thingTid}/give`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientDid: selectedActor.did,
            note: note.trim() || undefined,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          recipientHandle?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "Transfer failed.");
          setSubmitting(false);
          return;
        }
        setDirectSuccessHandle(data.recipientHandle ?? selectedActor.handle);
        router.refresh();
        onSuccess?.();
      } else {
        const res = await fetch(`/api/things/${thing.thingTid}/escrow`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientActor: selectedActor?.did ?? targetActor,
            note: note.trim() || undefined,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          mode?: "direct_gift" | "escrow_offer";
          recipientHandle?: string;
          claimUrl?: string;
          composerIntentUrl?: string;
        };
        if (!res.ok) {
          setError(data.error ?? "Could not set aside Thing.");
          setSubmitting(false);
          return;
        }

        if (data.mode === "direct_gift") {
          setDirectSuccessHandle(data.recipientHandle ?? targetActor);
        } else if (data.claimUrl && data.composerIntentUrl) {
          setEscrowCreated({
            claimUrl: data.claimUrl,
            composerIntentUrl: data.composerIntentUrl,
            recipientHandle: data.recipientHandle ?? targetActor,
          });
        }
        router.refresh();
        onSuccess?.();
      }
    } catch {
      setError("Network error while sending Thing.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RpgModal open={open} onClose={onClose} title="Give Away This Thing">
      {/* Selected Thing Header */}
      <div className="mb-4 flex items-center gap-3 rounded bg-[#160f24] p-3 border border-[#4da6ff]/45">
        <div className="rpg-slot flex h-14 w-14 shrink-0 items-center justify-center p-1.5">
          <img
            src={thing.iconUrl}
            alt={thing.iconAlt}
            width={48}
            height={48}
            className="pixel-art h-11 w-11 object-contain"
          />
        </div>
        <div className="min-w-0">
          <span className="font-pixel text-[11px] text-[#ffd15c]">
            #{String(thing.catalogNumber).padStart(4, "0")}
          </span>
          <p className="truncate font-semibold text-sm text-[#fdf6e9]">
            {thing.name}
          </p>
        </div>
      </div>

      {directSuccessHandle ? (
        <div className="space-y-4 text-center py-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#4be3a0]/20 text-[#4be3a0]">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="font-pixel text-sm text-[#4be3a0]">
            Sent to @{directSuccessHandle}!
          </p>
          <p className="text-sm text-[#cfc3e8]">
            Your gift has been etched forever into this thing&apos;s ownership
            history!
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rpg-btn-primary w-full py-2.5 font-pixel text-xs"
          >
            Done
          </button>
        </div>
      ) : escrowCreated ? (
        <div className="space-y-4">
          <div className="rounded border-2 border-[#4da6ff] bg-[#4da6ff]/10 p-3.5 text-sm">
            <p className="font-pixel text-xs text-[#8ec8ff] mb-1">
              Set Aside for @{escrowCreated.recipientHandle}!
            </p>
            <p className="text-xs text-[#fdf6e9]">
              @{escrowCreated.recipientHandle} hasn&apos;t joined Give a Thing
              yet, so we set this thing aside for their Bluesky account! If
              unclaimed after <strong>24 hours</strong>, you can return it from{" "}
              <strong>YOUR THINGS</strong>.
            </p>
          </div>

          <a
            href={escrowCreated.composerIntentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rpg-btn-blue flex w-full items-center justify-center gap-2 py-3 font-pixel text-xs"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Mention @{escrowCreated.recipientHandle} on Bluesky
          </a>

          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              aria-label="Claim URL"
              value={escrowCreated.claimUrl}
              className="rpg-slot flex-1 px-3 py-2 text-xs text-[#cfc3e8]"
            />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(escrowCreated.claimUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="rpg-btn-secondary inline-flex items-center gap-1.5 px-3 py-2 font-pixel text-[11px]"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#4be3a0]" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rpg-btn-secondary w-full py-2 font-pixel text-xs"
          >
            Close Window
          </button>
        </div>
      ) : (
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          {/* Recipient Picker */}
          <div className="relative">
            <label
              htmlFor={recipientInputId}
              className="mb-1.5 block font-pixel text-xs text-[#ffd15c]"
            >
              Give To (Bluesky Handle)
            </label>

            {selectedActor ? (
              <div className="rpg-slot flex items-center justify-between gap-2 px-3 py-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {selectedActor.avatarUrl && (
                    <img
                      src={selectedActor.avatarUrl}
                      alt=""
                      className="h-7 w-7 rounded-sm object-cover"
                    />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[#fdf6e9]">
                      @{selectedActor.handle}
                    </p>
                    <p className="text-[11px] text-[#4be3a0]">
                      {selectedActor.isRegisteredPlayer
                        ? "On Give a Thing — Instant Gift"
                        : "Not on Give a Thing yet — 24h Claim Invite"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedActor(null);
                    setQuery("");
                  }}
                  className="rpg-btn-secondary px-2 py-1 text-xs"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <input
                  id={recipientInputId}
                  type="text"
                  autoFocus
                  autoComplete="off"
                  placeholder="Search friend or type @handle.bsky.social..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (e.nativeEvent.isComposing || e.keyCode === 229) {
                        return;
                      }
                      if (suggestions[0]) {
                        setSelectedActor(suggestions[0]);
                      }
                    }
                  }}
                  className="rpg-slot w-full px-3.5 py-2.5 text-sm text-[#fdf6e9] placeholder:text-[#cfc3e8]/50 focus:border-[#4da6ff] focus:outline-none"
                />

                {(searching || suggestions.length > 0) && (
                  <ul className="scroll-region mt-1 max-h-52 divide-y divide-[#9e762a]/30 border-2 border-[#ffd15c] bg-[#211636] shadow-xl">
                    {searching && suggestions.length === 0 && (
                      <li className="px-3 py-2.5 text-xs text-[#cfc3e8]">
                        Searching Bluesky...
                      </li>
                    )}
                    {suggestions.map((actor) => (
                      <li key={actor.did}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedActor(actor);
                            setSuggestions([]);
                          }}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[#3c2b60]"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {actor.avatarUrl ? (
                              <img
                                src={actor.avatarUrl}
                                alt=""
                                className="h-7 w-7 shrink-0 rounded-sm object-cover"
                              />
                            ) : (
                              <div className="h-7 w-7 shrink-0 rounded-sm bg-[#3c2b60]" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-[#fdf6e9]">
                                {actor.displayName || `@${actor.handle}`}
                              </p>
                              <p className="truncate text-[11px] text-[#cfc3e8]">
                                @{actor.handle}
                              </p>
                            </div>
                          </div>

                          {actor.isRegisteredPlayer ? (
                            <span className="shrink-0 rounded bg-[#4be3a0]/20 px-2 py-0.5 font-pixel text-[9px] text-[#4be3a0]">
                              PLAYER
                            </span>
                          ) : (
                            <span className="shrink-0 rounded bg-[#4da6ff]/20 px-2 py-0.5 font-pixel text-[9px] text-[#8ec8ff]">
                              INVITE
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* Gift Note */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor={noteInputId}
                className="font-pixel text-xs text-[#ffd15c]"
              >
                Gift Note (Optional)
              </label>
              <span className="text-[11px] text-[#cfc3e8]">
                {note.length}/140
              </span>
            </div>
            <textarea
              id={noteInputId}
              rows={2}
              maxLength={140}
              placeholder="Write a note to stay with this thing forever..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (e.nativeEvent.isComposing || e.keyCode === 229) {
                    return;
                  }
                  formRef.current?.requestSubmit();
                }
              }}
              className="rpg-slot w-full px-3.5 py-2 text-sm text-[#fdf6e9] placeholder:text-[#cfc3e8]/50 focus:border-[#4da6ff] focus:outline-none"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded border border-[#ff4d6d] bg-[#ff4d6d]/15 px-3 py-2 text-xs text-[#ff99ac]"
            >
              {error}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rpg-btn-secondary px-4 py-2 font-pixel text-xs"
            >
              Keep For Now
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rpg-btn-red inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {submitting
                ? "Sending Thing..."
                : selectedActor && !selectedActor.isRegisteredPlayer
                  ? "Set Aside & Invite"
                  : "Give Thing"}
            </button>
          </div>
        </form>
      )}
    </RpgModal>
  );
}
