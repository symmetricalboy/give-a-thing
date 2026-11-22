"use client";

import React, { useId, useState } from "react";
import { Flame, Search, Sparkles } from "lucide-react";
import type { ThingCardItem } from "@/lib/queries";
import { MACRO_CATEGORIES } from "@/lib/generator/categories";
import { ThingGridCard } from "./ThingGridCard";
import { GiveThingModal } from "./GiveThingModal";

interface CatalogBrowserProps {
  initialItems: ThingCardItem[];
  initialTotalCount: number;
  viewerDid: string | null;
}

export function CatalogBrowser({
  initialItems,
  initialTotalCount,
  viewerDid,
}: CatalogBrowserProps) {
  const searchInputId = useId();
  const [items, setItems] = useState<ThingCardItem[]>(initialItems);
  const [totalCount, setTotalCount] = useState(initialTotalCount);
  const [query, setQuery] = useState("");
  const [semantic, setSemantic] = useState(false);
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<"newest" | "oldest" | "hot_potato">(
    "newest"
  );
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [giveTarget, setGiveTarget] = useState<ThingCardItem | null>(null);

  const pageSize = 24;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  async function runQuery(overrides?: {
    q?: string;
    sem?: boolean;
    cat?: string;
    s?: "newest" | "oldest" | "hot_potato";
    p?: number;
  }) {
    const qVal = overrides?.q ?? query;
    const semVal = overrides?.sem ?? semantic;
    const catVal = overrides?.cat ?? category;
    const sortVal = overrides?.s ?? sort;
    const pageVal = overrides?.p ?? page;

    setLoading(true);
    try {
      const url = new URL("/api/catalog", window.location.origin);
      if (qVal.trim()) url.searchParams.set("q", qVal.trim());
      if (semVal && qVal.trim()) url.searchParams.set("semantic", "1");
      if (catVal) url.searchParams.set("category", catVal);
      url.searchParams.set("sort", sortVal);
      url.searchParams.set("page", String(pageVal));

      const res = await fetch(url.toString());
      if (!res.ok) return;
      const data = (await res.json()) as {
        items: ThingCardItem[];
        totalCount: number;
      };
      setItems(data.items);
      setTotalCount(data.totalCount);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Search & Controls Panel */}
      <div className="rpg-panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="font-pixel text-sm sm:text-base text-[#f5c451]">
              ALL DISCOVERED THINGS
            </h1>
            <p className="text-xs text-[#bfb2d6] mt-0.5">
              Every unique pointless thing ever pulled into existence ({totalCount}{" "}
              discovered so far).
            </p>
          </div>

          {/* Sort Mode */}
          <div className="inline-flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSort("newest");
                setPage(1);
                void runQuery({ s: "newest", p: 1 });
              }}
              className={`px-3 py-1.5 font-pixel text-[10px] ${
                sort === "newest" ? "rpg-btn-primary" : "rpg-btn-secondary"
              }`}
            >
              Newest
            </button>
            <button
              type="button"
              onClick={() => {
                setSort("hot_potato");
                setPage(1);
                void runQuery({ s: "hot_potato", p: 1 });
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 font-pixel text-[10px] ${
                sort === "hot_potato" ? "rpg-btn-primary" : "rpg-btn-secondary"
              }`}
            >
              <Flame className="h-3 w-3" aria-hidden="true" />
              Hot Potatoes
            </button>
            <button
              type="button"
              onClick={() => {
                setSort("oldest");
                setPage(1);
                void runQuery({ s: "oldest", p: 1 });
              }}
              className={`px-3 py-1.5 font-pixel text-[10px] ${
                sort === "oldest" ? "rpg-btn-primary" : "rpg-btn-secondary"
              }`}
            >
              #0001+
            </button>
          </div>
        </div>

        {/* Search Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            void runQuery({ p: 1 });
          }}
          className="flex flex-col gap-2.5 sm:flex-row"
        >
          <div className="relative flex-1">
            <label htmlFor={searchInputId} className="sr-only">
              Search discovered things
            </label>
            <input
              id={searchInputId}
              type="search"
              placeholder={
                semantic
                  ? "Describe a vibe (e.g. 'nostalgic 90s school desk clutter')..."
                  : "Search by thing name, description, or aisle..."
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) {
                    e.preventDefault();
                  }
                }
              }}
              className="rpg-slot w-full px-3.5 py-2.5 text-sm text-[#fbf4e4] placeholder:text-[#bfb2d6]/50 focus:border-[#f5c451] focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !semantic;
              setSemantic(next);
              if (query.trim()) {
                setPage(1);
                void runQuery({ sem: next, p: 1 });
              }
            }}
            className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 font-pixel text-[10px] ${
              semantic
                ? "border-2 border-[#4be3a0] bg-[#4be3a0]/20 text-[#4be3a0]"
                : "rpg-btn-secondary text-[#bfb2d6]"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Vibe Search {semantic ? "ON" : "OFF"}
          </button>

          <button
            type="submit"
            disabled={loading}
            className="rpg-btn-primary inline-flex items-center justify-center gap-1.5 px-5 py-2.5 font-pixel text-xs"
          >
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
            {loading ? "Searching..." : "Search"}
          </button>
        </form>

        {/* Category Pills */}
        <details className="group">
          <summary className="cursor-pointer font-pixel text-[11px] text-[#e5b54f] hover:underline">
            {category
              ? `Filtering Category: ${category} (Click to change)`
              : "Browse by 30 Thing Categories"}
          </summary>
          <div className="pill-row mt-3 pt-2 border-t border-[#8c6826]/40">
            <button
              type="button"
              onClick={() => {
                setCategory("");
                setPage(1);
                void runQuery({ cat: "", p: 1 });
              }}
              className={`px-2.5 py-1 text-xs rounded ${
                category === ""
                  ? "bg-[#f5c451] font-semibold text-[#1a1105]"
                  : "bg-[#140f1d] text-[#bfb2d6] hover:text-[#fbf4e4]"
              }`}
            >
              All Categories
            </button>
            {MACRO_CATEGORIES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setCategory(m.label);
                  setPage(1);
                  void runQuery({ cat: m.label, p: 1 });
                }}
                className={`px-2.5 py-1 text-xs rounded ${
                  category === m.label
                    ? "bg-[#f5c451] font-semibold text-[#1a1105]"
                    : "bg-[#140f1d] text-[#bfb2d6] hover:text-[#fbf4e4]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </details>
      </div>

      {/* Results Grid */}
      {items.length === 0 ? (
        <div className="rpg-panel-subtle p-10 text-center">
          <p className="font-pixel text-xs text-[#f5c451] mb-2">
            No Matching Things Found
          </p>
          <p className="text-sm text-[#bfb2d6]">
            Try clearing your filter—or pull today&apos;s daily thing to add a
            brand-new discovery to the catalog!
          </p>
        </div>
      ) : (
        <div className="thing-grid">
          {items.map((item) => (
            <ThingGridCard
              key={item.thingTid}
              item={item}
              isViewerOwner={viewerDid === item.currentOwner.did}
              onGiveClick={(selected) => setGiveTarget(selected)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => {
              const p = page - 1;
              setPage(p);
              void runQuery({ p });
            }}
            className="rpg-btn-secondary px-4 py-2 font-pixel text-xs"
          >
            Prev
          </button>
          <span className="font-pixel text-xs text-[#bfb2d6]">
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => {
              const p = page + 1;
              setPage(p);
              void runQuery({ p });
            }}
            className="rpg-btn-secondary px-4 py-2 font-pixel text-xs"
          >
            Next
          </button>
        </div>
      )}

      <GiveThingModal
        open={Boolean(giveTarget)}
        onClose={() => setGiveTarget(null)}
        thing={giveTarget}
        onSuccess={() => void runQuery()}
      />
    </div>
  );
}
