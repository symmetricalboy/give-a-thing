"use client";

import React from "react";
import Link from "next/link";
import { Flame, Lock, Send, Star } from "lucide-react";
import type { ThingCardItem } from "@/lib/queries";

interface ThingGridCardProps {
  item: ThingCardItem;
  isViewerOwner?: boolean;
  onGiveClick?: (item: ThingCardItem) => void;
  onToggleFavorite?: (item: ThingCardItem) => void;
  favoriteBusy?: boolean;
}

export function ThingGridCard({
  item,
  isViewerOwner = false,
  onGiveClick,
  onToggleFavorite,
  favoriteBusy = false,
}: ThingGridCardProps) {
  const isFav = Boolean(item.favoriteSlot);

  return (
    <article className="thing-card rpg-panel-subtle p-5 transition-colors hover:border-[#4da6ff]">
      {/* Row 1: Sprite Pedestal & Catalog Header */}
      <div className="min-w-0">
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-1.5">
          <span className="font-pixel text-[11px] text-[#ffd15c]">
            #{String(item.catalogNumber).padStart(4, "0")}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {isFav && (
              <span className="inline-flex items-center gap-1 rounded bg-[#ffd15c]/20 px-1.5 py-0.5 font-pixel text-[9px] text-[#ffd15c]">
                <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                TOP #{item.favoriteSlot}
              </span>
            )}
            {item.status === "escrowed" && (
              <span className="inline-flex items-center gap-1 rounded bg-[#4da6ff]/20 px-1.5 py-0.5 font-pixel text-[9px] text-[#8ec8ff]">
                <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                SET ASIDE
              </span>
            )}
            {item.transferCount > 0 && (
              <span
                title={`Traded ${item.transferCount} times`}
                className="inline-flex items-center gap-1 rounded bg-[#ff4d6d]/20 px-1.5 py-0.5 font-pixel text-[9px] text-[#ff99ac]"
              >
                <Flame className="h-2.5 w-2.5" aria-hidden="true" />
                {item.transferCount}x
              </span>
            )}
          </div>
        </div>

        <Link
          href={`/thing/${item.thingTid}`}
          className="rpg-slot mx-auto mb-3.5 flex h-28 w-28 items-center justify-center p-2 hover:border-[#ffd15c]"
        >
          <img
            src={item.iconUrl}
            alt={item.iconAlt}
            width={88}
            height={88}
            className="pixel-art h-22 w-22 object-contain transition-transform hover:scale-105"
          />
        </Link>
      </div>

      {/* Row 2: Category & Title */}
      <div className="min-w-0 space-y-1.5">
        <p className="text-[11px] font-medium leading-snug text-[#8ec8ff] break-words">
          {item.collectionId ? (
            <Link
              href={`/collection/${encodeURIComponent(item.collectionId)}`}
              className="hover:text-[#ffd15c] hover:underline"
            >
              {item.category}
            </Link>
          ) : (
            item.category
          )}
        </p>
        <h3 className="font-semibold text-sm sm:text-base leading-snug text-[#fdf6e9] break-words">
          <Link
            href={`/thing/${item.thingTid}`}
            className="hover:text-[#ffd15c]"
          >
            {item.name}
          </Link>
        </h3>
      </div>

      {/* Row 3: Owner & Actions */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-[#9e762a]/35 pt-3 pb-1 text-xs">
        <Link
          href={`/u/${encodeURIComponent(item.currentOwner.handle)}`}
          className="min-w-0 max-w-full truncate text-[#cfc3e8] hover:text-[#ffd15c]"
        >
          @{item.currentOwner.handle}
        </Link>

        <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
          {isViewerOwner && onToggleFavorite && (
            <button
              type="button"
              disabled={favoriteBusy}
              onClick={() => onToggleFavorite(item)}
              aria-label={
                isFav ? "Remove from Top 8 things" : "Add to Top 8 things"
              }
              title={isFav ? "Remove from Top 8" : "Feature in Top 8"}
              className={`rpg-btn-secondary inline-flex items-center gap-1 px-2.5 py-1 font-pixel text-[9px] ${
                isFav ? "border-[#ffd15c] text-[#ffd15c]" : "text-[#cfc3e8]"
              }`}
            >
              <Star
                className={`h-3 w-3 ${isFav ? "fill-current" : ""}`}
                aria-hidden="true"
              />
              {isFav ? `#${item.favoriteSlot}` : "Top 8"}
            </button>
          )}

          {isViewerOwner && item.status === "held" && onGiveClick && (
            <button
              type="button"
              onClick={() => onGiveClick(item)}
              className="rpg-btn-red inline-flex shrink-0 items-center gap-1 px-2.5 py-1 font-pixel text-[10px]"
            >
              <Send className="h-3 w-3" aria-hidden="true" />
              Give
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
