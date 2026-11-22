import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Sparkles } from "lucide-react";
import { getCurrentSession } from "@/lib/session";
import { getEscrowOfferPageData } from "@/lib/queries";
import { ClaimOfferClient } from "@/components/ClaimOfferClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ offerTid: string }>;
}): Promise<Metadata> {
  const { offerTid } = await params;
  try {
    const offer = await getEscrowOfferPageData(offerTid);
    if (!offer) return { title: "Gift Offer Not Found" };
    return {
      title: `A Thing for @${offer.recipientHandle}: ${offer.thing.name}`,
      description: `@${offer.sender.handle} set aside Catalog #${String(
        offer.thing.catalogNumber
      ).padStart(4, "0")} (${offer.thing.name}) for @${
        offer.recipientHandle
      } on Give a Thing!`,
      openGraph: {
        title: `@${offer.sender.handle} gave @${offer.recipientHandle} a Thing!`,
        description: `#${String(offer.thing.catalogNumber).padStart(4, "0")} ${
          offer.thing.name
        } — ${offer.thing.description}`,
      },
      twitter: {
        card: "summary_large_image",
      },
    };
  } catch {
    return { title: "Claim Your Thing" };
  }
}

export default async function ClaimOfferPage({
  params,
}: {
  params: Promise<{ offerTid: string }>;
}) {
  const { offerTid } = await params;
  const session = await getCurrentSession();

  let offer: Awaited<ReturnType<typeof getEscrowOfferPageData>> = null;
  try {
    offer = await getEscrowOfferPageData(offerTid);
  } catch {
    notFound();
  }

  if (!offer) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="rpg-panel p-6 sm:p-8 space-y-6 text-center">
        <div className="inline-flex items-center gap-2 rounded bg-[#5cc8ff]/15 px-3 py-1 font-pixel text-[11px] text-[#5cc8ff] border border-[#5cc8ff]/40">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          SET-ASIDE PARCEL FOR @{offer.recipientHandle}
        </div>

        <div className="rpg-slot mx-auto flex h-40 w-40 items-center justify-center p-4">
          <img
            src={offer.thing.iconUrl}
            alt={offer.thing.iconAlt}
            width={128}
            height={128}
            className="pixel-art h-32 w-32 object-contain"
          />
        </div>

        <div className="space-y-2">
          <p className="font-pixel text-xs text-[#e5b54f]">
            CATALOG #{String(offer.thing.catalogNumber).padStart(4, "0")} &bull;{" "}
            {offer.thing.category}
          </p>
          <h1 className="font-pixel text-lg sm:text-xl text-[#fbf4e4]">
            {offer.thing.name}
          </h1>
          <p className="text-sm leading-relaxed text-[#bfb2d6]">
            {offer.thing.description}
          </p>
        </div>

        <div className="rounded border border-[#8c6826]/50 bg-[#140f1d] p-4 space-y-2">
          <p className="text-xs text-[#bfb2d6]">
            Set aside by{" "}
            <Link
              href={`/u/${encodeURIComponent(offer.sender.handle)}`}
              className="font-semibold text-[#f5c451] hover:underline"
            >
              @{offer.sender.handle}
            </Link>
          </p>
          {offer.note && (
            <blockquote className="text-sm italic text-[#fbf4e4]">
              &ldquo;{offer.note}&rdquo;
            </blockquote>
          )}
        </div>

        <ClaimOfferClient
          offerTid={offer.offerTid}
          status={offer.status}
          recipientDid={offer.recipientDid}
          recipientHandle={offer.recipientHandle}
          thingTid={offer.thing.thingTid}
          viewerDid={session?.did ?? null}
          viewerHandle={session?.handle ?? null}
        />
      </section>
    </div>
  );
}
