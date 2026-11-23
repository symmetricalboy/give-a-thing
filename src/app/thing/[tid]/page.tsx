import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Flame, ScrollText, Sparkles } from "lucide-react";
import { getCurrentSession } from "@/lib/session";
import { getThingDetailWithLedger } from "@/lib/queries";
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
  const isViewerCreator = session?.did === detail.creator.did;

  return (
    <div className="space-y-6">
      {/* Main RPG Item Card */}
      <section className="rpg-panel p-5 sm:p-6">
        <div className="grid gap-6 md:grid-cols-[240px_1fr]">
          {/* Zoomed 16-bit Sprite Showcase */}
          <div className="flex flex-col items-center">
            <div className="rpg-slot flex h-52 w-52 items-center justify-center p-4 border-[#4da6ff]/50">
              <img
                src={detail.iconUrl}
                alt={detail.iconAlt}
                width={176}
                height={176}
                className="pixel-art h-44 w-44 object-contain"
              />
            </div>

            <div className="mt-3 text-center space-y-1">
              <p className="font-pixel text-xs text-[#ffd15c]">
                CATALOG #{String(detail.catalogNumber).padStart(4, "0")}
              </p>
              <p className="text-xs text-[#cfc3e8]">
                Pulled {detail.pullUtcDate} UTC
              </p>
            </div>
          </div>

          {/* Item Details */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-[#4da6ff]/50 bg-[#160f24] px-2.5 py-0.5 text-xs font-medium text-[#8ec8ff]">
                {detail.category}
              </span>
              <span className="rounded bg-[#160f24] px-2.5 py-0.5 text-xs text-[#cfc3e8]">
                {detail.subcategory}
              </span>
              {detail.transferCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded bg-[#ff4d6d]/20 px-2.5 py-0.5 font-pixel text-[10px] text-[#ff99ac] border border-[#ff4d6d]/40">
                  <Flame className="h-3 w-3" aria-hidden="true" />
                  Traded {detail.transferCount}{" "}
                  {detail.transferCount === 1 ? "time" : "times"}
                </span>
              )}
            </div>

            <h1 className="font-pixel text-lg sm:text-xl text-[#fdf6e9]">
              {detail.name}
            </h1>

            <p className="text-sm sm:text-base leading-relaxed text-[#fdf6e9]/95">
              {detail.description}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-[#9e762a]/45 bg-[#160f24]/85 px-4 py-3 text-xs">
              <span className="italic text-[#cfc3e8]">
                &ldquo;{detail.flavorText}&rdquo;
              </span>
              <span className="font-pixel text-[11px] text-[#ffd15c]">
                {detail.uselessTrait}
              </span>
            </div>

            {/* Creator & Ownership Summary */}
            <div className="grid gap-3 sm:grid-cols-3 pt-1">
              <div className="rpg-slot p-3 text-xs">
                <span className="block font-pixel text-[10px] text-[#cfc3e8] mb-1">
                  CREATED BY
                </span>
                <Link
                  href={`/u/${encodeURIComponent(detail.creator.handle)}`}
                  className="font-semibold text-sm text-[#c49bff] hover:underline"
                >
                  @{detail.creator.handle}
                </Link>
              </div>

              <div className="rpg-slot p-3 text-xs">
                <span className="block font-pixel text-[10px] text-[#cfc3e8] mb-1">
                  ORIGINALLY DISCOVERED BY
                </span>
                <Link
                  href={`/u/${encodeURIComponent(detail.discoverer.handle)}`}
                  className="font-semibold text-sm text-[#ffd15c] hover:underline"
                >
                  @{detail.discoverer.handle}
                </Link>
              </div>

              <div className="rpg-slot p-3 text-xs">
                <span className="block font-pixel text-[10px] text-[#cfc3e8] mb-1">
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

            {/* Owner & Creator Controls (Give / Escrow Revoke / Creator Destroy) */}
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
              isViewerCreator={isViewerCreator}
              activeEscrow={detail.activeEscrow}
            />
          </div>
        </div>
      </section>

      {/* Ownership History ("All Previous Owners") */}
      <section
        aria-labelledby="ownership-history-heading"
        className="rpg-panel p-5 sm:p-6 space-y-5"
      >
        <div className="flex items-center justify-between gap-2 border-b-2 border-[#9e762a]/50 pb-3">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-[#ffd15c]" aria-hidden="true" />
            <h2
              id="ownership-history-heading"
              className="font-pixel text-xs sm:text-sm text-[#ffd15c]"
            >
              OWNERSHIP HISTORY ({detail.provenance.length}{" "}
              {detail.provenance.length === 1 ? "STOP" : "STOPS"})
            </h2>
          </div>
          <span className="text-xs text-[#8ec8ff]">All Previous Owners</span>
        </div>

        <ol className="relative ml-3 space-y-4 border-l-2 border-[#ffd15c]/50 pl-6">
          {detail.provenance.map((hop, idx) => {
            const isCurrent = idx === detail.provenance.length - 1;
            return (
              <li key={hop.entryTid} className="relative">
                <span
                  aria-hidden="true"
                  className={`absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-sm border-2 ${
                    isCurrent
                      ? "border-[#4be3a0] bg-[#4be3a0] text-[#160f24]"
                      : "border-[#ff4d6d] bg-[#160f24]"
                  }`}
                />

                <div className="rpg-slot p-3.5 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-pixel text-[10px] text-[#ffd15c]">
                        #{hop.sequenceNum + 1}
                      </span>

                      {hop.via === "daily_pull" ? (
                        <span>
                          Discovered in the daily pull by{" "}
                          <Link
                            href={`/u/${encodeURIComponent(hop.toUser.handle)}`}
                            className="font-semibold text-[#ffd15c] hover:underline"
                          >
                            @{hop.toUser.handle}
                          </Link>
                        </span>
                      ) : hop.via === "mystery_box" ? (
                        <span>
                          Discovered in a Mystery Box by{" "}
                          <Link
                            href={`/u/${encodeURIComponent(hop.toUser.handle)}`}
                            className="font-semibold text-[#ffd15c] hover:underline"
                          >
                            @{hop.toUser.handle}
                          </Link>
                        </span>
                      ) : hop.via === "mystery_box_purchase" ? (
                        <span>
                          Purchased from a Mystery Box by{" "}
                          <Link
                            href={`/u/${encodeURIComponent(hop.toUser.handle)}`}
                            className="font-semibold text-[#ffd15c] hover:underline"
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
                              className="font-semibold text-[#ffd15c] hover:underline"
                            >
                              @{hop.fromUser.handle}
                            </Link>
                          )}{" "}
                          &amp; claimed via Bluesky invite by{" "}
                          <Link
                            href={`/u/${encodeURIComponent(hop.toUser.handle)}`}
                            className="font-semibold text-[#8ec8ff] hover:underline"
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
                              className="font-semibold text-[#ffd15c] hover:underline"
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

                    <time
                      dateTime={hop.occurredAtIso}
                      className="text-[11px] text-[#cfc3e8]/80"
                    >
                      {new Date(hop.occurredAtIso)
                        .toISOString()
                        .replace("T", " ")
                        .slice(0, 16)}{" "}
                      UTC
                    </time>
                  </div>

                  {hop.note && (
                    <blockquote className="rounded border-l-2 border-[#ff4d6d] bg-[#251a3c] px-3 py-1.5 text-xs italic text-[#fdf6e9]">
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
