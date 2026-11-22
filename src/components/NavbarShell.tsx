"use client";

import React, { useId, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Backpack,
  Gift,
  Grid2x2,
  Home,
  LogOut,
  Sparkles,
} from "lucide-react";
import { RpgModal } from "./RpgModal";

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
  const [handleInput, setHandleInput] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const handleInputId = useId();

  const myThingsHref = viewer
    ? `/u/${encodeURIComponent(viewer.handle)}`
    : "/bag";

  const isMyThingsActive =
    pathname.startsWith("/bag") ||
    pathname.startsWith("/friends") ||
    (viewer
      ? pathname.toLowerCase() ===
        `/u/${encodeURIComponent(viewer.handle).toLowerCase()}`
      : false);

  const navItems = [
    {
      href: "/",
      label: "HOME",
      mobileLabel: "Home",
      icon: Home,
      active: pathname === "/",
      accent: "text-[#ffd15c]",
    },
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
      href: myThingsHref,
      label: "MY THINGS",
      mobileLabel: "My Things",
      icon: Backpack,
      active: isMyThingsActive,
      accent: "text-[#ffd15c]",
    },
    {
      href: "/catalog",
      label: "ALL THE THINGS",
      mobileLabel: "All Things",
      icon: Grid2x2,
      active: pathname.startsWith("/catalog"),
      accent: "text-[#4be3a0]",
    },
  ];

  async function handleLoginSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!handleInput.trim()) return;
    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: handleInput.trim(),
          returnTo: pathname || "/",
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setLoginError(data.error ?? "Unable to start Bluesky sign-in.");
        setLoginBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setLoginError("Network error starting Bluesky sign-in.");
      setLoginBusy(false);
    }
  }

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
            <Link href="/" className="group flex items-center gap-3">
              <img
                src="/icon.svg"
                alt=""
                width={38}
                height={38}
                className="pixel-art h-9.5 w-9.5 rounded-full ring-2 ring-[#ff4d6d]/70 transition-transform group-hover:scale-105"
              />
              <div>
                <span className="font-pixel block text-sm sm:text-base text-[#ffd15c]">
                  GIVE A THING
                </span>
                <span className="hidden text-xs text-[#cfc3e8] sm:block">
                  Get a Pointless Thing Every Day &amp; Give Things Away
                </span>
              </div>
            </Link>

            {/* Auth Controls */}
            <div className="flex items-center gap-2">
              {viewer ? (
                <>
                  <Link
                    href={myThingsHref}
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
                  className="rpg-btn-blue inline-flex items-center gap-2 px-3.5 py-2 font-pixel text-xs"
                >
                  Sign in with Bluesky
                </button>
              )}
            </div>
          </div>

          {/* Desktop 5-Item Primary Navigation */}
          <nav
            aria-label="Primary"
            className="hidden items-center gap-2 border-t border-[#9e762a]/35 pt-2 lg:flex"
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
        <div className="flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
          <p>
            Copyright (c) 2026 Dylan Gregori Singer (symmetricalboy)
          </p>
          <p className="inline-flex items-center gap-3 font-pixel text-[10px]">
            <a
              href="https://bsky.app/profile/giveathing.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#8ec8ff] hover:underline"
            >
              @giveathing.com
            </a>
            <span className="text-[#ff99ac]">&bull;</span>
            <span className="text-[#ffd15c]">Resets daily at 00:00 UTC</span>
          </p>
        </div>
      </footer>

      {/* Mobile Thumb-Friendly 5-Item Bottom RPG Bar */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-[#f2c14e] bg-[#211636] lg:hidden"
      >
        <div className="grid grid-cols-5 gap-0.5 px-1.5 py-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded px-1 py-1 text-center text-[9px] font-pixel leading-tight ${
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

      {/* Sign in with Bluesky RPG Modal */}
      <RpgModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        title="Sign in with Bluesky"
      >
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <p className="text-sm text-[#cfc3e8]">
            Enter your Bluesky handle to unwrap daily things, curate your Top 8,
            and give things away to your friends!
          </p>

          <div>
            <label
              htmlFor={handleInputId}
              className="mb-1.5 block font-pixel text-xs text-[#ffd15c]"
            >
              Your Bluesky Handle
            </label>
            <input
              id={handleInputId}
              type="text"
              autoFocus
              required
              autoComplete="username"
              placeholder="alice.bsky.social"
              value={handleInput}
              onChange={(e) => setHandleInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) {
                    e.preventDefault();
                  }
                }
              }}
              className="rpg-slot w-full px-3.5 py-2.5 text-sm text-[#fdf6e9] placeholder:text-[#cfc3e8]/50 focus:border-[#4da6ff] focus:outline-none"
            />
          </div>

          {loginError && (
            <p
              role="alert"
              className="rounded border border-[#ff4d6d] bg-[#ff4d6d]/15 px-3 py-2 text-xs text-[#ff99ac]"
            >
              {loginError}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => setLoginOpen(false)}
              className="rpg-btn-secondary px-4 py-2 font-pixel text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loginBusy}
              className="rpg-btn-blue px-4 py-2 font-pixel text-xs"
            >
              {loginBusy ? "Connecting..." : "Continue to Bluesky"}
            </button>
          </div>
        </form>
      </RpgModal>
    </div>
  );
}
