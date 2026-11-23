import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Backpack, ExternalLink, Link2 } from "lucide-react";
import { getCurrentSession } from "@/lib/session";
import { getPlayerProfile } from "@/lib/queries";
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
      {/* Player RPG Profile Banner with Bluesky Profile Link at Top Right */}
      <section className="rpg-panel overflow-hidden">
        <div className="candy-ribbon w-full" aria-hidden="true" />

        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              {profile.player.avatarUrl ? (
                <img
                  src={profile.player.avatarUrl}
                  alt=""
                  className="h-18 w-18 shrink-0 rounded-md border-2 border-[#ffd15c] object-cover shadow-[0_3px_0_#0d0816]"
                />
              ) : (
                <div className="rpg-slot flex h-18 w-18 shrink-0 items-center justify-center">
                  <Backpack
                    className="h-8 w-8 text-[#ffd15c]"
                    aria-hidden="true"
                  />
                </div>
              )}

              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-pixel text-base sm:text-lg text-[#fdf6e9]">
                    {profile.player.displayName || `@${profile.player.handle}`}
                  </h1>
                  {profile.player.pronouns && (
                    <span className="rounded-full border border-[#4da6ff]/60 bg-[#4da6ff]/15 px-2.5 py-0.5 font-pixel text-[10px] text-[#8ec8ff]">
                      {profile.player.pronouns}
                    </span>
                  )}
                </div>

                <p className="text-xs font-semibold text-[#ffd15c]">
                  @{profile.player.handle}
                </p>

                {profile.player.bio && (
                  <p className="max-w-2xl whitespace-pre-line text-xs sm:text-sm leading-relaxed text-[#fdf6e9]/95">
                    {profile.player.bio}
                  </p>
                )}

                {profile.player.links.length > 0 && (
                  <ul
                    aria-label="Profile links"
                    className="flex flex-wrap items-center gap-2 pt-0.5"
                  >
                    {profile.player.links.map((link) => (
                      <li key={link.url}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded border border-[#ff4d6d]/55 bg-[#160f24] px-2.5 py-1 text-xs text-[#ff99ac] transition-colors hover:border-[#ffd15c] hover:text-[#ffd15c]"
                        >
                          {link.icon ? (
                            <img
                              src={link.icon}
                              alt=""
                              className="h-3.5 w-3.5 rounded-xs object-contain"
                            />
                          ) : (
                            <Link2 className="h-3 w-3" aria-hidden="true" />
                          )}
                          <span className="max-w-[210px] truncate">
                            {link.title}
                          </span>
                          <ExternalLink
                            className="h-2.5 w-2.5 opacity-80"
                            aria-hidden="true"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Bluesky Profile Button at Top Right */}
            <div className="shrink-0">
              <a
                href={profile.player.bskyProfileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rpg-btn-blue inline-flex items-center gap-1.5 px-3.5 py-2 font-pixel text-xs"
              >
                Bluesky Profile
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <UserProfileClient
        playerDid={profile.player.did}
        playerHandle={profile.player.handle}
        viewerDid={session?.did ?? null}
        initialIsFollowing={profile.isFollowing}
        heldCount={profile.stats.heldCount}
        discoveredCount={profile.stats.discoveredCount}
        createdCount={profile.stats.createdCount}
        givenAwayCount={profile.stats.givenAwayCount}
        followingCount={profile.stats.followingCount}
        followersCount={profile.stats.followersCount}
        followingList={profile.followingList}
        followersList={profile.followersList}
        topThings={profile.topThings}
        inventory={profile.inventory}
        outgoingEscrows={profile.outgoingEscrows}
      />
    </div>
  );
}
