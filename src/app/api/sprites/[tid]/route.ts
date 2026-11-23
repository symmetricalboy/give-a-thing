import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { getDb, schema } from "@/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tid: string }> }
) {
  const { tid } = await params;
  const sizeParam = req.nextUrl.searchParams.get("size");
  const targetSize = sizeParam === "64" ? 64 : 512;

  const db = getDb();
  const rows = await db
    .select({ spritePngBase64: schema.things.spritePngBase64 })
    .from(schema.things)
    .where(eq(schema.things.thingTid, tid))
    .limit(1);

  const base64 = rows[0]?.spritePngBase64;
  if (!base64) {
    return new NextResponse("Sprite not found", { status: 404 });
  }

  const storedBuf = Buffer.from(base64, "base64");
  const meta = await sharp(storedBuf).metadata();

  let outBuf: Buffer;
  if (meta.width === 512 && meta.height === 512) {
    // Custom 512x512 creator PNG upload — preserve full artwork fidelity at 512x512
    outBuf =
      targetSize === 512
        ? storedBuf
        : await sharp(storedBuf)
            .resize(64, 64, { fit: "contain" })
            .png({ compressionLevel: 9 })
            .toBuffer();
  } else {
    // Canonical 64x64 16-bit pixel sprite — upscale crisply with nearest-neighbor
    outBuf =
      targetSize === 64
        ? storedBuf
        : await sharp(storedBuf)
            .resize(512, 512, { kernel: sharp.kernel.nearest })
            .png({ compressionLevel: 9, palette: true, colors: 48 })
            .toBuffer();
  }

  return new NextResponse(new Uint8Array(outBuf), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
