"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Gift, Sparkles } from "lucide-react";
import { RpgModal } from "./RpgModal";
import { AtmosphereLoginForm } from "./AtmosphereLoginForm";

interface GiftBoxPalette {
  boxFill: string;
  boxShade: string;
  lidFill: string;
  ribbonFill: string;
  ribbonHighlight: string;
  tagFill: string;
}

const GIFT_PALETTES: Record<
  "redGold" | "blueGold" | "purpleRed" | "blueRed" | "goldBlue",
  GiftBoxPalette
> = {
  redGold: {
    boxFill: "#e63956",
    boxShade: "#b8253e",
    lidFill: "#ff5c77",
    ribbonFill: "#ffd15c",
    ribbonHighlight: "#fff0b8",
    tagFill: "#4da6ff",
  },
  blueGold: {
    boxFill: "#2c82eb",
    boxShade: "#1c5db0",
    lidFill: "#52a2ff",
    ribbonFill: "#ffd15c",
    ribbonHighlight: "#fff0b8",
    tagFill: "#ff4d6d",
  },
  purpleRed: {
    boxFill: "#6b3fa0",
    boxShade: "#4b2975",
    lidFill: "#8552c2",
    ribbonFill: "#ff4d6d",
    ribbonHighlight: "#ff99ac",
    tagFill: "#ffd15c",
  },
  blueRed: {
    boxFill: "#d99b52",
    boxShade: "#a87031",
    lidFill: "#f0b76e",
    ribbonFill: "#ff4d6d",
    ribbonHighlight: "#ff99ac",
    tagFill: "#4da6ff",
  },
  goldBlue: {
    boxFill: "#f0b43a",
    boxShade: "#c2891d",
    lidFill: "#ffd15c",
    ribbonFill: "#2c82eb",
    ribbonHighlight: "#8ec8ff",
    tagFill: "#ff4d6d",
  },
};

function PixelGiftBoxSvg({
  palette,
  size = 56,
}: {
  palette: GiftBoxPalette;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      aria-hidden="true"
      className="pixel-art drop-shadow-[0_4px_0_rgba(13,8,22,0.75)]"
    >
      {/* Bow loops */}
      <rect x="4" y="1" width="3" height="2" fill={palette.ribbonFill} />
      <rect x="9" y="1" width="3" height="2" fill={palette.ribbonFill} />
      <rect x="5" y="1" width="1" height="1" fill={palette.ribbonHighlight} />
      <rect x="10" y="1" width="1" height="1" fill={palette.ribbonHighlight} />
      <rect x="7" y="2" width="2" height="2" fill={palette.ribbonHighlight} />

      {/* Dark 1px RPG outline */}
      <rect x="2" y="3" width="12" height="1" fill="#0d0816" />
      <rect x="1" y="4" width="1" height="3" fill="#0d0816" />
      <rect x="14" y="4" width="1" height="3" fill="#0d0816" />
      <rect x="2" y="7" width="1" height="7" fill="#0d0816" />
      <rect x="13" y="7" width="1" height="7" fill="#0d0816" />
      <rect x="3" y="14" width="10" height="1" fill="#0d0816" />

      {/* Lid */}
      <rect x="2" y="4" width="12" height="3" fill={palette.lidFill} />
      {/* Box body */}
      <rect x="3" y="7" width="5" height="7" fill={palette.boxFill} />
      <rect x="8" y="7" width="5" height="7" fill={palette.boxShade} />

      {/* Vertical & horizontal ribbons */}
      <rect x="7" y="4" width="2" height="10" fill={palette.ribbonFill} />
      <rect x="3" y="9" width="10" height="2" fill={palette.ribbonFill} />
      <rect x="7" y="4" width="1" height="10" fill={palette.ribbonHighlight} />

      {/* Cute corner accent tag */}
      <rect x="10" y="10" width="2" height="3" fill={palette.tagFill} />
    </svg>
  );
}

interface FloatingBoxSpec {
  id: number;
  top: string;
  left: string;
  size: number;
  palette: keyof typeof GIFT_PALETTES;
  drift: "drift-a" | "drift-b" | "drift-c";
  dur: string;
  delay: string;
  hideOnMobile?: boolean;
}

const FLOATING_BOXES: FloatingBoxSpec[] = [
  { id: 1, top: "6%", left: "3%", size: 54, palette: "redGold", drift: "drift-a", dur: "4.4s", delay: "0s" },
  { id: 2, top: "14%", left: "15%", size: 40, palette: "blueGold", drift: "drift-b", dur: "5.3s", delay: "-1.2s", hideOnMobile: true },
  { id: 3, top: "58%", left: "4%", size: 62, palette: "blueRed", drift: "drift-c", dur: "4.8s", delay: "-2.1s" },
  { id: 4, top: "78%", left: "13%", size: 44, palette: "purpleRed", drift: "drift-a", dur: "5.6s", delay: "-0.7s" },
  { id: 5, top: "36%", left: "9%", size: 36, palette: "goldBlue", drift: "drift-b", dur: "4.2s", delay: "-2.8s", hideOnMobile: true },
  { id: 6, top: "8%", left: "88%", size: 58, palette: "blueGold", drift: "drift-b", dur: "4.9s", delay: "-0.9s" },
  { id: 7, top: "18%", left: "76%", size: 38, palette: "redGold", drift: "drift-c", dur: "5.4s", delay: "-2.3s", hideOnMobile: true },
  { id: 8, top: "42%", left: "89%", size: 46, palette: "purpleRed", drift: "drift-a", dur: "4.5s", delay: "-1.6s", hideOnMobile: true },
  { id: 9, top: "66%", left: "86%", size: 60, palette: "goldBlue", drift: "drift-c", dur: "5.1s", delay: "-0.4s" },
  { id: 10, top: "82%", left: "75%", size: 42, palette: "blueRed", drift: "drift-b", dur: "4.7s", delay: "-3.1s" },
  { id: 11, top: "5%", left: "46%", size: 34, palette: "goldBlue", drift: "drift-a", dur: "5.5s", delay: "-1.9s", hideOnMobile: true },
  { id: 12, top: "86%", left: "48%", size: 38, palette: "redGold", drift: "drift-c", dur: "4.3s", delay: "-2.5s", hideOnMobile: true },
  { id: 13, top: "27%", left: "2%", size: 32, palette: "blueGold", drift: "drift-c", dur: "5.8s", delay: "-1.4s", hideOnMobile: true },
  { id: 14, top: "28%", left: "93%", size: 34, palette: "redGold", drift: "drift-b", dur: "5.0s", delay: "-0.5s", hideOnMobile: true },
];

interface HomeLandingHeroProps {
  totalThingsCount: number;
  authenticated: boolean;
}

export function HomeLandingHero({
  totalThingsCount,
  authenticated,
}: HomeLandingHeroProps) {
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Hero Showcase with Floating Animated 16-Bit Gift Boxes */}
      <section
        aria-label="Welcome to Give a Thing"
        className="rpg-panel relative overflow-hidden px-5 py-12 sm:px-10 sm:py-16"
      >
        {/* Floating Pixel Gift Boxes Field */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          {FLOATING_BOXES.map((b) => (
            <div
              key={b.id}
              style={
                {
                  top: b.top,
                  left: b.left,
                  "--float-dur": b.dur,
                  "--float-delay": b.delay,
                } as React.CSSProperties
              }
              className={`floating-gift pointer-events-auto absolute opacity-90 ${
                b.drift
              } ${b.hideOnMobile ? "hidden md:block" : ""}`}
            >
              <PixelGiftBoxSvg
                palette={GIFT_PALETTES[b.palette]}
                size={b.size}
              />
            </div>
          ))}
        </div>

        {/* Centerpiece Copy & Single Prominent CTA */}
        <div className="relative z-10 mx-auto max-w-2xl text-center space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-[#4da6ff] bg-[#160f24]/90 px-3.5 py-1 font-pixel text-[10px] text-[#8ec8ff]">
            <Sparkles
              className="h-3.5 w-3.5 text-[#ffd15c]"
              aria-hidden="true"
            />
            <span>
              {totalThingsCount > 0
                ? `${totalThingsCount} UNIQUE THINGS DISCOVERED SO FAR!`
                : "A DAILY SOCIAL COLLECTIBLES GAME"}
            </span>
          </div>

          <h1 className="font-pixel text-2xl sm:text-4xl leading-tight text-[#ffd15c] drop-shadow-[0_4px_0_#0d0816]">
            GIVE A THING
          </h1>

          <p className="font-pixel text-xs sm:text-sm leading-relaxed text-balance text-[#ff99ac]">
            Get a Thing Every Day, Make New Things, &amp; Give Things Away!
          </p>

          <p className="mx-auto max-w-xl text-sm sm:text-base leading-relaxed text-pretty text-[#fdf6e9]">
            Once a day, you can come &amp; get a new random thing. You will
            receive a completely unique, utterly pointless &amp; strange thing.
            Things don&apos;t boost stats, unlock levels, or do anything useful
            at all. They just exist to be collected, admired, and tossed back
            &amp; forth between friends! Still not enough things? You can make
            your own things, too! You can design your very own collections of
            pointless things, &amp; you can give them away for free, or even
            choose to sell them! Now that&apos;s a lot of things!
          </p>

          <div className="flex items-center justify-center pt-3 pb-1">
            {authenticated ? (
              <Link
                href="/get"
                className="rpg-btn-red inline-flex items-center gap-2.5 px-8 py-4 font-pixel text-sm sm:text-base"
              >
                <Gift className="h-5 w-5" aria-hidden="true" />
                GET A THING
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="rpg-btn-blue inline-flex items-center gap-2.5 px-8 py-4 font-pixel text-sm sm:text-base"
              >
                LOGIN
              </button>
            )}
          </div>
        </div>
      </section>

      <RpgModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        title="Login"
      >
        <AtmosphereLoginForm
          returnTo="/"
          onCancel={() => setLoginOpen(false)}
        />
      </RpgModal>
    </div>
  );
}
