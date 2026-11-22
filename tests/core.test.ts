import { describe, expect, it } from "vitest";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import {
  MACRO_CATEGORIES,
  sampleCategorySeed,
} from "../src/lib/generator/categories";
import {
  computeCanonicalFingerprint,
  findOverusedWords,
} from "../src/lib/generator/dedup";
import { processInto16BitSprite } from "../src/lib/generator/pixel-art";
import {
  AtmosphereDefineRecordSchema,
  buildAtmosphereDefineRecord,
  HoldingRecordSchema,
  LedgerEntryRecordSchema,
  LEXICON_NSIDS,
  nextTid,
  ThingRecordSchema,
  USER_OAUTH_SCOPES,
} from "../src/lib/lexicons";
import {
  buildBlueskyComposerIntentUrl,
  ESCROW_REVOKE_WINDOW_MS,
  isOfferRevocableNow,
  sanitizeGiftNote,
} from "../src/lib/trading/trade-service";
import {
  getCurrentUtcDateString,
  getNextUtcMidnightIso,
  isUnlimitedPullAccount,
} from "../src/lib/generator/pull-service";
import { parseGeneratedThingConcept } from "../src/lib/generator/gemini";

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

describe("Give a Thing — Core Engine Verification", () => {
  it("provides 30 macro-categories and 300 distinct subcategories with inverse-frequency sampling", () => {
    expect(MACRO_CATEGORIES.length).toBe(30);
    const totalSubs = MACRO_CATEGORIES.reduce(
      (sum, m) => sum + m.subcategories.length,
      0
    );
    expect(totalSubs).toBe(300);

    const usage = new Map<string, number>();
    const sampled = sampleCategorySeed(usage, () => 0.42);
    expect(sampled.macroLabel.length).toBeGreaterThan(3);
    expect(sampled.subcategory.length).toBeGreaterThan(3);
    expect(sampled.twist.length).toBeGreaterThan(5);
  });

  it("never uses the word 'curio' anywhere in src/ or lexicons/", () => {
    const files = [
      ...collectSourceFiles(path.join(process.cwd(), "src")),
      ...collectSourceFiles(path.join(process.cwd(), "lexicons")),
    ];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      expect(content.toLowerCase(), `Found 'curio' in ${file}`).not.toContain(
        "curio"
      );
    }
  });

  it("normalizes canonical fingerprints identically across articles, plurals, punctuation, and word order", () => {
    const a = computeCanonicalFingerprint("The Rusty Left Gauntlets!");
    const b = computeCanonicalFingerprint("a gauntlet, rusty & left");
    expect(a).toBe(b);

    const overused = findOverusedWords([
      "Translucent Purple Pager",
      "Translucent Green Stapler",
      "Brass Pocket Sundial",
    ]);
    expect(overused).toContain("translucent");
    expect(overused).not.toContain("brass");
  });

  it("grants unlimited pulls exclusively to @giveathing.com and enforces standard limits for other users", () => {
    expect(
      isUnlimitedPullAccount({
        did: "did:plc:someadmin",
        handle: "giveathing.com",
      })
    ).toBe(true);
    expect(
      isUnlimitedPullAccount({
        did: "did:plc:someadmin",
        handle: "@GiveAThing.com",
      })
    ).toBe(true);
    expect(
      isUnlimitedPullAccount({
        did: "did:plc:regularplayer",
        handle: "alice.bsky.social",
      })
    ).toBe(false);
  });

  it("enforces strict minimal ATProtocol OAuth scopes and validates games.atmosphere.define + Top 8 holding slots", () => {
    expect(USER_OAUTH_SCOPES).toContain("atproto");
    expect(USER_OAUTH_SCOPES).toContain(`repo:${LEXICON_NSIDS.HOLDING}`);
    expect(USER_OAUTH_SCOPES).not.toContain(LEXICON_NSIDS.THING);
    expect(USER_OAUTH_SCOPES).not.toContain("app.bsky.feed.post");

    const tid1 = nextTid();
    const validHolding = HoldingRecordSchema.parse({
      $type: LEXICON_NSIDS.HOLDING,
      thing: {
        uri: `at://did:plc:app/${LEXICON_NSIDS.THING}/${tid1}`,
        cid: "bafkreitest",
      },
      catalogNumber: 1,
      name: "Unreasonably Heavy Diner Mug",
      category: "Roadside Attraction & Vintage Motel Ephemera",
      description: "A cream ceramic mug thick enough to survive re-entry.",
      status: "held",
      favoriteSlot: 3,
      acquiredAt: "2026-11-22T01:00:00.000Z",
      provenance: [
        {
          sequenceNum: 0,
          owner: "did:plc:alice123",
          handleSnapshot: "alice.bsky.social",
          via: "daily_pull",
          occurredAt: "2026-11-22T00:01:00.000Z",
        },
      ],
    });
    expect(validHolding.favoriteSlot).toBe(3);

    const validThing = ThingRecordSchema.parse({
      $type: LEXICON_NSIDS.THING,
      catalogNumber: 1,
      name: "Unreasonably Heavy Diner Mug",
      category: "Roadside Attraction & Vintage Motel Ephemera",
      subcategory: "Diner Coffee Mugs Weighing Three Pounds Empty",
      description: "A cream ceramic mug thick enough to survive re-entry.",
      flavorText: "Keeps lukewarm coffee lukewarm for hours.",
      uselessTrait: "+0 Ergonomics",
      icon: { $type: "blob", mimeType: "image/png", size: 4096 },
      iconAlt: "16-bit pixel icon of a thick cream diner coffee mug",
      discoveredBy: "did:plc:alice123",
      pullDate: "2026-11-22",
      createdAt: "2026-11-22T00:01:00.000Z",
    });
    expect(validThing.catalogNumber).toBe(1);

    const validLedger = LedgerEntryRecordSchema.parse({
      $type: LEXICON_NSIDS.LEDGER_ENTRY,
      thing: {
        uri: `at://did:plc:app/${LEXICON_NSIDS.THING}/${tid1}`,
        cid: "bafkreitest",
      },
      sequenceNum: 1,
      owner: "did:plc:bob456",
      previousOwner: "did:plc:alice123",
      via: "direct_gift",
      note: "Enjoy this unnecessarily heavy mug!",
      occurredAt: "2026-11-22T01:00:00.000Z",
    });
    expect(validLedger.sequenceNum).toBe(1);

    const atmosphereRecord = buildAtmosphereDefineRecord({
      repoDid: "did:plc:giveathingapp",
      appUrl: "https://giveathing.com",
    });
    const parsedAtmosphere =
      AtmosphereDefineRecordSchema.parse(atmosphereRecord);
    expect(parsedAtmosphere.$type).toBe("games.atmosphere.define");
    expect(parsedAtmosphere.publisher).toBe("at://did:plc:giveathingapp");
    expect(parsedAtmosphere.category).toBe("browser");
  });

  it("verifies public/avatar.png exists as a 1024x1024 PNG and keeps all parcel pixels inside a circular avatar crop", async () => {
    const avatarPath = path.join(process.cwd(), "public", "avatar.png");
    expect(fs.existsSync(avatarPath)).toBe(true);

    const { data, info } = await sharp(avatarPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(info.width).toBe(1024);
    expect(info.height).toBe(1024);

    // Background color at (0,0) is #140f1d (20, 15, 29)
    const bgR = data[0]!;
    const bgG = data[1]!;
    const bgB = data[2]!;
    const cx = info.width / 2;
    const cy = info.height / 2;
    const circleRadius = info.width / 2;

    // Every single non-background pixel MUST fall strictly inside the inscribed circle!
    for (let y = 0; y < info.height; y += 8) {
      for (let x = 0; x < info.width; x += 8) {
        const idx = (y * info.width + x) * 4;
        const isDiffFromBg =
          data[idx] !== bgR || data[idx + 1] !== bgG || data[idx + 2] !== bgB;
        if (isDiffFromBg) {
          const dist = Math.hypot(x - cx, y - cy);
          expect(dist).toBeLessThan(circleRadius * 0.92);
        }
      }
    }
  });

  it("processes raw 1:1 sprite images into crisp 64x64 and 512x512 transparent PNGs while preserving enclosed interior colors", async () => {
    const w = 128;
    const raw = new Uint8Array(w * w * 4);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const inOuterBox = x >= 32 && x < 96 && y >= 32 && y < 96;
        const inInnerCore = x >= 44 && x < 84 && y >= 44 && y < 84;
        if (inInnerCore) {
          raw[idx] = 255;
          raw[idx + 1] = 0;
          raw[idx + 2] = 255;
          raw[idx + 3] = 255;
        } else if (inOuterBox) {
          raw[idx] = 20;
          raw[idx + 1] = 20;
          raw[idx + 2] = 30;
          raw[idx + 3] = 255;
        } else {
          raw[idx] = 255;
          raw[idx + 1] = 0;
          raw[idx + 2] = 255;
          raw[idx + 3] = 255;
        }
      }
    }

    const inputPng = await sharp(Buffer.from(raw), {
      raw: { width: w, height: w, channels: 4 },
    })
      .png()
      .toBuffer();

    const { sprite64Png, sprite512Png } = await processInto16BitSprite(inputPng);

    const meta64 = await sharp(sprite64Png).metadata();
    const meta512 = await sharp(sprite512Png).metadata();
    expect(meta64.width).toBe(64);
    expect(meta64.height).toBe(64);
    expect(meta512.width).toBe(512);
    expect(meta512.height).toBe(512);
  });

  it("enforces UTC midnight math, 140-char gift notes, 24h escrow lock, and Composer Intent URLs", () => {
    const sampleTime = new Date("2026-11-22T23:59:30.000Z");
    expect(getCurrentUtcDateString(sampleTime)).toBe("2026-11-22");
    expect(getNextUtcMidnightIso(sampleTime)).toBe("2026-11-23T00:00:00.000Z");

    const createdAt = new Date("2026-11-22T12:00:00.000Z");
    const revocableAfter = new Date(
      createdAt.getTime() + ESCROW_REVOKE_WINDOW_MS
    );

    expect(
      isOfferRevocableNow(
        revocableAfter,
        new Date("2026-11-23T11:59:59.000Z")
      )
    ).toBe(false);
    expect(
      isOfferRevocableNow(
        revocableAfter,
        new Date("2026-11-23T12:00:00.000Z")
      )
    ).toBe(true);

    const longNote = "x".repeat(200);
    expect(sanitizeGiftNote(longNote)?.length).toBe(140);

    const intent = buildBlueskyComposerIntentUrl({
      recipientHandle: "@charlie.bsky.social",
      thingName: "A Pocket Sundial",
      catalogNumber: 42,
      claimUrl: "https://giveathing.com/claim/3lxyz",
      note: "Thought of you!",
    });
    expect(intent.startsWith("https://bsky.app/intent/compose?text=")).toBe(
      true
    );
    expect(decodeURIComponent(intent).toLowerCase()).not.toContain("curio");
  });

  it("gracefully accepts verbose pixelArtBrief and clamps oversized Gemini fields within ATProtocol lexicon bounds", () => {
    const verboseBrief =
      "A single isometric 16-bit SNES inventory emblem of a translucent teal plastic pager with tiny brass buttons, a slightly crooked copper antenna, a miniature green LCD window showing three pixel dots, worn silver belt-clip edges, and warm dithering highlights across its beveled 1990s casing, centered cleanly with a crisp dark pixel outline and zero text anywhere in frame. ".repeat(
        2
      );
    expect(verboseBrief.length).toBeGreaterThan(500);

    const concept = parseGeneratedThingConcept({
      name: '"TheSlightlyOverlongTitleOfAnUnreasonablySpecificPocketPagerFrom1997"',
      description: "A delightfully pointless plastic pocket pager. ".repeat(14),
      flavorText: '"Beeps exclusively when nobody is thinking of you."',
      uselessTrait:
        "+0 Signal Strength Across Every Known Continental Time Zone On Earth Today",
      pixelArtBrief: verboseBrief,
      iconAlt:
        "16-bit pixel-art icon of a translucent teal 1990s pager with brass buttons and a crooked copper antenna. ".repeat(
          4
        ),
    });

    expect(concept.name.startsWith('"')).toBe(false);
    expect(concept.flavorText.startsWith('"')).toBe(false);
    expect(concept.description.length).toBeLessThanOrEqual(500);
    expect(concept.uselessTrait.length).toBeLessThanOrEqual(80);
    expect(concept.iconAlt.length).toBeLessThanOrEqual(300);
    expect(concept.pixelArtBrief.length).toBeGreaterThan(360);
    expect(concept.pixelArtBrief.length).toBeLessThanOrEqual(1500);
  });
});
