import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExternalLink, Flame, ScrollText, ShieldCheck, Sparkles } from "lucide-react";
import { getCurrentSession } from "@/lib/session";
import { getThingDetailWithLedger } from "@/lib/queries";
import { buildPdsExplorerUrl } from "@/lib/lexicons";
import { ThingInspectorActions } from "@/components/ThingInspectorActions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tid: string }>;
}): Promise<Metadata> {
  const { tid } = await params;
  try {
    const thing = await getThingDetailWithLedger(tid);
    if (!thing) return { title: "Thing Not Found" };
    return {
      title: `#${String(thing.catalogNumber).padStart(4, "0")} ${thing.name}`,
      description: thing.description,
    };
  } catch {
    return { title: "Inspect Thing" };
  }
}

export default async function ThingInspectorPage({
  params,
}: {
  params: Promise<{ tid: string }>;
}) {
  const { tid } = await params;
  const session = await getCurrentSession();

  let detail: Awaited<ReturnType<typeof getThingDetailWithLedger>> = null;
  try {
    detail = await getThingDetailWithLedger(tid);
  } catch {
    notFound();
  }

  if (!detail) {
    notFound();
  }

  const isViewerOwner = session?.did === detail.currentOwner.did;

  return (
    <div className="space-y-8">
      {/* Main RPG Item Card */}
      <section className="rpg-panel p-5 sm:p-8">
        <div className="grid gap-6 md:grid-cols-[240px_1fr]">
          {/* Zoomed 16-bit Sprite Showcase */}
          <div className="flex flex-col items-center">
            <div className="rpg-slot flex h-52 w-52 items-center justify-center p-4">
              <img
                src={detail.iconUrl}
                alt={detail.iconAlt}
                width={176}
                height={176}
                className="pixel-art h-44 w-44 object-contain"
              />
            </div>

            <div className="mt-3 text-center space-y-1">
              <p className="font-pixel text-xs text-[#e5b54f]">
                CATALOG #{String(detail.catalogNumber).padStart(4, "0")}
              </p>
              <p className="text-xs text-[#bfb2d6]">
                Pulled {detail.pullUtcDate} UTC
              </p>
            </div>
          </div>

          {/* Item Details */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-[#4be3a0]/40 bg-[#140f1d] px-2.5 py-0.5 text-xs font-medium text-[#4be3a0]">
                {detail.category}
              </span>
              <span className="rounded bg-[#140f1d] px-2.5 py-0.5 text-xs text-[#bfb2d6]">
                {detail.subcategory}
              </span>
              {detail.transferCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-[#ff5c8a]/20 px-2.5 py-0.5 font-pixel text-[10px] text-[#ff8fb1]">
                  <Flame className="h-3 w-3" aria-hidden="true" />
                  Traded {detail.transferCount}{" "}
                  {detail.transferCount === 1 ? "time" : "times"}
                </span>
              )}
            </div>

            <h1 className="font-pixel text-lg sm:text-xl text-[#fbf4e4]">
              {detail.name}
            </h1>

            <p className="text-sm sm:text-base leading-relaxed text-[#fbf4e4]/95">
              {detail.description}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#8c6826]/45 bg-[#140f1d]/85 px-4 py-3 text-xs">
              <span className="italic text-[#bfb2d6]">
                &ldquo;{detail.flavorText}&rdquo;
              </span>
              <span className="font-pixel text-[11px] text-[#f5c451]">
                {detail.uselessTrait}
              </span>
            </div>

            {/* Ownership Summary */}
            <div className="grid gap-3 sm:grid-cols-2 pt-1">
              <div className="rpg-slot p-3 text-xs">
                <span className="block font-pixel text-[10px] text-[#bfb2d6] mb-1">
                  ORIGINALLY DISCOVERED BY
                </span>
                <Link
                  href={`/u/${encodeURIComponent(detail.discoverer.handle)}`}
                  className="font-semibold text-sm text-[#f5c451] hover:underline"
                >
                  @{detail.discoverer.handle}
                </Link>
              </div>

              <div className="rpg-slot p-3 text-xs">
                <span className="block font-pixel text-[10px] text-[#bfb2d6] mb-1">
                  CURRENTLY HELD BY
                </span>
                <Link
                  href={`/u/${encodeURIComponent(detail.currentOwner.handle)}`}
                  className="font-semibold text-sm text-[#4be3a0] hover:underline"
                >
                  @{detail.currentOwner.handle}
                </Link>
              </div>
            </div>

            {/* Owner Controls (Give / Escrow Revoke) */}
            <ThingInspectorActions
              thing={{
                thingTid: detail.thingTid,
                catalogNumber: detail.catalogNumber,
                name: detail.name,
                iconUrl: detail.iconUrl,
                iconAlt: detail.iconAlt,
              }}
              status={detail.status}
              isViewerOwner={isViewerOwner}
              activeEscrow={detail.activeEscrow}
            />

            {/* ATProtocol Network Verification Links */}
            <div className="flex flex-wrap items-center gap-3 border-t border-[#8c6826]/40 pt-3 text-xs text-[#bfb2d6]">
              <span className="inline-flex items-center gap-1.5 text-[#e5b54f] font-pixel text-[10px]">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                ATProtocol PDS Proofs:
              </span>

              {detail.canonicalAtUri && (
                <a
                  href={buildPdsExplorerUrl(detail.canonicalAtUri)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-[#fbf4e4] underline"
                >
                  Canonical Genesis Record
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}

              {detail.currentHoldingAtUri && (
                <a
                  href={buildPdsExplorerUrl(detail.currentHoldingAtUri)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-[#fbf4e4] underline"
                >
                  Holder PDS Slot
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Permanent Provenance Ledger ("All Previous Owners") */}
      <section aria-label="Permanent Provenance Ledger" className="rpg-panel p-5 sm:p-7 space-y-5">
        <div className="flex items-center justify-between gap-2 border-b-2 border-[#8c6826]/50 pb-3">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-[#f5c451]" aria-hidden="true" />
            <h2 className="font-pixel text-xs sm:text-sm text-[#f5c451]">
              PERMANENT PROVENANCE LEDGER ({detail.provenance.length}{" "}
              {detail.provenance.length === 1 ? "ENTRY" : "ENTRIES"})
            </h2>
          </div>
          <span className="text-xs text-[#bfb2d6]">
            Immutable ATProtocol Chain
          </span>
        </div>

        <ol className="relative ml-3 space-y-4 border-l-2 border-[#e5b54f]/50 pl-6">
          {detail.provenance.map((hop, idx) => {
            const isCurrent = idx === detail.provenance.length - 1;
            return (
              <li key={hop.entryTid} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-sm border-2 ${
                    isCurrent
                      ? "border-[#4be3a0] bg-[#4be3a0] text-[#140f1d]"
                      : "border-[#e5b54f] bg-[#140f1d]"
                  }`}
                />

                <div className="rpg-slot p-3.5 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-pixel text-[10px] text-[#e5b54f]">
                        #{hop.sequenceNum + 1}
                      </span>

                      {hop.via === "daily_pull" ? (
                        <span>
                          Discovered in the daily pull by{" "}
                          <Link
                            href={`/u/${encodeURIComponent(hop.toUser.handle)}`}
                            className="font-semibold text-[#f5c451] hover:underline"
                          >
                            @{hop.toUser.handle}
                          </Link>
                        </span>
                      ) : hop.via === "escrow_claim" ? (
                        <span>
                          Set aside by{" "}
                          {hop.fromUser && (
                            <Link
                              href={`/u/${encodeURIComponent(hop.fromUser.handle)}`}
                              className="font-semibold text-[#f5c451] hover:underline"
                            >
                              @{hop.fromUser.handle}
                            </Link>
                          )}{" "}
                          &amp; claimed via Bluesky invite by{" "}
                          <Link
                            href={`/u/${encodeURIComponent(hop.toUser.handle)}`}
                            className="font-semibold text-[#4be3a0] hover:underline"
                          >
                            @{hop.toUser.handle}
                          </Link>
                        </span>
                      ) : (
                        <span>
                          Given by{" "}
                          {hop.fromUser && (
                            <Link
                              href={`/u/${encodeURIComponent(hop.fromUser.handle)}`}
                              className="font-semibold text-[#f5c451] hover:underline"
                            >
                              @{hop.fromUser.handle}
                            </Link>
                          )}{" "}
                          to{" "}
                          <Link
                            href={`/u/${encodeURIComponent(hop.toUser.handle)}`}
                            className="font-semibold text-[#4be3a0] hover:underline"
                          >
                            @{hop.toUser.handle}
                          </Link>
                        </span>
                      )}

                      {isCurrent && (
                        <span className="inline-flex items-center gap-1 rounded bg-[#4be3a0]/20 px-1.5 py-0.5 font-pixel text-[9px] text-[#4be3a0]">
                          <Sparkles className="h-2.5 w-2.5" aria-hidden="true" />
                          CURRENT HOLDER
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-[#bfb2d6]/80">
                      <time dateTime={hop.occurredAtIso}>
                        {new Date(hop.occurredAtIso).toISOString().replace("T", " ").slice(0, 16)} UTC
                      </time>
                      {hop.ledgerAtUri && (
                        <a
                          href={buildPdsExplorerUrl(hop.ledgerAtUri)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Inspect Ledger Entry on PDS"
                          className="text-[#e5b54f] hover:underline inline-flex items-center gap-0.5"
                        >
                          PDS
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  {hop.note && (
                    <blockquote className="rounded border-l-2 border-[#e5b54f] bg-[#1d162b] px-3 py-1.5 text-xs italic text-[#fbf4e4]">
                      &ldquo;{hop.note}&rdquo;
                    </blockquote>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
