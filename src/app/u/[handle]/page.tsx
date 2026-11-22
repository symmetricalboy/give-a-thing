import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Backpack, ExternalLink } from "lucide-react";
import { getCurrentSession } from "@/lib/session";
import { getPlayerProfile } from "@/lib/queries";
import { buildPdsExplorerUrl, LEXICON_NSIDS } from "@/lib/lexicons";
import { UserProfileClient } from "@/components/UserProfileClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const clean = decodeURIComponent(handle).replace(/^@/, "");
  return {
    title: `@${clean}'s Things`,
    description: `See all the pointless 16-bit things @${clean} owns on Give a Thing, including their Featured Top 8.`,
  };
}

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const session = await getCurrentSession();

  let profile: Awaited<ReturnType<typeof getPlayerProfile>> = null;
  try {
    profile = await getPlayerProfile(handle, session?.did ?? null);
  } catch {
    notFound();
  }

  if (!profile) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Player RPG Profile Banner */}
      <section className="rpg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {profile.player.avatarUrl ? (
              <img
                src={profile.player.avatarUrl}
                alt=""
                className="h-16 w-16 rounded border-2 border-[#e5b54f] object-cover"
              />
            ) : (
              <div className="rpg-slot flex h-16 w-16 items-center justify-center">
                <Backpack
                  className="h-8 w-8 text-[#e5b54f]"
                  aria-hidden="true"
                />
              </div>
            )}

            <div>
              <h1 className="font-pixel text-base sm:text-lg text-[#fbf4e4]">
                {profile.player.displayName || `@${profile.player.handle}`}
              </h1>
              <p className="text-xs text-[#f5c451]">@{profile.player.handle}</p>
              <a
                href={buildPdsExplorerUrl(
                  `at://${profile.player.did}/${LEXICON_NSIDS.HOLDING}`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#bfb2d6] hover:text-[#fbf4e4] underline"
              >
                Inspect Live PDS Collection ({LEXICON_NSIDS.HOLDING})
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Stats Counters */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="rpg-slot px-3.5 py-2">
              <span className="font-pixel block text-sm text-[#4be3a0]">
                {profile.stats.heldCount}
              </span>
              <span className="text-[11px] text-[#bfb2d6]">Owned</span>
            </div>
            <div className="rpg-slot px-3.5 py-2">
              <span className="font-pixel block text-sm text-[#f5c451]">
                {profile.stats.discoveredCount}
              </span>
              <span className="text-[11px] text-[#bfb2d6]">Discovered</span>
            </div>
            <div className="rpg-slot px-3.5 py-2">
              <span className="font-pixel block text-sm text-[#ff8fb1]">
                {profile.stats.givenAwayCount}
              </span>
              <span className="text-[11px] text-[#bfb2d6]">Given Away</span>
            </div>
          </div>
        </div>
      </section>

      <UserProfileClient
        playerDid={profile.player.did}
        playerHandle={profile.player.handle}
        viewerDid={session?.did ?? null}
        initialIsFollowing={profile.isFollowing}
        topThings={profile.topThings}
        inventory={profile.inventory}
        outgoingEscrows={profile.outgoingEscrows}
      />
    </div>
  );
}
