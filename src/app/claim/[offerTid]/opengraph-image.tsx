import { ImageResponse } from "next/og";
import sharp from "sharp";
import { getEscrowOfferPageData } from "@/lib/queries";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ClaimOpenGraphImage({
  params,
}: {
  params: Promise<{ offerTid: string }>;
}) {
  const { offerTid } = await params;

  let offer: Awaited<ReturnType<typeof getEscrowOfferPageData>> = null;
  try {
    offer = await getEscrowOfferPageData(offerTid);
  } catch {
    offer = null;
  }

  let spriteDataUri: string | null = null;
  if (offer?.thing.spritePngBase64) {
    const raw64 = Buffer.from(offer.thing.spritePngBase64, "base64");
    const upscaled = await sharp(raw64)
      .resize(280, 280, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    spriteDataUri = `data:image/png;base64,${upscaled.toString("base64")}`;
  }

  const title = offer ? offer.thing.name : "A Mystery Pointless Thing";
  const catalogTag = offer
    ? `CATALOG #${String(offer.thing.catalogNumber).padStart(4, "0")} • ${offer.thing.category}`
    : "GIVE A THING • GIVEATHING.COM";
  const subtitle = offer
    ? `@${offer.sender.handle} set this thing aside for @${offer.recipientHandle}!`
    : "Sign in with Bluesky to claim your pointless 16-bit thing!";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#140f1d",
          padding: "44px",
          fontFamily: "sans-serif",
          color: "#fbf4e4",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            gap: "44px",
            backgroundColor: "#281f3b",
            border: "6px solid #e5b54f",
            padding: "44px",
          }}
        >
          {/* Recessed 16-Bit Inventory Pedestal */}
          <div
            style={{
              width: "330px",
              height: "330px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#110c19",
              border: "4px solid #8c6826",
              flexShrink: 0,
            }}
          >
            {spriteDataUri ? (
              <img
                src={spriteDataUri}
                width={280}
                height={280}
                alt=""
                style={{ imageRendering: "pixelated" }}
              />
            ) : (
              <div
                style={{
                  fontSize: "92px",
                  color: "#f5c451",
                  display: "flex",
                }}
              >
                ?
              </div>
            )}
          </div>

          {/* Text & Invite Details */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              flex: 1,
              gap: "16px",
            }}
          >
            <div
              style={{
                fontSize: "22px",
                fontWeight: 700,
                color: "#f5c451",
                letterSpacing: "0.06em",
              }}
            >
              {catalogTag}
            </div>

            <div
              style={{
                fontSize: "46px",
                fontWeight: 800,
                lineHeight: 1.15,
                color: "#fbf4e4",
              }}
            >
              {title}
            </div>

            <div
              style={{
                fontSize: "26px",
                color: "#5cc8ff",
                fontWeight: 600,
              }}
            >
              {subtitle}
            </div>

            {offer?.note && (
              <div
                style={{
                  fontSize: "22px",
                  fontStyle: "italic",
                  color: "#bfb2d6",
                  backgroundColor: "#140f1d",
                  padding: "14px 20px",
                  borderLeft: "5px solid #e5b54f",
                }}
              >
                &ldquo;{offer.note}&rdquo;
              </div>
            )}

            <div
              style={{
                marginTop: "8px",
                fontSize: "20px",
                fontWeight: 700,
                color: "#4be3a0",
              }}
            >
              giveathing.com • Claim with Bluesky before 24h!
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
