"use client";

import React, { useId } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  ExternalLink,
  Heart,
  Loader2,
  Wallet,
} from "lucide-react";
import type { CreatorPayoutStatus } from "@/lib/stripe/connect";
import {
  bpsToPercentDisplay,
  estimateMysteryBoxPayoutBreakdown,
  formatUsdCents,
  parseUsdInputToCents,
  percentToBps,
} from "@/lib/stripe/pricing";

export type DonationPreset = "0" | "10" | "custom";

export interface CollectionPricingFormState {
  isPaid: boolean;
  priceDollarsInput: string;
  donationPreset: DonationPreset;
  customDonationInput: string;
}

export function derivePricingPayload(state: CollectionPricingFormState): {
  priceCents: number;
  platformFeeBps: number;
  valid: boolean;
  validationError: string | null;
} {
  if (!state.isPaid) {
    return {
      priceCents: 0,
      platformFeeBps: 0,
      valid: true,
      validationError: null,
    };
  }

  const parsedCents = parseUsdInputToCents(state.priceDollarsInput);
  if (parsedCents === null) {
    return {
      priceCents: 0,
      platformFeeBps: 0,
      valid: false,
      validationError:
        "Enter a dollar price per pull (for example, 2.50), or switch to Free.",
    };
  }

  let platformFeeBps = 0;
  if (state.donationPreset === "10") {
    platformFeeBps = 1000;
  } else if (state.donationPreset === "custom") {
    const trimmed = state.customDonationInput.trim().replace(/%$/, "").trim();
    if (!trimmed || !/^\d+(\.\d{0,2})?$/.test(trimmed)) {
      return {
        priceCents: parsedCents,
        platformFeeBps: 0,
        valid: false,
        validationError:
          "Enter a valid custom Give a Thing support percentage between 0 and 90.",
      };
    }
    const pct = Number(trimmed);
    if (!Number.isFinite(pct) || pct < 0 || pct > 90) {
      return {
        priceCents: parsedCents,
        platformFeeBps: 0,
        valid: false,
        validationError: "Custom support percentage must be between 0% and 90%.",
      };
    }
    platformFeeBps = percentToBps(pct);
  }

  const breakdown = estimateMysteryBoxPayoutBreakdown(
    parsedCents,
    platformFeeBps
  );

  return {
    priceCents: parsedCents,
    platformFeeBps,
    valid: breakdown.valid,
    validationError: breakdown.validationError,
  };
}

export function pricingStateFromCollection(
  priceCents: number,
  platformFeeBps: number
): CollectionPricingFormState {
  if (priceCents <= 0) {
    return {
      isPaid: false,
      priceDollarsInput: "2.50",
      donationPreset: "0",
      customDonationInput: "5",
    };
  }

  let donationPreset: DonationPreset = "custom";
  let customDonationInput = String(platformFeeBps / 100);
  if (platformFeeBps === 0) {
    donationPreset = "0";
    customDonationInput = "5";
  } else if (platformFeeBps === 1000) {
    donationPreset = "10";
    customDonationInput = "5";
  }

  return {
    isPaid: true,
    priceDollarsInput: (priceCents / 100).toFixed(2),
    donationPreset,
    customDonationInput,
  };
}

interface CollectionPricingFieldsProps {
  payoutStatus: CreatorPayoutStatus;
  onboardingBusy: boolean;
  onStartOnboarding: (mode: "onboard" | "update") => void;
  value: CollectionPricingFormState;
  onChange: (next: CollectionPricingFormState) => void;
}

export function CollectionPricingFields({
  payoutStatus,
  onboardingBusy,
  onStartOnboarding,
  value,
  onChange,
}: CollectionPricingFieldsProps) {
  const uid = useId();

  const parsedPriceCents = value.isPaid
    ? (parseUsdInputToCents(value.priceDollarsInput) ?? 0)
    : 0;

  const activeBps = !value.isPaid
    ? 0
    : value.donationPreset === "0"
      ? 0
      : value.donationPreset === "10"
        ? 1000
        : (() => {
            const raw = value.customDonationInput.trim().replace(/%$/, "");
            const n = Number(raw);
            return Number.isFinite(n) && n >= 0 ? percentToBps(n) : 0;
          })();

  const breakdown = estimateMysteryBoxPayoutBreakdown(
    parsedPriceCents,
    activeBps
  );

  return (
    <div className="space-y-4">
      {/* Payout Method Status Banner */}
      <div className="rpg-slot p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Wallet className="h-4 w-4 text-[#ffd15c]" aria-hidden="true" />
            <span className="font-pixel text-[10px] text-[#ffd15c]">
              CREATOR PAYOUT METHOD (STRIPE)
            </span>
            {payoutStatus.payoutsReady ? (
              <span className="inline-flex items-center gap-1 rounded bg-[#4be3a0]/20 px-2 py-0.5 font-pixel text-[9px] text-[#4be3a0]">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                CONNECTED &amp; READY
              </span>
            ) : payoutStatus.connected ? (
              <span className="rounded bg-[#ffd15c]/20 px-2 py-0.5 font-pixel text-[9px] text-[#ffd15c]">
                SETUP INCOMPLETE
              </span>
            ) : (
              <span className="rounded bg-[#160f24] px-2 py-0.5 font-pixel text-[9px] text-[#cfc3e8]">
                NOT CONNECTED
              </span>
            )}
          </div>

          <p className="text-xs text-[#cfc3e8] leading-relaxed">
            {!payoutStatus.stripeConfigured
              ? "Stripe keys are not configured on this server yet—collections can be published as Free ($0) right now."
              : payoutStatus.payoutsReady
                ? "Your Stripe payout account is active! You can set any price ($0.50+) per pull on your Mystery Boxes."
                : payoutStatus.connected
                  ? "Finish your Stripe onboarding details to unlock charging for pulls on your Mystery Boxes."
                  : "Free Mystery Boxes need no setup! To charge money per pull, connect a payout method with Stripe first."}
          </p>
        </div>

        {payoutStatus.stripeConfigured ? (
          <button
            type="button"
            disabled={onboardingBusy}
            onClick={() =>
              onStartOnboarding(payoutStatus.payoutsReady ? "update" : "onboard")
            }
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 font-pixel text-[10px] ${
              payoutStatus.payoutsReady ? "rpg-btn-secondary text-[#8ec8ff]" : "rpg-btn-blue"
            }`}
          >
            {onboardingBusy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Opening Stripe…
              </>
            ) : (
              <>
                {payoutStatus.payoutsReady
                  ? "Payout Settings"
                  : payoutStatus.connected
                    ? "Finish Payout Setup"
                    : "Connect Payout Method"}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </>
            )}
          </button>
        ) : null}
      </div>

      {/* Free vs Paid Pull Mode */}
      <fieldset className="space-y-3 rounded border-2 border-[#9e762a]/70 bg-[#251a3c]/70 p-4">
        <legend className="px-2 font-pixel text-[11px] text-[#ffd15c]">
          Mystery Box Pull Pricing
        </legend>

        <div className="grid gap-3 sm:grid-cols-2">
          <label
            htmlFor={`${uid}-mode-free`}
            className={`rounded border-2 p-3 cursor-pointer transition-colors ${
              !value.isPaid
                ? "border-[#4be3a0] bg-[#160f24]"
                : "border-[#9e762a]/50 bg-[#160f24]/50 hover:border-[#8ec8ff]"
            }`}
          >
            <div className="flex items-center gap-2">
              <input
                id={`${uid}-mode-free`}
                type="radio"
                name={`${uid}-pricing-mode`}
                checked={!value.isPaid}
                onChange={() => onChange({ ...value, isPaid: false })}
                className="rpg-choice-input h-4 w-4"
              />
              <span className="font-pixel text-xs text-[#4be3a0]">
                FREE ($0.00)
              </span>
            </div>
            <p className="mt-1.5 text-xs text-[#cfc3e8]">
              Players can draw 1 mystery thing per UTC day for free until the box
              runs out.
            </p>
          </label>

          <label
            htmlFor={`${uid}-mode-paid`}
            className={`rounded border-2 p-3 transition-colors ${
              !payoutStatus.payoutsReady
                ? "border-[#9e762a]/35 bg-[#160f24]/35 opacity-65 cursor-not-allowed"
                : value.isPaid
                  ? "border-[#ffd15c] bg-[#160f24] cursor-pointer"
                  : "border-[#9e762a]/50 bg-[#160f24]/50 hover:border-[#8ec8ff] cursor-pointer"
            }`}
          >
            <div className="flex items-center gap-2">
              <input
                id={`${uid}-mode-paid`}
                type="radio"
                name={`${uid}-pricing-mode`}
                disabled={!payoutStatus.payoutsReady}
                checked={value.isPaid}
                onChange={() => onChange({ ...value, isPaid: true })}
                className="rpg-choice-input h-4 w-4"
              />
              <span className="font-pixel text-xs text-[#ffd15c] inline-flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                PAID PER PULL
              </span>
            </div>
            <p className="mt-1.5 text-xs text-[#cfc3e8]">
              {payoutStatus.payoutsReady
                ? "Set any price ($0.50+). No daily timer—buyers can purchase as many pulls as they want!"
                : "Connect a Stripe payout method above first to enable paid pulls."}
            </p>
          </label>
        </div>

        {/* Paid Configuration & Live Payout Estimator */}
        {value.isPaid ? (
          <div className="space-y-4 border-t border-[#9e762a]/40 pt-4">
            {/* Custom USD Price Input */}
            <div className="space-y-1.5">
              <label
                htmlFor={`${uid}-price-usd`}
                className="block font-pixel text-xs text-[#fdf6e9]"
              >
                Price per Mystery Box Pull (USD) *
              </label>
              <p id={`${uid}-price-hint`} className="text-xs text-[#cfc3e8]">
                Set whatever price you want per pull ($0.50 USD minimum). Paid
                boxes have no once-per-day cooldown!
              </p>
              <div className="relative max-w-xs">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center font-pixel text-sm text-[#ffd15c]"
                >
                  $
                </span>
                <input
                  id={`${uid}-price-usd`}
                  name="priceUsd"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={value.priceDollarsInput}
                  onChange={(e) =>
                    onChange({ ...value, priceDollarsInput: e.target.value })
                  }
                  aria-describedby={`${uid}-price-hint`}
                  placeholder="2.50"
                  className="rpg-field-control w-full rounded border-2 border-[#9e762a] bg-[#160f24] py-2.5 pl-8 pr-14 font-semibold text-[#fdf6e9] focus:border-[#ffd15c] focus:outline-none"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center font-pixel text-[10px] text-[#cfc3e8]"
                >
                  USD
                </span>
              </div>
            </div>

            {/* Optional Support Give a Thing Percentage (0% default, 10%, Custom %) */}
            <fieldset className="space-y-2.5">
              <legend className="font-pixel text-xs text-[#ff99ac] flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                Support Give a Thing (Optional Donation %)
              </legend>
              <p className="text-xs text-[#cfc3e8]">
                Want to chip in a slice of each pull to support Give a Thing?
                Defaults to <strong>0%</strong>—completely optional!
              </p>

              <div className="flex flex-wrap items-center gap-2.5">
                {(
                  [
                    { preset: "0", label: "0% (Default)" },
                    { preset: "10", label: "10%" },
                    { preset: "custom", label: "Custom %" },
                  ] as const
                ).map((opt) => {
                  const selected = value.donationPreset === opt.preset;
                  return (
                    <label
                      key={opt.preset}
                      htmlFor={`${uid}-don-${opt.preset}`}
                      className={`inline-flex items-center gap-2 rounded border-2 px-3.5 py-2 cursor-pointer font-pixel text-[10px] transition-colors ${
                        selected
                          ? "border-[#ff99ac] bg-[#483275] text-[#ffd15c]"
                          : "border-[#9e762a]/60 bg-[#160f24] text-[#cfc3e8] hover:border-[#8ec8ff]"
                      }`}
                    >
                      <input
                        id={`${uid}-don-${opt.preset}`}
                        type="radio"
                        name={`${uid}-donation-preset`}
                        checked={selected}
                        onChange={() =>
                          onChange({ ...value, donationPreset: opt.preset })
                        }
                        className="rpg-choice-input h-3.5 w-3.5"
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}

                {value.donationPreset === "custom" ? (
                  <div className="inline-flex items-center gap-1.5">
                    <label htmlFor={`${uid}-custom-pct`} className="sr-only">
                      Custom Give a Thing donation percentage
                    </label>
                    <input
                      id={`${uid}-custom-pct`}
                      name="customDonationPercent"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      value={value.customDonationInput}
                      onChange={(e) =>
                        onChange({
                          ...value,
                          customDonationInput: e.target.value,
                        })
                      }
                      placeholder="5"
                      className="rpg-field-control w-24 rounded border-2 border-[#ff99ac] bg-[#160f24] px-3 py-1.5 text-sm text-[#fdf6e9] focus:border-[#ffd15c] focus:outline-none"
                    />
                    <span className="font-pixel text-xs text-[#ff99ac]">%</span>
                  </div>
                ) : null}
              </div>
            </fieldset>

            {/* Live Stripe Fee & Creator Net Payout Estimate */}
            <div className="rpg-slot p-4 space-y-2.5 border-[#ffd15c]/50">
              <p className="font-pixel text-[10px] text-[#ffd15c]">
                ESTIMATED PAYOUT BREAKDOWN PER PULL
              </p>

              <dl className="space-y-1.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between gap-2 text-[#fdf6e9]">
                  <dt>Buyer Pays per Pull</dt>
                  <dd className="font-semibold">
                    {formatUsdCents(parsedPriceCents)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-2 text-[#cfc3e8]">
                  <dt>Est. Stripe Processing Fee (2.9% + $0.30)</dt>
                  <dd className="text-[#ff99ac]">
                    -{formatUsdCents(breakdown.estimatedStripeFeeCents)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-2 text-[#cfc3e8]">
                  <dt>
                    Support Give a Thing ({bpsToPercentDisplay(activeBps)})
                  </dt>
                  <dd
                    className={
                      breakdown.platformDonationCents > 0
                        ? "text-[#ff99ac]"
                        : "text-[#cfc3e8]"
                    }
                  >
                    {breakdown.platformDonationCents > 0
                      ? `-${formatUsdCents(breakdown.platformDonationCents)}`
                      : "$0.00"}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-[#9e762a]/45 pt-2 font-bold">
                  <dt className="font-pixel text-[11px] text-[#4be3a0]">
                    ESTIMATED PAYOUT TO YOU
                  </dt>
                  <dd
                    className={`font-pixel text-sm ${
                      breakdown.estimatedCreatorNetCents >= 1
                        ? "text-[#4be3a0]"
                        : "text-[#ff4d6d]"
                    }`}
                  >
                    {formatUsdCents(breakdown.estimatedCreatorNetCents)}
                  </dd>
                </div>
              </dl>

              <p className="text-[11px] text-[#cfc3e8]/80 leading-relaxed">
                Estimate assumes a standard domestic US card (2.9% + $0.30).
                International cards or currency conversion may carry additional
                Stripe card-network fees.
              </p>

              {!breakdown.valid && breakdown.validationError ? (
                <p
                  role="alert"
                  className="flex items-start gap-2 rounded border border-[#ff4d6d] bg-[#ff4d6d]/15 p-2.5 text-xs text-[#ffd6de]"
                >
                  <AlertTriangle
                    className="h-4 w-4 shrink-0 text-[#ff4d6d] mt-0.5"
                    aria-hidden="true"
                  />
                  <span>{breakdown.validationError}</span>
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </fieldset>
    </div>
  );
}
