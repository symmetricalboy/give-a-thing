import React from "react";
import type { Metadata } from "next";
import { ExternalLink, Megaphone } from "lucide-react";
import { NEWS_POSTS } from "@/lib/news";

export const metadata: Metadata = {
  title: "News About Things",
  description:
    "Game updates, announcements, and release notes for Give a Thing.",
};

export default function NewsAboutThingsPage() {
  return (
    <div className="space-y-6">
      <section aria-label="News About Things Header" className="rpg-panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Megaphone
                className="h-4 w-4 text-[#ff4d6d]"
                aria-hidden="true"
              />
              <h1 className="font-pixel text-base sm:text-lg text-[#ffd15c]">
                NEWS ABOUT THINGS
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-[#cfc3e8]">
              Updates, patch notes, and announcements from Give a Thing.
            </p>
          </div>

          <a
            href="https://bsky.app/profile/giveathing.com"
            target="_blank"
            rel="noopener noreferrer"
            className="rpg-btn-secondary inline-flex items-center gap-1.5 px-3.5 py-2 font-pixel text-[10px] text-[#8ec8ff]"
          >
            Follow @giveathing.com
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        </div>
      </section>

      <section aria-label="News Posts" className="space-y-6">
        {NEWS_POSTS.map((post) => (
          <article
            key={post.id}
            className="rpg-panel p-5 sm:p-6 space-y-3 border-l-4 border-l-[#ff4d6d]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#9e762a]/40 pb-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-[#ff4d6d] px-2 py-0.5 font-pixel text-[9px] text-[#24040b]">
                  {post.badge}
                </span>
                <h2 className="font-pixel text-sm sm:text-base text-[#ffd15c]">
                  {post.title}
                </h2>
              </div>
              <time
                dateTime={post.date}
                className="font-pixel text-[10px] text-[#8ec8ff]"
              >
                {post.displayDate}
              </time>
            </div>

            <div className="space-y-3 text-sm leading-relaxed text-[#fdf6e9]">
              {post.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            <div className="pt-2">
              <a
                href={`https://bsky.app/profile/${post.feedbackHandle}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rpg-btn-blue inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Send Ideas &amp; Feedback to @{post.feedbackHandle} on Bluesky
              </a>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
