/**
 * Pure Mystery Box pricing, Stripe fee estimation, and Give a Thing donation math.
 * Safe to import in both server modules and client React components.
 */

/** Stripe minimum USD charge ($0.50 = 50 cents) */
export const MIN_PAID_PULL_CENTS = 50;

/** Sensible upper ceiling per Mystery Box pull ($10,000.00) */
export const MAX_PAID_PULL_CENTS = 1_000_000;

/** Maximum optional Give a Thing platform support percentage (90.00% = 9000 bps) */
export const MAX_PLATFORM_FEE_BPS = 9_000;

/** Standard US domestic Stripe card processing rate: 2.9% + $0.30 */
export const STRIPE_ESTIMATED_CARD_BPS = 290;
export const STRIPE_ESTIMATED_FIXED_CENTS = 30;

export interface MysteryBoxPayoutBreakdown {
  isFree: boolean;
  priceCents: number;
  platformFeeBps: number;
  estimatedStripeFeeCents: number;
  platformDonationCents: number;
  estimatedCreatorNetCents: number;
  valid: boolean;
  validationError: string | null;
}

export function formatUsdCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

export function parseUsdInputToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/^\$/, "").trim();
  if (!cleaned) return null;
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

export function percentToBps(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.min(MAX_PLATFORM_FEE_BPS, Math.max(0, Math.round(percent * 100)));
}

export function bpsToPercentDisplay(bps: number): string {
  const pct = bps / 100;
  return Number.isInteger(pct) ? `${pct}%` : `${pct.toFixed(1).replace(/\.0$/, "")}%`;
}

/**
 * Estimates Stripe processing fees (2.9% + $0.30 standard US card rate),
 * optional Give a Thing platform support donation (`platformFeeBps`),
 * and the creator's net payout per Mystery Box pull.
 */
export function estimateMysteryBoxPayoutBreakdown(
  rawPriceCents: number,
  rawPlatformFeeBps: number
): MysteryBoxPayoutBreakdown {
  const priceCents = Number.isInteger(rawPriceCents) ? rawPriceCents : -1;
  const platformFeeBps = Number.isInteger(rawPlatformFeeBps)
    ? rawPlatformFeeBps
    : -1;

  if (priceCents < 0) {
    return {
      isFree: false,
      priceCents: 0,
      platformFeeBps: 0,
      estimatedStripeFeeCents: 0,
      platformDonationCents: 0,
      estimatedCreatorNetCents: 0,
      valid: false,
      validationError: "Enter a valid USD price (or $0.00 for a free box).",
    };
  }

  if (priceCents === 0) {
    return {
      isFree: true,
      priceCents: 0,
      platformFeeBps: 0,
      estimatedStripeFeeCents: 0,
      platformDonationCents: 0,
      estimatedCreatorNetCents: 0,
      valid: true,
      validationError: null,
    };
  }

  if (platformFeeBps < 0 || platformFeeBps > MAX_PLATFORM_FEE_BPS) {
    return {
      isFree: false,
      priceCents,
      platformFeeBps: Math.max(0, platformFeeBps),
      estimatedStripeFeeCents: 0,
      platformDonationCents: 0,
      estimatedCreatorNetCents: 0,
      valid: false,
      validationError: "Give a Thing support percentage must be between 0% and 90%.",
    };
  }

  const estimatedStripeFeeCents =
    Math.round((priceCents * STRIPE_ESTIMATED_CARD_BPS) / 10_000) +
    STRIPE_ESTIMATED_FIXED_CENTS;
  const platformDonationCents = Math.round(
    (priceCents * platformFeeBps) / 10_000
  );
  const estimatedCreatorNetCents =
    priceCents - estimatedStripeFeeCents - platformDonationCents;

  if (priceCents < MIN_PAID_PULL_CENTS) {
    return {
      isFree: false,
      priceCents,
      platformFeeBps,
      estimatedStripeFeeCents,
      platformDonationCents,
      estimatedCreatorNetCents,
      valid: false,
      validationError:
        "Paid mystery boxes must be at least $0.50 per pull (Stripe's minimum USD charge), or $0.00 for free.",
    };
  }

  if (priceCents > MAX_PAID_PULL_CENTS) {
    return {
      isFree: false,
      priceCents,
      platformFeeBps,
      estimatedStripeFeeCents,
      platformDonationCents,
      estimatedCreatorNetCents,
      valid: false,
      validationError: `Price per pull must be ${formatUsdCents(MAX_PAID_PULL_CENTS)} or less.`,
    };
  }

  if (estimatedCreatorNetCents < 1) {
    return {
      isFree: false,
      priceCents,
      platformFeeBps,
      estimatedStripeFeeCents,
      platformDonationCents,
      estimatedCreatorNetCents,
      valid: false,
      validationError:
        "After estimated Stripe fees ($0.30 + 2.9%) and your chosen Give a Thing support %, your net payout would be $0.00 or negative. Increase the pull price or lower the support %.",
    };
  }

  return {
    isFree: false,
    priceCents,
    platformFeeBps,
    estimatedStripeFeeCents,
    platformDonationCents,
    estimatedCreatorNetCents,
    valid: true,
    validationError: null,
  };
}
