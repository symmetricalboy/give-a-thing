"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Backpack,
  Gift,
  Hammer,
  LogOut,
  Search,
  Sparkles,
} from "lucide-react";
import { RpgModal } from "./RpgModal";
import { AtmosphereLoginForm } from "./AtmosphereLoginForm";

export interface NavViewer {
  did: string;
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

interface NavbarShellProps {
  viewer: NavViewer | null;
  children: React.ReactNode;
}

export function NavbarShell({ viewer, children }: NavbarShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [loginOpen, setLoginOpen] = useState(false);

  const yourThingsHref = viewer
    ? `/u/${encodeURIComponent(viewer.handle)}`
    : "/profile";

  const isYourThingsActive =
    pathname.startsWith("/profile") ||
    pathname.startsWith("/bag") ||
    pathname.startsWith("/friends") ||
    (viewer
      ? pathname.toLowerCase() ===
        `/u/${encodeURIComponent(viewer.handle).toLowerCase()}`
      : false);

  const navItems = [
    {
      href: "/get",
      label: "GET A THING",
      mobileLabel: "Get Thing",
      icon: Gift,
      active: pathname.startsWith("/get"),
      accent: "text-[#ff859d]",
    },
    {
      href: "/happened",
      label: "THINGS THAT HAPPENED",
      mobileLabel: "Happened",
      icon: Activity,
      active: pathname.startsWith("/happened"),
      accent: "text-[#7cc0ff]",
    },
    {
      href: yourThingsHref,
      label: "YOUR THINGS",
      mobileLabel: "Your Things",
      icon: Backpack,
      active: isYourThingsActive,
      accent: "text-[#ffd15c]",
    },
    {
      href: "/make",
      label: "MAKE NEW THINGS",
      mobileLabel: "Make New",
      icon: Hammer,
      active: pathname.startsWith("/make"),
      accent: "text-[#c49bff]",
    },
    {
      href: "/search",
      label: "FIND THINGS",
      mobileLabel: "Find",
      icon: Search,
      active: pathname.startsWith("/search") || pathname.startsWith("/catalog"),
      accent: "text-[#4be3a0]",
    },
  ];

  const isNewsActive = pathname.startsWith("/news");
  const isImportantActive =
    pathname.startsWith("/important") || pathname.startsWith("/other");

  async function handleLogout() {
    await fetch("/api/auth/me", { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col pb-20 lg:pb-8">
      {/* Playful 4-color Pixel Candy Ribbon */}
      <div className="candy-ribbon w-full" aria-hidden="true" />

      {/* Top 16-bit Header */}
      <header className="sticky top-0 z-30 border-b-2 border-[#f2c14e]/70 bg-[#211636]/95 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="group flex items-center gap-3.5">
              <img
                src="/icon.svg"
                alt=""
                width={44}
                height={44}
                className="pixel-art h-10 w-10 sm:h-11 sm:w-11 rounded-full ring-2 ring-[#ff4d6d]/70 transition-transform group-hover:scale-105"
              />
              <span className="font-pixel text-lg sm:text-2xl tracking-wide text-[#ffd15c] drop-shadow-[0_2px_0_#0d0816] transition-colors group-hover:text-[#ffe48f]">
                GIVE A THING
              </span>
            </Link>

            {/* Auth Controls */}
            <div className="flex items-center gap-2">
              {viewer ? (
                <>
                  <Link
                    href={yourThingsHref}
                    className="rpg-btn-secondary inline-flex items-center gap-2 px-3 py-1.5 text-xs"
                  >
                    {viewer.avatarUrl ? (
                      <img
                        src={viewer.avatarUrl}
                        alt=""
                        className="h-5 w-5 rounded-sm object-cover ring-1 ring-[#4da6ff]"
                      />
                    ) : (
                      <Sparkles
                        className="h-4 w-4 text-[#ffd15c]"
                        aria-hidden="true"
                      />
                    )}
                    <span className="max-w-[140px] truncate font-medium">
                      @{viewer.handle}
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={handleLogout}
                    aria-label="Sign out"
                    title="Sign out"
                    className="rpg-btn-secondary inline-flex h-8 w-8 items-center justify-center text-[#cfc3e8] hover:text-[#ff4d6d]"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setLoginOpen(true)}
                  className="rpg-btn-blue inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
                >
                  LOGIN
                </button>
              )}
            </div>
          </div>

          {/* Desktop 5-Item Primary Navigation */}
          <nav
            aria-label="Primary"
            className="hidden items-center gap-2 border-t border-[#9e762a]/35 pt-2 lg:flex lg:flex-wrap"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={item.active ? "page" : undefined}
                  className={`inline-flex items-center gap-2 rounded px-3 py-2 text-[11px] font-pixel transition-colors ${
                    item.active
                      ? "bg-[#3c2b60] text-[#ffd15c] border-2 border-[#ffd15c] shadow-[inset_0_-3px_0_0_#ff4d6d]"
                      : "border-2 border-transparent text-[#cfc3e8] hover:border-[#4da6ff]/50 hover:bg-[#2f214c] hover:text-[#fdf6e9]"
                  }`}
                >
                  <Icon
                    className={`h-3.5 w-3.5 ${item.active ? item.accent : ""}`}
                    aria-hidden="true"
                  />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>

      {/* Footer (Visible on Desktop & Mobile) */}
      <footer className="mx-auto mt-10 w-full max-w-6xl border-t-2 border-[#9e762a]/40 px-4 pt-6 pb-4 text-xs text-[#cfc3e8]">
        <div className="flex flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
          <p>
            Copyright (c) 2026 Dylan Gregori Singer (symmetricalboy)
          </p>
          <nav
            aria-label="Footer"
            className="inline-flex flex-wrap items-center justify-center gap-4 font-pixel text-[10px]"
          >
            <Link
              href="/news"
              aria-current={isNewsActive ? "page" : undefined}
              className={
                isNewsActive
                  ? "text-[#ffd15c] underline decoration-[#ff4d6d] decoration-2 underline-offset-4"
                  : "text-[#8ec8ff] hover:text-[#ffd15c] hover:underline underline-offset-4"
              }
            >
              NEWS ABOUT THINGS
            </Link>
            <span className="text-[#ff99ac]" aria-hidden="true">
              &bull;
            </span>
            <Link
              href="/important"
              aria-current={isImportantActive ? "page" : undefined}
              className={
                isImportantActive
                  ? "text-[#ffd15c] underline decoration-[#ff4d6d] decoration-2 underline-offset-4"
                  : "text-[#8ec8ff] hover:text-[#ffd15c] hover:underline underline-offset-4"
              }
            >
              IMPORTANT THINGS
            </Link>
          </nav>
        </div>
      </footer>

      {/* Mobile Thumb-Friendly 5-Item Bottom RPG Bar */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-[#f2c14e] bg-[#211636] pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] lg:hidden"
      >
        <div className="grid grid-cols-5 gap-0.5 px-1.5 pt-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded px-1 py-1 text-center text-[8px] sm:text-[9px] font-pixel leading-tight ${
                  item.active
                    ? "bg-[#3c2b60] text-[#ffd15c] border-t-2 border-[#ff4d6d]"
                    : "text-[#cfc3e8]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-full">{item.mobileLabel}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Login with ATmosphere Account RPG Modal */}
      <RpgModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        title="Login"
      >
        <AtmosphereLoginForm
          returnTo={pathname || "/"}
          onCancel={() => setLoginOpen(false)}
        />
      </RpgModal>
    </div>
  );
}
