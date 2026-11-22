"use client";

import React, { useId, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Backpack,
  BookOpen,
  Gift,
  LogOut,
  ScrollText,
  Sparkles,
  Users,
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

  const myProfileHref = viewer
    ? `/u/${encodeURIComponent(viewer.handle)}`
    : "/bag";

  const navItems = [
    { href: "/", label: "Daily Pull", icon: Gift },
    { href: "/catalog", label: "Catalog", icon: BookOpen },
    ...(viewer
      ? [
          { href: myProfileHref, label: "My Things", icon: Backpack },
          { href: "/friends", label: "Friends", icon: Users },
        ]
      : []),
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
      setLoginError("Network error contacting OAuth server.");
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/me", { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh flex-col pb-20 md:pb-8">
      {/* Top 16-bit Header */}
      <header className="sticky top-0 z-30 border-b-2 border-[#8c6826] bg-[#181224]/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="group flex items-center gap-3">
            <img
              src="/icon.svg"
              alt=""
              width={36}
              height={36}
              className="pixel-art h-9 w-9 rounded-full transition-transform group-hover:scale-105"
            />
            <div>
              <span className="font-pixel block text-sm sm:text-base text-[#f5c451]">
                GIVE A THING
              </span>
              <span className="hidden text-xs text-[#bfb2d6] sm:block">
                Get a Pointless Thing Every Day &amp; Give Things Away
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav
            aria-label="Primary"
            className="hidden items-center gap-2 md:flex"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-pixel transition-colors ${
                    active
                      ? "rpg-panel-subtle text-[#f5c451] border-[#e5b54f]"
                      : "text-[#bfb2d6] hover:text-[#fbf4e4]"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Auth Controls */}
          <div className="flex items-center gap-2">
            {viewer ? (
              <>
                <Link
                  href={myProfileHref}
                  className="rpg-btn-secondary inline-flex items-center gap-2 px-3 py-1.5 text-xs"
                >
                  {viewer.avatarUrl ? (
                    <img
                      src={viewer.avatarUrl}
                      alt=""
                      className="h-5 w-5 rounded-sm object-cover"
                    />
                  ) : (
                    <Sparkles
                      className="h-4 w-4 text-[#f5c451]"
                      aria-hidden="true"
                    />
                  )}
                  <span className="max-w-[130px] truncate font-medium">
                    @{viewer.handle}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Sign out"
                  title="Sign out"
                  className="rpg-btn-secondary inline-flex h-8 w-8 items-center justify-center text-[#bfb2d6] hover:text-[#ff5c8a]"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="rpg-btn-primary inline-flex items-center gap-2 px-3.5 py-2 font-pixel text-xs"
              >
                Sign in with Bluesky
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {children}
      </main>

      {/* Footer (Desktop) */}
      <footer className="mx-auto mt-8 hidden w-full max-w-6xl items-center justify-between border-t border-[#8c6826]/40 px-4 pt-6 text-xs text-[#bfb2d6] md:flex">
        <p className="inline-flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-[#e5b54f]" aria-hidden="true" />
          <span>
            Every thing is generated once by Gemini 4 Carbon &amp; recorded
            permanently across ATProtocol PDSes.
          </span>
        </p>
        <p className="font-pixel text-[11px] text-[#e5b54f]">
          Resets daily at 00:00 UTC
        </p>
      </footer>

      {/* Mobile Thumb-Friendly Bottom RPG Menu Bar */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-[#e5b54f] bg-[#181224] md:hidden"
      >
        <div className="grid grid-cols-4 gap-1 px-2 py-1.5">
          <Link
            href="/"
            className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded px-1 py-1 text-[10px] font-pixel ${
              pathname === "/" ? "text-[#f5c451]" : "text-[#bfb2d6]"
            }`}
          >
            <Gift className="h-4 w-4" aria-hidden="true" />
            <span>Pull</span>
          </Link>
          <Link
            href="/catalog"
            className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded px-1 py-1 text-[10px] font-pixel ${
              pathname.startsWith("/catalog")
                ? "text-[#f5c451]"
                : "text-[#bfb2d6]"
            }`}
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            <span>Catalog</span>
          </Link>
          {viewer ? (
            <>
              <Link
                href={myProfileHref}
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded px-1 py-1 text-[10px] font-pixel ${
                  pathname.startsWith("/u/") || pathname.startsWith("/bag")
                    ? "text-[#f5c451]"
                    : "text-[#bfb2d6]"
                }`}
              >
                <Backpack className="h-4 w-4" aria-hidden="true" />
                <span>My Things</span>
              </Link>
              <Link
                href="/friends"
                className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded px-1 py-1 text-[10px] font-pixel ${
                  pathname.startsWith("/friends")
                    ? "text-[#f5c451]"
                    : "text-[#bfb2d6]"
                }`}
              >
                <Users className="h-4 w-4" aria-hidden="true" />
                <span>Friends</span>
              </Link>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="col-span-2 my-1 rpg-btn-primary flex items-center justify-center font-pixel text-[10px]"
            >
              Sign in (Bluesky)
            </button>
          )}
        </div>
      </nav>

      {/* Sign in with Bluesky RPG Modal */}
      <RpgModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        title="Sign in via ATProtocol"
      >
        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <p className="text-sm text-[#bfb2d6]">
            Enter your Bluesky handle (or any ATProtocol PDS handle). We only
            request permission for{" "}
            <code className="rounded bg-[#140f1d] px-1.5 py-0.5 text-xs text-[#4be3a0]">
              com.giveathing.*
            </code>{" "}
            records—never your timeline posts.
          </p>

          <div>
            <label
              htmlFor={handleInputId}
              className="mb-1.5 block font-pixel text-xs text-[#f5c451]"
            >
              Your Handle
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
              className="rpg-slot w-full px-3.5 py-2.5 text-sm text-[#fbf4e4] placeholder:text-[#bfb2d6]/50 focus:border-[#f5c451] focus:outline-none"
            />
          </div>

          {loginError && (
            <p
              role="alert"
              className="border border-[#ff5c8a] bg-[#ff5c8a]/15 px-3 py-2 text-xs text-[#ff9bb6]"
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
              className="rpg-btn-primary px-4 py-2 font-pixel text-xs"
            >
              {loginBusy ? "Connecting PDS..." : "Continue to Bluesky"}
            </button>
          </div>
        </form>
      </RpgModal>
    </div>
  );
}
