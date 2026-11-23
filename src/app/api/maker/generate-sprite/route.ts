import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { generateCustomThingRawSpriteFromFields } from "@/lib/generator/gemini";
import { processInto16BitSprite } from "@/lib/generator/pixel-art";
import { isUnlimitedPullAccount } from "@/lib/generator/pull-service";
import { getCurrentSession } from "@/lib/session";

const GenerateSpriteBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter a name for this thing before generating its icon.")
    .max(120, "Name must be 120 characters or fewer."),
  category: z
    .string()
    .trim()
    .min(2, "Enter a collection name first.")
    .max(100, "Collection name must be 100 characters or fewer."),
  subcategory: z
    .string()
    .trim()
    .min(2, "Enter a subcategory first.")
    .max(120, "Subcategory must be 120 characters or fewer."),
  description: z
    .string()
    .trim()
    .min(10, "Write at least 10 characters of description so we know what to draw!")
    .max(500, "Description must be 500 characters or fewer."),
  flavorText: z
    .string()
    .trim()
    .min(3, "Write a short flavor quote first.")
    .max(280, "Flavor text must be 280 characters or fewer."),
  uselessTrait: z
    .string()
    .trim()
    .max(80, "Pointless trait must be 80 characters or fewer.")
    .optional(),
});

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  if (!isUnlimitedPullAccount(session)) {
    return NextResponse.json(
      { error: "Make New Things studio is currently restricted to @giveathing.com." },
      { status: 403 }
    );
  }

  if (!process.env.GEMINI_API_KEY?.trim()) {
    return NextResponse.json(
      {
        error:
          "Sprite generation is not configured on this server. Please upload a 512x512 PNG instead.",
      },
      { status: 503 }
    );
  }

  try {
    const rawBody = await req.json();
    const parsed = GenerateSpriteBodySchema.parse(rawBody);

    const { rawPng, suggestedIconAlt } =
      await generateCustomThingRawSpriteFromFields(parsed);
    const { sprite512Png } = await processInto16BitSprite(rawPng);

    return NextResponse.json({
      spriteDataUrl: `data:image/png;base64,${sprite512Png.toString("base64")}`,
      suggestedIconAlt,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0]?.message ?? "Invalid thing fields." },
        { status: 400 }
      );
    }
    console.error("[api/maker/generate-sprite POST] Error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Could not generate a sprite right now. Please try again!",
      },
      { status: 500 }
    );
  }
}
