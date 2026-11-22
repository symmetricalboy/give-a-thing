"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ExternalLink,
  HeartHandshake,
  LifeBuoy,
  Mail,
  Scale,
  Shield,
  Trash2,
} from "lucide-react";
import { RpgModal } from "./RpgModal";

interface OtherThingsClientProps {
  viewerHandle: string | null;
  isSystemAccount: boolean;
}

type PolicyTabKey = "privacy" | "terms" | "conduct";

export function OtherThingsClient({
  viewerHandle,
  isSystemAccount,
}: OtherThingsClientProps) {
  const router = useRouter();
  const privacyTabId = useId();
  const termsTabId = useId();
  const conductTabId = useId();
  const confirmInputId = useId();

  const privacyPanelRef = useRef<HTMLDivElement>(null);
  const termsPanelRef = useRef<HTMLDivElement>(null);
  const conductPanelRef = useRef<HTMLDivElement>(null);

  const [activePolicy, setActivePolicy] = useState<PolicyTabKey>("privacy");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const panels: Array<[PolicyTabKey, HTMLDivElement | null]> = [
      ["privacy", privacyPanelRef.current],
      ["terms", termsPanelRef.current],
      ["conduct", conductPanelRef.current],
    ];

    const cleanups: Array<() => void> = [];
    for (const [key, panel] of panels) {
      if (!panel) continue;
      if (key === activePolicy) {
        panel.removeAttribute("hidden");
      } else {
        panel.setAttribute("hidden", "until-found");
      }
      const handler = () => setActivePolicy(key);
      panel.addEventListener("beforematch", handler);
      cleanups.push(() => panel.removeEventListener("beforematch", handler));
    }

    return () => {
      for (const fn of cleanups) fn();
    };
  }, [activePolicy]);

  async function handlePermanentDelete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (confirmText.trim() !== "DELETE") return;

    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText: confirmText.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setDeleteError(
          data.error ?? "Unable to complete permanent deletion right now."
        );
        setDeleting(false);
        return;
      }

      setConfirmOpen(false);
      window.location.href = "/";
    } catch {
      setDeleteError("Network error while deleting your records.");
      setDeleting(false);
    } finally {
      router.refresh();
    }
  }

  return (
    <div className="space-y-8">
      {/* Header & Support Links */}
      <section aria-label="Support and Contact" className="rpg-panel p-6 sm:p-8 space-y-5">
        <div className="space-y-1.5 border-b-2 border-[#9e762a]/50 pb-4">
          <h1 className="font-pixel text-base sm:text-lg text-[#ffd15c]">
            OTHER THINGS
          </h1>
          <p className="text-xs sm:text-sm text-[#cfc3e8]">
            Support links, our Privacy Policy, Terms of Service, Code of
            Conduct, and account controls for Give a Thing.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-[#8ec8ff]" aria-hidden="true" />
            <h2 className="font-pixel text-xs sm:text-sm text-[#8ec8ff]">
              SUPPORT &amp; CONTACT
            </h2>
          </div>

          <p className="text-xs sm:text-sm leading-relaxed text-[#fdf6e9]">
            Need help with your account, spotted a bug, want to report an
            inappropriate gift note, or have a fun idea? Reach out anytime on
            Bluesky or send us an email:
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1 pb-1">
            <a
              href="https://bsky.app/profile/giveathing.com"
              target="_blank"
              rel="noopener noreferrer"
              className="rpg-btn-blue inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              @giveathing.com on Bluesky
            </a>

            <a
              href="mailto:support@giveathing.com"
              className="rpg-btn-primary inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
            >
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              support@giveathing.com
            </a>
          </div>
        </div>
      </section>

      {/* Policies Tabbed Section */}
      <section aria-label="Policies and Guidelines" className="space-y-4">
        <div
          role="tablist"
          aria-label="Policy documents"
          className="rpg-tablist"
        >
          <button
            type="button"
            role="tab"
            id={privacyTabId}
            aria-selected={activePolicy === "privacy"}
            onClick={() => setActivePolicy("privacy")}
            className="rpg-tab inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
          >
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            Privacy Policy
          </button>

          <button
            type="button"
            role="tab"
            id={termsTabId}
            aria-selected={activePolicy === "terms"}
            onClick={() => setActivePolicy("terms")}
            className="rpg-tab inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
          >
            <Scale className="h-3.5 w-3.5" aria-hidden="true" />
            Terms of Service
          </button>

          <button
            type="button"
            role="tab"
            id={conductTabId}
            aria-selected={activePolicy === "conduct"}
            onClick={() => setActivePolicy("conduct")}
            className="rpg-tab inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
          >
            <HeartHandshake className="h-3.5 w-3.5" aria-hidden="true" />
            Code of Conduct
          </button>
        </div>

        {/* Privacy Policy */}
        <div
          ref={privacyPanelRef}
          role="tabpanel"
          aria-labelledby={privacyTabId}
        >
          <article className="rpg-panel p-6 sm:p-8 space-y-5 text-sm leading-relaxed text-[#fdf6e9]">
            <header className="border-b border-[#9e762a]/40 pb-3">
              <h2 className="font-pixel text-sm sm:text-base text-[#ffd15c]">
                PRIVACY POLICY
              </h2>
              <p className="mt-1 text-xs text-[#8ec8ff]">
                Last Updated: November 22, 2026
              </p>
            </header>

            <div className="space-y-4">
              <p>
                <strong>Give a Thing</strong> (&ldquo;we,&rdquo; &ldquo;us,&rdquo;
                or &ldquo;our&rdquo;), operated by Dylan Gregori Singer
                (symmetricalboy), is a cozy daily social collectibles game on
                the open ATmosphere network. This Privacy Policy explains what
                information we use, what is public by design, and how you stay
                in full control of your records.
              </p>

              <div className="space-y-1.5">
                <h3 className="font-pixel text-xs text-[#ffd15c]">
                  1. Information We Collect &amp; Use
                </h3>
                <p className="text-[#cfc3e8]">
                  When you log in with your ATmosphere Account, we receive your
                  decentralized identifier (DID), handle, public profile display
                  name, avatar, bio, and scoped OAuth credentials limited
                  strictly to Give a Thing&apos;s own{" "}
                  <code>com.giveathing.*</code> collections and PNG sprite
                  uploads. We never see your account password and cannot post to
                  your Bluesky feed on your behalf.
                </p>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-pixel text-xs text-[#ffd15c]">
                  2. Public ATmosphere &amp; Game Records
                </h3>
                <p className="text-[#cfc3e8]">
                  Like Bluesky profiles and posts, ATmosphere Personal Data
                  Server (PDS) records are public. While you play, Give a Thing
                  writes records for things you hold (
                  <code>com.giveathing.holding</code>), your pinned Top 8
                  favorites (<code>com.giveathing.favorite</code>), gift
                  transfers, pending gift offers, claims, and Give a Thing
                  friend follows to your PDS repository, and maintains canonical
                  thing definitions and ownership history on{" "}
                  <code>@giveathing.com</code>&apos;s PDS and in our game
                  database so everyone can browse collections, histories, and
                  live feeds.
                </p>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-pixel text-xs text-[#ffd15c]">
                  3. Cookies &amp; Zero Ad Tracking
                </h3>
                <p className="text-[#cfc3e8]">
                  We use a single essential, encrypted{" "}
                  <code>httpOnly</code> session cookie (<code>gat_session</code>)
                  solely to keep you logged in. We do not use advertising
                  trackers, third-party ad networks, or behavioral profiling,
                  and we never sell personal data.
                </p>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-pixel text-xs text-[#ffd15c]">
                  4. Infrastructure &amp; Service Providers
                </h3>
                <p className="text-[#cfc3e8]">
                  Give a Thing uses cloud hosting, PostgreSQL storage, S3-compatible
                  sprite storage, and AI generation APIs solely to conjure daily
                  16-bit sprites, item descriptions, and semantic search
                  embeddings. Player handles or private tokens are never used to
                  train external models.
                </p>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-pixel text-xs text-[#ffd15c]">
                  5. Deleting Your Records &amp; Contacting Us
                </h3>
                <p className="text-[#cfc3e8]">
                  You can permanently delete all <code>com.giveathing.*</code>{" "}
                  records from your ATmosphere Account&apos;s PDS, revoke your
                  OAuth session, and remove your Give a Thing profile at any
                  time using the <strong>Danger Zone</strong> below, or by
                  contacting{" "}
                  <a
                    href="mailto:support@giveathing.com"
                    className="text-[#8ec8ff] underline"
                  >
                    support@giveathing.com
                  </a>
                  .
                </p>
              </div>
            </div>
          </article>
        </div>

        {/* Terms of Service */}
        <div
          ref={termsPanelRef}
          role="tabpanel"
          aria-labelledby={termsTabId}
          hidden
        >
          <article className="rpg-panel p-6 sm:p-8 space-y-5 text-sm leading-relaxed text-[#fdf6e9]">
            <header className="border-b border-[#9e762a]/40 pb-3">
              <h2 className="font-pixel text-sm sm:text-base text-[#ffd15c]">
                TERMS OF SERVICE
              </h2>
              <p className="mt-1 text-xs text-[#8ec8ff]">
                Last Updated: November 22, 2026
              </p>
            </header>

            <div className="space-y-4">
              <p>
                Welcome to <strong>Give a Thing</strong>! By logging in or using
                giveathing.com, you agree to these Terms of Service and our Code
                of Conduct.
              </p>

              <div className="space-y-1.5">
                <h3 className="font-pixel text-xs text-[#ffd15c]">
                  1. Eligibility &amp; Your ATmosphere Account
                </h3>
                <p className="text-[#cfc3e8]">
                  You must be at least 13 years old (or the minimum digital
                  consent age in your country) to play. You are responsible for
                  maintaining the security of your ATmosphere Account and for
                  activity conducted while signed in.
                </p>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-pixel text-xs text-[#ffd15c]">
                  2. Pointless Digital Things
                </h3>
                <p className="text-[#cfc3e8]">
                  Daily things unwrapped on Give a Thing are whimsical,
                  non-financial digital items intended purely for fun,
                  collecting, and friendly gifting. They carry no cash value,
                  investment promise, or real-world redemption right. Because
                  Give a Thing is an evolving project (currently in Alpha),
                  features, limits, or mechanics may change over time.
                </p>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-pixel text-xs text-[#ffd15c]">
                  3. Gifting, Set-Aside Offers &amp; Gift Notes
                </h3>
                <p className="text-[#cfc3e8]">
                  Direct gifts to registered players transfer ownership
                  immediately. Set-aside escrow offers for friends who have not
                  yet joined remain reserved for 24 hours, after which you may
                  return the thing to your collection if unclaimed. Optional
                  gift notes (up to 140 characters) are publicly visible in the
                  thing&apos;s history and must follow our Code of Conduct.
                </p>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-pixel text-xs text-[#ffd15c]">
                  4. Upcoming Creator Tools (&ldquo;Make Things&rdquo;)
                </h3>
                <p className="text-[#cfc3e8]">
                  When upcoming creator tools launch allowing players to create
                  custom collections or optionally sell them, additional creator
                  and commerce terms will apply before you publish or sell any
                  collection.
                </p>
              </div>

              <div className="space-y-1.5">
                <h3 className="font-pixel text-xs text-[#ffd15c]">
                  5. Fair Use, Termination &amp; Disclaimers
                </h3>
                <p className="text-[#cfc3e8]">
                  Please do not automate daily pulls with bots, attempt to
                  disrupt our servers, or abuse other players. We reserve the
                  right to remove abusive content or suspend accounts that
                  violate these Terms. Give a Thing is provided &ldquo;AS
                  IS&rdquo; and &ldquo;AS AVAILABLE&rdquo; without warranties of
                  any kind, and to the fullest extent permitted by law our
                  liability is limited to the amount you paid us in the past 12
                  months ($0 for free play).
                </p>
              </div>
            </div>
          </article>
        </div>

        {/* Code of Conduct */}
        <div
          ref={conductPanelRef}
          role="tabpanel"
          aria-labelledby={conductTabId}
          hidden
        >
          <article className="rpg-panel p-6 sm:p-8 space-y-5 text-sm leading-relaxed text-[#fdf6e9]">
            <header className="border-b border-[#9e762a]/40 pb-3">
              <h2 className="font-pixel text-sm sm:text-base text-[#ffd15c]">
                CODE OF CONDUCT
              </h2>
              <p className="mt-1 text-xs text-[#8ec8ff]">
                Keep Give a Thing Kind, Silly &amp; Welcoming
              </p>
            </header>

            <div className="space-y-4">
              <p>
                Give a Thing exists so friends and strangers can delight in tiny,
                pointless 16-bit treasures together. Everyone who plays agrees
                to uphold a friendly, welcoming atmosphere:
              </p>

              <ul className="list-disc pl-5 space-y-2.5 text-[#cfc3e8]">
                <li>
                  <strong className="text-[#fdf6e9]">
                    Be Kind in Gift Notes:
                  </strong>{" "}
                  Gift notes stay attached to a thing&apos;s public story as it
                  travels from player to player. Never write hate speech, slurs,
                  harassment, threats, personal private info (doxxing), or
                  sexually explicit messages in gift notes.
                </li>
                <li>
                  <strong className="text-[#fdf6e9]">
                    Respect Boundaries:
                  </strong>{" "}
                  Don&apos;t use repeated unsolicited gifts or claim links to
                  pester, spam, or target someone who doesn&apos;t want to
                  interact with you.
                </li>
                <li>
                  <strong className="text-[#fdf6e9]">
                    Play Fairly &amp; Authentically:
                  </strong>{" "}
                  Don&apos;t impersonate other people or run automated scripts or
                  sockpuppet swarms to hoard daily pulls.
                </li>
                <li>
                  <strong className="text-[#fdf6e9]">
                    Keep Future Creations Safe:
                  </strong>{" "}
                  When custom collections arrive in Make Things, player-created
                  items must respect intellectual property and remain free of
                  hateful, illegal, or abusive imagery.
                </li>
              </ul>

              <p className="text-[#cfc3e8]">
                If someone breaks this Code of Conduct—for example, by attaching
                an abusive note to a thing—please let us know at{" "}
                <a
                  href="mailto:support@giveathing.com"
                  className="text-[#8ec8ff] underline"
                >
                  support@giveathing.com
                </a>{" "}
                or message{" "}
                <a
                  href="https://bsky.app/profile/giveathing.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#8ec8ff] underline"
                >
                  @giveathing.com
                </a>{" "}
                on Bluesky so we can clean it up promptly.
              </p>
            </div>
          </article>
        </div>
      </section>

      {/* Danger Zone */}
      <section aria-label="Danger Zone" className="rpg-panel-red p-6 sm:p-8 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-[#ff4d6d]/40 pb-3">
          <AlertTriangle
            className="h-5 w-5 shrink-0 text-[#ff4d6d]"
            aria-hidden="true"
          />
          <h2 className="font-pixel text-sm sm:text-base text-[#ff99ac]">
            DANGER ZONE
          </h2>
        </div>

        <p className="text-xs sm:text-sm leading-relaxed text-[#fdf6e9]">
          Want to leave Give a Thing completely? Deleting your Give a Thing data
          will permanently remove every <code>com.giveathing.*</code> record
          stored in your ATmosphere Account&apos;s Personal Data Server
          (holdings, Top 8 favorites, transfers, offers, claims, and follows),
          return any things you currently hold back to{" "}
          <code>@giveathing.com</code>, erase your Give a Thing profile &amp;
          session from our servers, and sign you out for good. Your Bluesky /
          ATmosphere Account itself is never harmed.
        </p>

        {!viewerHandle ? (
          <div className="rounded border border-[#ff4d6d]/50 bg-[#160f24] px-4 py-3 text-xs text-[#cfc3e8]">
            You are currently logged out.{" "}
            <Link
              href="/login?returnTo=/other"
              className="font-semibold text-[#8ec8ff] underline hover:text-[#ffd15c]"
            >
              LOGIN
            </Link>{" "}
            with your ATmosphere Account if you wish to permanently delete your
            Give a Thing records.
          </div>
        ) : isSystemAccount ? (
          <div className="rounded border border-[#ffd15c]/50 bg-[#160f24] px-4 py-3 text-xs text-[#ffd15c]">
            Signed in as official catalog account @{viewerHandle} (protected
            from deletion).
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1 pb-1">
            <span className="text-xs text-[#cfc3e8]">
              Currently logged in as{" "}
              <strong className="text-[#ffd15c]">@{viewerHandle}</strong>
            </span>

            <button
              type="button"
              onClick={() => {
                setConfirmText("");
                setDeleteError(null);
                setConfirmOpen(true);
              }}
              className="rpg-btn-red inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Delete All Give a Thing Records &amp; Sign Out
            </button>
          </div>
        )}
      </section>

      {/* Destructive Confirmation Modal */}
      <RpgModal
        open={confirmOpen}
        onClose={() => {
          if (!deleting) setConfirmOpen(false);
        }}
        title="Permanently Delete Records?"
      >
        <form onSubmit={handlePermanentDelete} className="space-y-4">
          <p className="text-xs sm:text-sm leading-relaxed text-[#fdf6e9]">
            This action cannot be undone. All{" "}
            <code>com.giveathing.*</code> records in{" "}
            <strong>@{viewerHandle}</strong>&apos;s ATmosphere repository and
            your Give a Thing account profile will be permanently deleted, any
            things you hold will return to <code>@giveathing.com</code>, and you
            will be signed out for good.
          </p>

          <div>
            <label
              htmlFor={confirmInputId}
              className="mb-1.5 block font-pixel text-xs text-[#ff99ac]"
            >
              Type DELETE to confirm
            </label>
            <input
              id={confirmInputId}
              type="text"
              autoComplete="off"
              placeholder="DELETE"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="rpg-slot w-full px-3.5 py-2.5 text-sm text-[#fdf6e9] placeholder:text-[#cfc3e8]/40 focus:border-[#ff4d6d] focus:outline-none"
            />
          </div>

          {deleteError && (
            <p
              role="alert"
              className="rounded border border-[#ff4d6d] bg-[#ff4d6d]/15 px-3 py-2 text-xs text-[#ff99ac]"
            >
              {deleteError}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3 pt-1">
            <button
              type="button"
              autoFocus
              disabled={deleting}
              onClick={() => setConfirmOpen(false)}
              className="rpg-btn-secondary px-4 py-2 font-pixel text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deleting || confirmText.trim() !== "DELETE"}
              className="rpg-btn-red inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              {deleting ? "Deleting Records..." : "Delete Forever & Sign Out"}
            </button>
          </div>
        </form>
      </RpgModal>
    </div>
  );
}
