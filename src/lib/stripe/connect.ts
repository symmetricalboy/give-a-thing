import { and, count, eq, inArray, sql } from "drizzle-orm";
import Stripe from "stripe";
import { getDb, schema } from "@/db";
import { getPublicAppUrl } from "@/lib/atproto/oauth";
import {
  getCurrentUtcDateString,
  isUnlimitedPullAccount,
} from "@/lib/generator/pull-service";
import { nextTid } from "@/lib/lexicons";
import {
  CollectionSoldOutError,
  CreatorCannotPullOwnBoxError,
  finalizeCollectionItemDelivery,
  releaseExpiredCollectionReservations,
} from "@/lib/maker/collection-service";
import {
  estimateMysteryBoxPayoutBreakdown,
  PLATFORM_STRIPE_ACCOUNT_SENTINEL,
} from "@/lib/stripe/pricing";

export interface CreatorPayoutStatus {
  stripeConfigured: boolean;
  connected: boolean;
  payoutsReady: boolean;
  stripeAccountId: string | null;
  cardPaymentsStatus: string;
  payoutsStatus: string;
  requirementsDue: boolean;
}

let cachedStripe: Stripe | null = null;
let cachedStripeKey: string | null = null;

export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return Boolean(key && !key.includes("replace_with"));
}

function isStripeKeyLivemode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  return key.startsWith("sk_live_") || key.startsWith("rk_live_");
}

function isMissingOrModeMismatchedStripeAccountError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    code?: string;
    statusCode?: number;
    message?: string;
  };
  if (e.code === "resource_missing" || e.statusCode === 404) return true;
  const msg = (e.message ?? "").toLowerCase();
  return (
    msg.includes("no such account") ||
    msg.includes("similar object exists in test mode") ||
    msg.includes("similar object exists in live mode") ||
    msg.includes("does not have access to account")
  );
}

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || key.includes("replace_with")) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured on the server yet. Add your Stripe secret key to enable payouts and paid mystery boxes."
    );
  }
  if (!cachedStripe || cachedStripeKey !== key) {
    cachedStripe = new Stripe(key);
    cachedStripeKey = key;
  }
  return cachedStripe;
}

function buildStripeRequestOptions(
  stripeAccountId: string | null | undefined
): Stripe.RequestOptions | undefined {
  if (!stripeAccountId || stripeAccountId === PLATFORM_STRIPE_ACCOUNT_SENTINEL) {
    return undefined;
  }
  return { stripeAccount: stripeAccountId };
}

/**
 * Queries Stripe Accounts v2 for the creator's live payout & card-acceptance status
 * and updates `users.stripe_payouts_ready` in PostgreSQL.
 */
export async function syncCreatorPayoutStatus(
  creatorDid: string
): Promise<CreatorPayoutStatus> {
  if (!isStripeConfigured()) {
    return {
      stripeConfigured: false,
      connected: false,
      payoutsReady: false,
      stripeAccountId: null,
      cardPaymentsStatus: "unconfigured",
      payoutsStatus: "unconfigured",
      requirementsDue: false,
    };
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.did, creatorDid))
    .limit(1);

  if (user && isUnlimitedPullAccount(user)) {
    if (
      user.stripeAccountId !== PLATFORM_STRIPE_ACCOUNT_SENTINEL ||
      !user.stripePayoutsReady
    ) {
      await db
        .update(schema.users)
        .set({
          stripeAccountId: PLATFORM_STRIPE_ACCOUNT_SENTINEL,
          stripePayoutsReady: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.did, creatorDid));
    }

    return {
      stripeConfigured: true,
      connected: true,
      payoutsReady: true,
      stripeAccountId: PLATFORM_STRIPE_ACCOUNT_SENTINEL,
      cardPaymentsStatus: "active",
      payoutsStatus: "active",
      requirementsDue: false,
    };
  }

  if (!user || !user.stripeAccountId) {
    return {
      stripeConfigured: true,
      connected: false,
      payoutsReady: false,
      stripeAccountId: null,
      cardPaymentsStatus: "not_started",
      payoutsStatus: "not_started",
      requirementsDue: false,
    };
  }

  try {
    const stripe = getStripeClient();
    const acct = await stripe.v2.core.accounts.retrieve(user.stripeAccountId, {
      include: ["configuration.merchant", "defaults", "requirements"],
    });

    // Self-heal if switching between Stripe sandbox (sk_test_) and live production (sk_live_)
    if (acct.livemode !== isStripeKeyLivemode()) {
      await db
        .update(schema.users)
        .set({
          stripeAccountId: null,
          stripePayoutsReady: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.did, creatorDid));

      return {
        stripeConfigured: true,
        connected: false,
        payoutsReady: false,
        stripeAccountId: null,
        cardPaymentsStatus: "not_started",
        payoutsStatus: "not_started",
        requirementsDue: false,
      };
    }

    const cardPaymentsStatus =
      acct.configuration?.merchant?.capabilities?.card_payments?.status ??
      "pending";
    const payoutsStatus =
      acct.configuration?.merchant?.capabilities?.stripe_balance?.payouts
        ?.status ?? "pending";

    const dueEntries =
      acct.requirements?.entries?.filter(
        (e) => e.awaiting_action_from === "user"
      ) ?? [];
    const requirementsDue = dueEntries.length > 0;
    const payoutsReady =
      !acct.closed &&
      cardPaymentsStatus === "active" &&
      payoutsStatus === "active";

    if (user.stripePayoutsReady !== payoutsReady) {
      await db
        .update(schema.users)
        .set({
          stripePayoutsReady: payoutsReady,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.did, creatorDid));
    }

    return {
      stripeConfigured: true,
      connected: true,
      payoutsReady,
      stripeAccountId: user.stripeAccountId,
      cardPaymentsStatus,
      payoutsStatus,
      requirementsDue,
    };
  } catch (err) {
    // Automatically clear stale sandbox account IDs when switching to live mode (or vice-versa)
    if (isMissingOrModeMismatchedStripeAccountError(err)) {
      await db
        .update(schema.users)
        .set({
          stripeAccountId: null,
          stripePayoutsReady: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.did, creatorDid));

      return {
        stripeConfigured: true,
        connected: false,
        payoutsReady: false,
        stripeAccountId: null,
        cardPaymentsStatus: "not_started",
        payoutsStatus: "not_started",
        requirementsDue: false,
      };
    }

    console.warn("[stripe/connect] Could not retrieve v2 account:", err);
    return {
      stripeConfigured: true,
      connected: true,
      payoutsReady: user.stripePayoutsReady,
      stripeAccountId: user.stripeAccountId,
      cardPaymentsStatus: user.stripePayoutsReady ? "active" : "pending",
      payoutsStatus: user.stripePayoutsReady ? "active" : "pending",
      requirementsDue: !user.stripePayoutsReady,
    };
  }
}

/**
 * Syncs payout readiness by Stripe Account ID (`acct_...`), used by Stripe webhooks.
 */
export async function syncCreatorPayoutStatusByStripeAccountId(
  stripeAccountId: string
): Promise<void> {
  if (!isStripeConfigured()) return;
  const db = getDb();
  const [user] = await db
    .select({ did: schema.users.did })
    .from(schema.users)
    .where(eq(schema.users.stripeAccountId, stripeAccountId))
    .limit(1);
  if (user) {
    await syncCreatorPayoutStatus(user.did);
  }
}

/**
 * Creates a Stripe Accounts v2 connected account (if needed) with Stripe-owned fees
 * and loss liability (`fees_collector: 'stripe'`, `losses_collector: 'stripe'`) and
 * generates a single-use Stripe-hosted onboarding or update link.
 */
export async function createCreatorPayoutOnboardingLink(
  creatorDid: string,
  mode: "onboard" | "update" = "onboard"
): Promise<{ url: string; stripeAccountId: string }> {
  const stripe = getStripeClient();
  // Ensure any stale sandbox account ID is cleared before onboarding in live mode
  await syncCreatorPayoutStatus(creatorDid);

  const db = getDb();
  const appUrl = getPublicAppUrl();

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.did, creatorDid))
    .limit(1);

  if (!user) {
    throw new Error("Creator account not found. Please log in again.");
  }

  if (
    isUnlimitedPullAccount(user) ||
    user.stripeAccountId === PLATFORM_STRIPE_ACCOUNT_SENTINEL
  ) {
    return {
      url: `${appUrl}/make?stripe=return`,
      stripeAccountId: PLATFORM_STRIPE_ACCOUNT_SENTINEL,
    };
  }

  let stripeAccountId = user.stripeAccountId;

  if (!stripeAccountId) {
    const created = await stripe.v2.core.accounts.create({
      display_name: user.displayName || `@${user.handle}`,
      dashboard: "full",
      defaults: {
        currency: "usd",
        responsibilities: {
          fees_collector: "stripe",
          losses_collector: "stripe",
        },
        profile: {
          doing_business_as: `@${user.handle}`,
          product_description: `Collectible 16-bit Mystery Box items created by @${user.handle} on Give a Thing`,
          ...(appUrl.startsWith("https://")
            ? { business_url: `${appUrl}/u/${encodeURIComponent(user.handle)}` }
            : {}),
        },
      },
      identity: {
        country: "US",
      },
      configuration: {
        merchant: {
          capabilities: {
            card_payments: { requested: true },
          },
        },
      },
      metadata: {
        giveathing_did: user.did,
        giveathing_handle: user.handle,
      },
      include: ["configuration.merchant", "defaults", "requirements"],
    });

    stripeAccountId = created.id;
    await db
      .update(schema.users)
      .set({
        stripeAccountId,
        stripePayoutsReady: false,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.did, creatorDid));
  }

  const returnUrl = `${appUrl}/make?stripe=return`;
  const refreshUrl = `${appUrl}/api/stripe/connect/refresh`;

  try {
    const useCaseType =
      mode === "update" && user.stripePayoutsReady
        ? "account_update"
        : "account_onboarding";

    const v2Link = await stripe.v2.core.accountLinks.create({
      account: stripeAccountId,
      use_case:
        useCaseType === "account_update"
          ? {
              type: "account_update",
              account_update: {
                collection_options: { fields: "eventually_due" },
                refresh_url: refreshUrl,
                return_url: returnUrl,
              },
            }
          : {
              type: "account_onboarding",
              account_onboarding: {
                collection_options: { fields: "eventually_due" },
                refresh_url: refreshUrl,
                return_url: returnUrl,
              },
            },
    });

    return { url: v2Link.url, stripeAccountId };
  } catch (err) {
    // Fallback for local http://127.0.0.1 development where v2 Account Links enforce https://
    if (appUrl.startsWith("http://")) {
      const v1Link = await stripe.accountLinks.create({
        account: stripeAccountId,
        type: "account_onboarding",
        collect: "eventually_due",
        refresh_url: refreshUrl,
        return_url: returnUrl,
      });
      return { url: v1Link.url, stripeAccountId };
    }
    throw err;
  }
}

/**
 * Atomically reserves 1 unclaimed Thing from a paid Mystery Box collection for 30 minutes
 * and creates a Stripe Checkout Session as a Direct Charge on the creator's connected account.
 */
export async function createPaidCollectionCheckoutSession(params: {
  collectionTid: string;
  buyerDid: string;
}): Promise<{ checkoutUrl: string; sessionId: string; purchaseId: string }> {
  const stripe = getStripeClient();
  await releaseExpiredCollectionReservations();

  const db = getDb();
  const [collection] = await db
    .select()
    .from(schema.thingCollections)
    .where(eq(schema.thingCollections.collectionTid, params.collectionTid))
    .limit(1);

  if (!collection) {
    throw new Error("Collection not found.");
  }

  // Strictly block ALL users (including @giveathing.com) from pulling/buying their own boxes
  if (collection.creatorDid === params.buyerDid) {
    throw new CreatorCannotPullOwnBoxError();
  }

  if (collection.priceCents <= 0) {
    throw new Error("This mystery box is free—use the standard Draw button!");
  }

  const [[creator], [buyer]] = await Promise.all([
    db
      .select()
      .from(schema.users)
      .where(eq(schema.users.did, collection.creatorDid))
      .limit(1),
    db
      .select()
      .from(schema.users)
      .where(eq(schema.users.did, params.buyerDid))
      .limit(1),
  ]);

  if (!buyer) {
    throw new Error("Player account not found. Please log in again.");
  }
  if (!creator) {
    throw new Error(
      "This creator's payout account is temporarily unavailable for paid pulls."
    );
  }

  let effectiveStripeAccountId = creator.stripeAccountId;
  let effectivePayoutsReady = creator.stripePayoutsReady;
  if (isUnlimitedPullAccount(creator) && isStripeConfigured()) {
    if (
      effectiveStripeAccountId !== PLATFORM_STRIPE_ACCOUNT_SENTINEL ||
      !effectivePayoutsReady
    ) {
      await db
        .update(schema.users)
        .set({
          stripeAccountId: PLATFORM_STRIPE_ACCOUNT_SENTINEL,
          stripePayoutsReady: true,
          updatedAt: new Date(),
        })
        .where(eq(schema.users.did, creator.did));
    }
    effectiveStripeAccountId = PLATFORM_STRIPE_ACCOUNT_SENTINEL;
    effectivePayoutsReady = true;
  }

  if (!effectiveStripeAccountId || !effectivePayoutsReady) {
    throw new Error(
      "This creator's payout account is temporarily unavailable for paid pulls."
    );
  }

  const isPlatformDirect =
    effectiveStripeAccountId === PLATFORM_STRIPE_ACCOUNT_SENTINEL;
  const effectivePlatformFeeBps = isPlatformDirect
    ? 0
    : collection.platformFeeBps;

  const breakdown = estimateMysteryBoxPayoutBreakdown(
    collection.priceCents,
    effectivePlatformFeeBps
  );
  if (!breakdown.valid) {
    throw new Error(
      breakdown.validationError ?? "Invalid collection price configuration."
    );
  }

  const purchaseId = nextTid();
  const expiresEpochSec = Math.floor(Date.now() / 1000) + 30 * 60;
  const expiresAt = new Date(expiresEpochSec * 1000);

  // Atomically reserve 1 unclaimed item so concurrent buyers can never oversell the box
  const reservedThing = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(717341102)`);

    const unclaimedRows = await tx
      .select()
      .from(schema.things)
      .where(
        and(
          eq(schema.things.collectionId, params.collectionTid),
          eq(schema.things.status, "unclaimed")
        )
      );

    if (unclaimedRows.length === 0) {
      throw new CollectionSoldOutError();
    }

    const chosen =
      unclaimedRows[Math.floor(Math.random() * unclaimedRows.length)]!;

    const [lockedThing] = await tx
      .update(schema.things)
      .set({ status: "reserved" })
      .where(
        and(
          eq(schema.things.thingTid, chosen.thingTid),
          eq(schema.things.status, "unclaimed")
        )
      )
      .returning();

    if (!lockedThing) {
      throw new CollectionSoldOutError();
    }

    await tx.insert(schema.collectionPurchases).values({
      purchaseId,
      collectionTid: params.collectionTid,
      thingTid: lockedThing.thingTid,
      buyerDid: params.buyerDid,
      creatorDid: creator.did,
      stripeAccountId: effectiveStripeAccountId,
      amountCents: breakdown.priceCents,
      platformFeeCents: breakdown.platformDonationCents,
      status: "pending",
      expiresAt,
      createdAt: new Date(),
    });

    return lockedThing;
  });

  const appUrl = getPublicAppUrl();
  const profilePath = `/u/${encodeURIComponent(creator.handle)}`;
  const stripeReqOptions = buildStripeRequestOptions(effectiveStripeAccountId);

  try {
    const checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        expires_at: expiresEpochSec,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: breakdown.priceCents,
              product_data: {
                name: `${collection.name} — Mystery Box Pull`,
                description: `Unwrap 1 unique mystery thing created by @${creator.handle} on Give a Thing`,
              },
            },
          },
        ],
        payment_intent_data: {
          ...(!isPlatformDirect && breakdown.platformDonationCents > 0
            ? { application_fee_amount: breakdown.platformDonationCents }
            : {}),
          metadata: {
            purchase_id: purchaseId,
            collection_tid: collection.collectionTid,
            buyer_did: params.buyerDid,
            creator_did: creator.did,
          },
        },
        metadata: {
          purchase_id: purchaseId,
          collection_tid: collection.collectionTid,
          buyer_did: params.buyerDid,
          creator_did: creator.did,
        },
        success_url: `${appUrl}${profilePath}?checkout_session_id={CHECKOUT_SESSION_ID}&collection=${encodeURIComponent(collection.collectionTid)}`,
        cancel_url: `${appUrl}${profilePath}?checkout_cancelled=${encodeURIComponent(purchaseId)}`,
      },
      stripeReqOptions
    );

    if (!checkoutSession.url) {
      throw new Error("Stripe did not return a Checkout URL.");
    }

    await db
      .update(schema.collectionPurchases)
      .set({ checkoutSessionId: checkoutSession.id })
      .where(eq(schema.collectionPurchases.purchaseId, purchaseId));

    return {
      checkoutUrl: checkoutSession.url,
      sessionId: checkoutSession.id,
      purchaseId,
    };
  } catch (err) {
    // Roll back reservation immediately if Stripe session creation failed
    await db
      .update(schema.collectionPurchases)
      .set({ status: "cancelled" })
      .where(eq(schema.collectionPurchases.purchaseId, purchaseId));
    await db
      .update(schema.things)
      .set({ status: "unclaimed" })
      .where(
        and(
          eq(schema.things.thingTid, reservedThing.thingTid),
          eq(schema.things.status, "reserved")
        )
      );
    throw err;
  }
}

/**
 * Releases a pending reservation immediately when a buyer cancels Checkout or when
 * `checkout.session.expired` / `checkout.session.async_payment_failed` fires.
 */
export async function releasePendingCollectionPurchase(params: {
  purchaseId?: string;
  checkoutSessionId?: string;
  actorDid?: string;
}): Promise<void> {
  const db = getDb();
  const whereCond = params.purchaseId
    ? eq(schema.collectionPurchases.purchaseId, params.purchaseId)
    : params.checkoutSessionId
      ? eq(
          schema.collectionPurchases.checkoutSessionId,
          params.checkoutSessionId
        )
      : null;
  if (!whereCond) return;

  const [purchase] = await db
    .select()
    .from(schema.collectionPurchases)
    .where(whereCond)
    .limit(1);

  if (!purchase || purchase.status !== "pending") return;
  if (params.actorDid && purchase.buyerDid !== params.actorDid) return;

  // Verify on Stripe that payment wasn't completed before releasing
  if (purchase.checkoutSessionId && isStripeConfigured()) {
    try {
      const stripe = getStripeClient();
      const stripeReqOptions = buildStripeRequestOptions(
        purchase.stripeAccountId
      );
      const session = await stripe.checkout.sessions.retrieve(
        purchase.checkoutSessionId,
        {},
        stripeReqOptions
      );
      if (session.payment_status === "paid") {
        return;
      }
      if (session.status === "open") {
        await stripe.checkout.sessions
          .expire(purchase.checkoutSessionId, {}, stripeReqOptions)
          .catch(() => {});
      }
    } catch {
      // Ignore retrieval errors on expired/test sessions
    }
  }

  await db
    .update(schema.collectionPurchases)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(schema.collectionPurchases.purchaseId, purchase.purchaseId),
        eq(schema.collectionPurchases.status, "pending")
      )
    );

  await db
    .update(schema.things)
    .set({ status: "unclaimed" })
    .where(
      and(
        eq(schema.things.thingTid, purchase.thingTid),
        eq(schema.things.status, "reserved")
      )
    );
}

/**
 * Idempotently fulfills a paid Mystery Box purchase by `checkoutSessionId`:
 * - Safe to call from BOTH the buyer's return redirect AND the Stripe Connect webhook!
 * - Verifies `payment_status === 'paid'` directly on the connected account's Checkout Session.
 * - Transfers ownership to `buyerDid`, mints PDS ledger #0 & holding, and returns the unboxed Thing.
 */
export async function fulfillPaidCollectionPurchase(params: {
  checkoutSessionId: string;
  viewerDid?: string | null;
}) {
  const db = getDb();
  const [existingPurchase] = await db
    .select()
    .from(schema.collectionPurchases)
    .where(
      eq(schema.collectionPurchases.checkoutSessionId, params.checkoutSessionId)
    )
    .limit(1);

  if (!existingPurchase) {
    throw new Error("Checkout purchase record not found.");
  }

  if (params.viewerDid && existingPurchase.buyerDid !== params.viewerDid) {
    throw new Error("This purchase belongs to another player.");
  }

  const stripe = getStripeClient();
  const stripeReqOptions = buildStripeRequestOptions(
    existingPurchase.stripeAccountId
  );
  const session = await stripe.checkout.sessions.retrieve(
    params.checkoutSessionId,
    {},
    stripeReqOptions
  );

  if (session.payment_status !== "paid") {
    throw new Error(
      "Payment has not completed yet. Once payment settles, your thing will appear automatically in YOUR THINGS!"
    );
  }

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const [buyer] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.did, existingPurchase.buyerDid))
    .limit(1);

  if (!buyer) {
    throw new Error("Buyer account not found.");
  }

  const pullUtcDate = getCurrentUtcDateString();

  const txResult = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(717341103)`);

    const [freshPurchase] = await tx
      .select()
      .from(schema.collectionPurchases)
      .where(
        eq(
          schema.collectionPurchases.purchaseId,
          existingPurchase.purchaseId
        )
      )
      .limit(1);

    if (!freshPurchase) {
      throw new Error("Purchase not found.");
    }

    // Already fulfilled (e.g. webhook beat browser redirect): return the delivered Thing!
    if (freshPurchase.status === "fulfilled") {
      const [alreadyThing] = await tx
        .select()
        .from(schema.things)
        .where(eq(schema.things.thingTid, freshPurchase.thingTid))
        .limit(1);
      const [remRes] = await tx
        .select({ value: count() })
        .from(schema.things)
        .where(
          and(
            eq(schema.things.collectionId, freshPurchase.collectionTid),
            eq(schema.things.status, "unclaimed")
          )
        );
      return {
        justFulfilled: false,
        thing: alreadyThing ?? null,
        remainingCount: Number(remRes?.value ?? 0),
        creatorDid: freshPurchase.creatorDid,
        collectionTid: freshPurchase.collectionTid,
      };
    }

    const slotRows = await tx
      .select({
        maxSlot: sql<number>`COALESCE(MAX(${schema.things.pullSlot}), 0)`,
      })
      .from(schema.things)
      .where(
        and(
          eq(schema.things.discovererDid, freshPurchase.buyerDid),
          eq(schema.things.pullUtcDate, pullUtcDate)
        )
      );
    const nextSlot = Number(slotRows[0]?.maxSlot ?? 0) + 1;

    // 1. Claim the reserved Thing (or fallback to another unclaimed Thing if late async settlement)
    let [claimedThing] = await tx
      .update(schema.things)
      .set({
        status: "held",
        discovererDid: freshPurchase.buyerDid,
        currentOwnerDid: freshPurchase.buyerDid,
        pullUtcDate,
        pullSlot: nextSlot,
      })
      .where(
        and(
          eq(schema.things.thingTid, freshPurchase.thingTid),
          inArray(schema.things.status, ["reserved", "unclaimed"])
        )
      )
      .returning();

    if (!claimedThing) {
      const fallbackRows = await tx
        .select()
        .from(schema.things)
        .where(
          and(
            eq(schema.things.collectionId, freshPurchase.collectionTid),
            eq(schema.things.status, "unclaimed")
          )
        )
        .limit(1);

      if (fallbackRows[0]) {
        const [fbClaimed] = await tx
          .update(schema.things)
          .set({
            status: "held",
            discovererDid: freshPurchase.buyerDid,
            currentOwnerDid: freshPurchase.buyerDid,
            pullUtcDate,
            pullSlot: nextSlot,
          })
          .where(
            and(
              eq(schema.things.thingTid, fallbackRows[0].thingTid),
              eq(schema.things.status, "unclaimed")
            )
          )
          .returning();
        claimedThing = fbClaimed;
      }
    }

    if (!claimedThing) {
      return {
        justFulfilled: false,
        soldOutRefundNeeded: true,
        thing: null,
        remainingCount: 0,
        creatorDid: freshPurchase.creatorDid,
        collectionTid: freshPurchase.collectionTid,
      };
    }

    await tx
      .update(schema.collectionPurchases)
      .set({
        thingTid: claimedThing.thingTid,
        paymentIntentId,
        status: "fulfilled",
        fulfilledAt: new Date(),
      })
      .where(
        eq(schema.collectionPurchases.purchaseId, freshPurchase.purchaseId)
      );

    const [remRes] = await tx
      .select({ value: count() })
      .from(schema.things)
      .where(
        and(
          eq(schema.things.collectionId, freshPurchase.collectionTid),
          eq(schema.things.status, "unclaimed")
        )
      );

    return {
      justFulfilled: true,
      soldOutRefundNeeded: false,
      thing: claimedThing,
      remainingCount: Number(remRes?.value ?? 0),
      creatorDid: freshPurchase.creatorDid,
      collectionTid: freshPurchase.collectionTid,
    };
  });

  if (txResult.soldOutRefundNeeded) {
    if (paymentIntentId) {
      const isPlatformDirect =
        existingPurchase.stripeAccountId === PLATFORM_STRIPE_ACCOUNT_SENTINEL;
      await stripe.refunds
        .create(
          {
            payment_intent: paymentIntentId,
            ...(!isPlatformDirect && existingPurchase.platformFeeCents > 0
              ? { refund_application_fee: true }
              : {}),
          },
          stripeReqOptions
        )
        .catch((err) => {
          console.error("[stripe/fulfill] Auto-refund error:", err);
        });
    }
    throw new CollectionSoldOutError();
  }

  if (!txResult.thing) {
    throw new Error("Could not locate fulfilled mystery thing.");
  }

  if (txResult.justFulfilled) {
    await finalizeCollectionItemDelivery({
      thing: txResult.thing,
      creatorDid: txResult.creatorDid,
      recipientDid: existingPurchase.buyerDid,
      recipientHandle: buyer.handle,
    });
  }

  return {
    collectionTid: txResult.collectionTid,
    thingTid: txResult.thing.thingTid,
    catalogNumber: txResult.thing.catalogNumber,
    name: txResult.thing.name,
    category: txResult.thing.category,
    subcategory: txResult.thing.subcategory,
    description: txResult.thing.description,
    flavorText: txResult.thing.flavorText,
    uselessTrait: txResult.thing.uselessTrait,
    iconUrl: txResult.thing.iconUrl,
    iconAlt: txResult.thing.iconAlt,
    remainingCount: txResult.remainingCount,
  };
}
