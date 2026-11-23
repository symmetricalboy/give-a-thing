import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  fulfillPaidCollectionPurchase,
  getStripeClient,
  isStripeConfigured,
  releasePendingCollectionPurchase,
  syncCreatorPayoutStatusByStripeAccountId,
} from "@/lib/stripe/connect";
import { parseStripeWebhookSecrets } from "@/lib/stripe/pricing";

export async function POST(req: NextRequest) {
  const webhookSecrets = parseStripeWebhookSecrets(
    process.env.STRIPE_WEBHOOK_SECRET
  );
  if (!isStripeConfigured() || webhookSecrets.length === 0) {
    return NextResponse.json(
      { error: "Stripe webhook is not configured." },
      { status: 503 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header." },
      { status: 400 }
    );
  }

  const rawBody = await req.text();
  const stripe = getStripeClient();

  let event: Stripe.Event | null = null;
  let lastVerifyErr: unknown = null;
  for (const secret of webhookSecrets) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
      break;
    } catch (err) {
      lastVerifyErr = err;
    }
  }

  if (!event) {
    console.warn("[api/stripe/webhook] Invalid signature:", lastVerifyErr);
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === "paid" && session.id) {
          await fulfillPaidCollectionPurchase({
            checkoutSessionId: session.id,
          });
        }
        break;
      }
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.id) {
          await fulfillPaidCollectionPurchase({
            checkoutSessionId: session.id,
          });
        }
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.id) {
          await releasePendingCollectionPurchase({
            checkoutSessionId: session.id,
          });
        }
        break;
      }
      case "account.updated": {
        const acct = event.data.object as Stripe.Account;
        if (acct.id) {
          await syncCreatorPayoutStatusByStripeAccountId(acct.id);
        }
        break;
      }
      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[api/stripe/webhook] Handler error on ${event.type}:`, err);
    return NextResponse.json(
      { error: "Webhook handler failed." },
      { status: 500 }
    );
  }
}
