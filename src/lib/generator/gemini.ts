import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { SampledCategorySeed } from "./categories";
import type { CollisionMatch } from "./dedup";

const globalForGenAI = globalThis as unknown as {
  genaiClient?: GoogleGenAI;
};

function getGenAI(): GoogleGenAI {
  if (globalForGenAI.genaiClient) {
    return globalForGenAI.genaiClient;
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured.");
  }
  globalForGenAI.genaiClient = new GoogleGenAI({ apiKey });
  return globalForGenAI.genaiClient;
}

export const GeneratedThingSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().min(10).max(500),
  flavorText: z.string().min(3).max(280),
  uselessTrait: z.string().min(2).max(80),
  pixelArtBrief: z.string().min(10).max(1500),
  iconAlt: z.string().min(5).max(300),
});

export type GeneratedThingConcept = z.infer<typeof GeneratedThingSchema>;

const RawGeneratedThingSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(5),
  flavorText: z.string().min(2),
  uselessTrait: z.string().min(2),
  pixelArtBrief: z.string().min(5),
  iconAlt: z.string().min(3),
});

function clampTextCleanly(
  input: string,
  maxCodePoints: number,
  maxUtf8Bytes?: number,
  stripOuterQuotes = false
): string {
  let text = input.replace(/\s+/g, " ").trim();
  if (stripOuterQuotes) {
    text = text.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  }

  const chars = Array.from(text);
  if (chars.length > maxCodePoints) {
    const sliced = chars.slice(0, maxCodePoints - 1).join("");
    const lastSpace = sliced.lastIndexOf(" ");
    const base =
      lastSpace > Math.floor(maxCodePoints * 0.65)
        ? sliced.slice(0, lastSpace).replace(/[,;:\-\s]+$/, "")
        : sliced.trimEnd();
    text = `${base}…`;
  }

  if (maxUtf8Bytes) {
    while (Buffer.byteLength(text, "utf8") > maxUtf8Bytes && text.length > 2) {
      const shortened = Array.from(text.replace(/…$/, ""));
      shortened.pop();
      text = `${shortened.join("").trimEnd()}…`;
    }
  }

  return text;
}

export function parseGeneratedThingConcept(raw: unknown): GeneratedThingConcept {
  const initial = RawGeneratedThingSchema.parse(raw);
  return GeneratedThingSchema.parse({
    name: clampTextCleanly(initial.name, 116, 236, true),
    description: clampTextCleanly(initial.description, 490, 1180),
    flavorText: clampTextCleanly(initial.flavorText, 275, 590, true),
    uselessTrait: clampTextCleanly(initial.uselessTrait, 78, 156),
    pixelArtBrief: clampTextCleanly(initial.pixelArtBrief, 1400),
    iconAlt: clampTextCleanly(initial.iconAlt, 295, 590),
  });
}

const THING_JSON_SCHEMA = {
  type: "object",
  properties: {
    name: {
      type: "string",
      description:
        "A vividly specific, memorable, slightly absurd thing title (4 to 11 words, under 100 characters, Title Case, no surrounding quotes).",
    },
    description: {
      type: "string",
      description:
        "2-3 crisp sentences (under 420 characters) written like a cozy 16-bit RPG item inspection box (think EarthBound or Chrono Trigger) describing its physical appearance, odd history, and utter lack of practical utility.",
    },
    flavorText: {
      type: "string",
      description:
        "A short, dryly funny italicized note or quote at the bottom of the thing card (1 sentence, under 200 characters, no surrounding quotation marks needed).",
    },
    uselessTrait: {
      type: "string",
      description:
        "A completely pointless RPG stat or property under 70 characters, e.g. '+0 Defense Against Drizzle', 'Weight: 1.4 Regrets', 'Durability: Suspiciously Sticky'.",
    },
    pixelArtBrief: {
      type: "string",
      description:
        "Concrete visual description (2-4 sentences, under 650 characters) of a single physical emblem representing this thing for a 16-bit SNES inventory icon (translate abstract concepts into an unmistakable tangible vessel or emblem; describe colors, silhouette, and key visual details, no text).",
    },
    iconAlt: {
      type: "string",
      description:
        "Concise accessible alt text (1 sentence, under 240 characters) describing the 16-bit pixel-art icon for screen readers.",
    },
  },
  required: [
    "name",
    "description",
    "flavorText",
    "uselessTrait",
    "pixelArtBrief",
    "iconAlt",
  ],
};

const SYSTEM_INSTRUCTION = `You are the Grand Thing Archivist for "Give a Thing", an eccentric social trading game where players pull one completely pointless, utterly unique thing per day and trade things with friends for no reason at all.

Rules of the Thing Vault:
1. Every thing has ZERO monetary value, ZERO combat power, and ZERO practical utility—yet feels wonderfully specific, tactile, funny, and strangely delightful to own or give to a friend.
2. Never invent generic RPG clichés ("Rusty Iron Sword", "Glowing Blue Orb", "Mysterious Amulet") or repetitive adjectives. Anchor each thing in hyper-specific, memorable details.
3. Always refer to objects simply as "things"—never use antique-shop jargon in the prose.
4. Keep names punchy (4–11 words) so they shine inside a 16-bit RPG inventory slot.
5. If the category is an Abstract Thought or Sensation, house or symbolize it in a charmingly concrete physical vessel or visual emblem in \`pixelArtBrief\` so it renders clearly as a 64x64 16-bit sprite without any text.`;

export interface ConceptGenerationTurn {
  concept: GeneratedThingConcept;
  interactionId: string;
}

export async function generateThingConceptWithCarbon(params: {
  seed: SampledCategorySeed;
  existingInSubcategory: string[];
  overusedWords: string[];
  previousInteractionId?: string;
  collision?: CollisionMatch;
}): Promise<ConceptGenerationTurn> {
  const ai = getGenAI();

  let prompt: string;
  if (params.previousInteractionId && params.collision) {
    prompt = `COLLISION ALERT: Your previous idea collided with existing Catalog #${params.collision.catalogNumber} ("${params.collision.name}" in ${params.collision.category}, similarity ${(params.collision.similarity * 100).toFixed(1)}%).
Invent a COMPLETELY DIFFERENT thing within "${params.seed.macroLabel} -> ${params.seed.subcategory}" using a totally different silhouette, noun, material, and comedic angle. Return valid JSON matching the schema.`;
  } else {
    const forbiddenBlock =
      params.existingInSubcategory.length > 0
        ? `\nExisting things already discovered in or near this aisle (NEVER repeat or paraphrase any of these):\n- ${params.existingInSubcategory.slice(0, 50).join("\n- ")}`
        : "";
    const overusedBlock =
      params.overusedWords.length > 0
        ? `\nRecently overused words across the catalog (AVOID using these words in the name): ${params.overusedWords.join(", ")}`
        : "";

    prompt = `Conjure a brand-new, never-before-seen pointless thing for today's daily pull!

Macro-Category: ${params.seed.macroLabel}
Subcategory Aisle: ${params.seed.subcategory}
Optional Creative Spark (use loosely or riff on it if fitting): ${params.seed.twist}${forbiddenBlock}${overusedBlock}

Return JSON strictly matching the schema.`;
  }

  const interaction = await ai.interactions.create({
    model: "gemini-4-carbon",
    system_instruction: SYSTEM_INSTRUCTION,
    input: prompt,
    ...(params.previousInteractionId
      ? { previous_interaction_id: params.previousInteractionId }
      : {}),
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: THING_JSON_SCHEMA,
    },
  });

  const rawJson = interaction.output_text;
  if (!rawJson) {
    throw new Error(
      "Could not select a thing right now—please try again in a moment."
    );
  }

  const cleanedJson = rawJson
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = parseGeneratedThingConcept(JSON.parse(cleanedJson));
  return {
    concept: parsed,
    interactionId: interaction.id ?? "",
  };
}

/**
 * Generates a 768-dimensional normalized vector embedding using `gemini-embedding-2`
 * for both full-catalog semantic deduplication and semantic catalog vibe search.
 */
export async function embedThingText(text: string): Promise<number[]> {
  const ai = getGenAI();
  const res = await ai.models.embedContent({
    model: "gemini-embedding-2",
    contents: `task: sentence similarity | query: ${text}`,
    config: {
      outputDimensionality: 768,
    },
  });

  const values = res.embeddings?.[0]?.values;
  if (!values || values.length !== 768) {
    throw new Error(
      `Expected 768-d embedding from gemini-embedding-2, got ${values?.length ?? 0}.`
    );
  }
  return values;
}

/**
 * Generates a 1:1 16-bit SNES/GBA RPG inventory sprite using `gemini-nano-banana-2.1`.
 */
export async function generate16BitSpritePng(
  concept: GeneratedThingConcept
): Promise<Buffer> {
  const ai = getGenAI();

  const spritePrompt = `16-bit SNES / Game Boy Advance RPG video game inventory icon sprite of: ${concept.pixelArtBrief}.
Style rules:
- Authentic 16-bit pixel art sprite, chunky visible pixels, limited 32-color retro palette, crisp dark pixel outline around the silhouette.
- Single centered object occupying ~75% of the square frame, 3/4 isometric RPG item angle.
- Solid, completely flat, uniform bright magenta (#FF00FF) background with zero gradients, zero shadows on the floor, zero UI frame, zero border box, and strictly ZERO text or letters.`;

  const interaction = await ai.interactions.create({
    model: "gemini-nano-banana-2.1",
    input: spritePrompt,
    response_format: {
      type: "image",
      aspect_ratio: "1:1",
      image_size: "1K",
    },
  });

  const img = interaction.output_image;
  if (!img?.data) {
    throw new Error("gemini-nano-banana-2.1 did not return image data.");
  }

  return Buffer.from(img.data, "base64");
}

const CUSTOM_SPRITE_BRIEF_SCHEMA = {
  type: "object",
  properties: {
    pixelArtBrief: {
      type: "string",
      description:
        "Concrete visual description (2-4 sentences, under 650 characters) of a single physical emblem representing this custom thing for a 16-bit SNES inventory icon (describe colors, silhouette, and key visual details, zero text).",
    },
    suggestedIconAlt: {
      type: "string",
      description:
        "Concise accessible alt text (1 sentence, under 240 characters) describing the 16-bit pixel-art icon for screen readers.",
    },
  },
  required: ["pixelArtBrief", "suggestedIconAlt"],
};

/**
 * Generates a standard-style 16-bit Give a Thing sprite from a creator's custom
 * `.thing` fields (`name`, `category`/collection, `subcategory`, `description`,
 * `flavorText`, and `uselessTrait`).
 */
export async function generateCustomThingRawSpriteFromFields(params: {
  name: string;
  category: string;
  subcategory: string;
  description: string;
  flavorText: string;
  uselessTrait?: string;
}): Promise<{ rawPng: Buffer; suggestedIconAlt: string }> {
  const ai = getGenAI();

  const briefPrompt = `Convert this creator-authored pointless thing into a concrete 16-bit SNES RPG inventory icon visual brief and accessible alt text:

Name: ${params.name}
Collection (Category): ${params.category}
Subcategory: ${params.subcategory}
Description: ${params.description}
Flavor Quote: ${params.flavorText}
Pointless Trait: ${params.uselessTrait || "None"}

Translate any abstract details into a charming, unmistakable physical object or emblem with clear colors and silhouette, and zero text or letters anywhere in the icon.`;

  const briefTurn = await ai.interactions.create({
    model: "gemini-4-carbon",
    system_instruction: SYSTEM_INSTRUCTION,
    input: briefPrompt,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: CUSTOM_SPRITE_BRIEF_SCHEMA,
    },
  });

  const rawJson = (briefTurn.output_text ?? "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let pixelArtBrief = `${params.name} (${params.subcategory}): ${params.description}`;
  let suggestedIconAlt = `A 16-bit pixel-art icon of ${params.name}.`;

  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as {
        pixelArtBrief?: string;
        suggestedIconAlt?: string;
      };
      if (parsed.pixelArtBrief?.trim()) {
        pixelArtBrief = clampTextCleanly(parsed.pixelArtBrief, 1200);
      }
      if (parsed.suggestedIconAlt?.trim()) {
        suggestedIconAlt = clampTextCleanly(parsed.suggestedIconAlt, 290, 580);
      }
    } catch {
      // Fallback to direct field prompt if JSON parse ever fails
    }
  }

  const rawPng = await generate16BitSpritePng({
    name: clampTextCleanly(params.name, 116, 236, true),
    description: clampTextCleanly(params.description, 490, 1180),
    flavorText: clampTextCleanly(params.flavorText, 275, 590, true),
    uselessTrait: clampTextCleanly(params.uselessTrait || "+0 Utility", 78, 156),
    pixelArtBrief,
    iconAlt: suggestedIconAlt,
  });

  return { rawPng, suggestedIconAlt };
}
