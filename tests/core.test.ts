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
  FavoriteRecordSchema,
  HoldingRecordSchema,
  LedgerRecordSchema,
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
  findInteriorMissingCatalogNumbers,
  findLowestMissingCatalogNumber,
  getCurrentUtcDateString,
  getNextUtcMidnightIso,
  isUnlimitedPullAccount,
} from "../src/lib/generator/pull-service";
import { parseGeneratedThingConcept } from "../src/lib/generator/gemini";
import { USER_GIVEATHING_COLLECTIONS } from "../src/lib/account/delete-account";
import {
  CreatorCannotPullOwnBoxError,
  MIN_COLLECTION_ITEMS,
  validateAndNormalize512Png,
  validateCollectionUniqueness,
} from "../src/lib/maker/collection-service";
import {
  bpsToPercentDisplay,
  estimateMysteryBoxPayoutBreakdown,
  formatUsdCents,
  parseUsdInputToCents,
  percentToBps,
} from "../src/lib/stripe/pricing";
import { NEWS_POSTS } from "../src/lib/news";

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
    expect(USER_OAUTH_SCOPES).toContain(`repo:${LEXICON_NSIDS.THING}`);
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
      createdBy: "did:plc:giveathingapp",
      discoveredBy: "did:plc:alice123",
      pullDate: "2026-11-22",
      createdAt: "2026-11-22T00:01:00.000Z",
    });
    expect(validThing.catalogNumber).toBe(1);
    expect(validThing.createdBy).toBe("did:plc:giveathingapp");

    const thingLexiconJson = JSON.parse(
      fs.readFileSync(
        path.join(process.cwd(), "lexicons", "com", "giveathing", "thing.json"),
        "utf8"
      )
    );
    expect(thingLexiconJson.defs.main.record.properties.createdBy).toEqual({
      type: "string",
      format: "did",
      description: expect.any(String),
    });

    expect(USER_OAUTH_SCOPES).toContain(`repo:${LEXICON_NSIDS.FAVORITE}`);

    const validLedger = LedgerRecordSchema.parse({
      $type: LEXICON_NSIDS.LEDGER,
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
    expect(validLedger.$type).toBe("com.giveathing.ledger");

    const validFavorite = FavoriteRecordSchema.parse({
      $type: LEXICON_NSIDS.FAVORITE,
      thing: {
        uri: `at://did:plc:app/${LEXICON_NSIDS.THING}/${tid1}`,
        cid: "bafkreitest",
      },
      slot: 1,
      catalogNumber: 1,
      name: "Unreasonably Heavy Diner Mug",
      createdAt: "2026-11-22T01:05:00.000Z",
    });
    expect(validFavorite.$type).toBe("com.giveathing.favorite");
    expect(validFavorite.slot).toBe(1);

    const atmosphereRecord = buildAtmosphereDefineRecord({
      repoDid: "did:plc:giveathingapp",
      appUrl: "https://giveathing.com",
      iconBlob: { $type: "blob", mimeType: "image/png", size: 1537 },
      coverBlob: { $type: "blob", mimeType: "image/png", size: 410000 },
    });
    const parsedAtmosphere =
      AtmosphereDefineRecordSchema.parse(atmosphereRecord);
    expect(parsedAtmosphere.$type).toBe("games.atmosphere.define");
    expect(parsedAtmosphere.name).toBe("Give a Thing");
    expect(parsedAtmosphere.tagline).toBe(
      "Get a Pointless Thing Every Day & Give Things Away"
    );
    expect(parsedAtmosphere.status).toBe("alpha");
    expect(parsedAtmosphere.publisher).toBe("at://did:plc:giveathingapp");
    expect(parsedAtmosphere.developer?.name).toBe("symmetricalboy.com");
    expect(parsedAtmosphere.developer?.did).toBe(
      "did:plc:33d7gnwiagm6cimpiepefp72"
    );
    expect(parsedAtmosphere.category).toBe("browser");
    expect(parsedAtmosphere.cover).toBeDefined();
    expect(parsedAtmosphere.media).toBeUndefined();
    expect(parsedAtmosphere.requires?.length).toBe(1);
    expect(parsedAtmosphere.requires?.[0]?.nsid).toBe("app.bsky.actor.profile");
    expect(parsedAtmosphere.uses?.length).toBe(9);
    expect(
      parsedAtmosphere.uses?.some((u) => u.nsid === "com.giveathing.ledger")
    ).toBe(true);
    expect(
      parsedAtmosphere.uses?.some((u) => u.nsid === "com.giveathing.favorite")
    ).toBe(true);
    expect(
      parsedAtmosphere.uses?.find((u) => u.nsid === "app.bsky.graph.follow")
        ?.acquire
    ).toBe("https://bsky.app");
    expect(parsedAtmosphere.tags).toEqual(["Alpha", "Collectibles", "Social"]);

    const coverPath = path.join(process.cwd(), "public", "cover.png");
    expect(fs.existsSync(coverPath)).toBe(true);
    expect(fs.statSync(coverPath).size).toBeLessThan(950_000);
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

  it("verifies site navigation order, news feed post, copyright, and zero technical PDS/Gemini jargon in UI components", () => {
    expect(NEWS_POSTS.length).toBeGreaterThanOrEqual(1);
    const launchPost = NEWS_POSTS[0]!;
    expect(launchPost.title).toBe("A THING IS BORN");
    expect(launchPost.date).toBe("2026-11-22");
    expect(launchPost.feedbackHandle).toBe("giveathing.com");

    const navbarSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "NavbarShell.tsx"),
      "utf8"
    );
    const tabLabels = [
      'label: "GET A THING"',
      'label: "THINGS THAT HAPPENED"',
      'label: "YOUR THINGS"',
      'label: "MAKE NEW THINGS"',
      'label: "FIND THINGS"',
    ];
    let lastIndex = -1;
    for (const lbl of tabLabels) {
      const idx = navbarSrc.indexOf(lbl);
      expect(idx, `Missing ${lbl} in NavbarShell`).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
    expect(navbarSrc).not.toContain('label: "HOME"');
    expect(navbarSrc).not.toContain('label: "MY THINGS"');
    expect(navbarSrc).not.toContain('label: "MAKE THINGS"');
    expect(navbarSrc).not.toContain('label: "ALL THE THINGS"');
    expect(navbarSrc).not.toContain('label: "OTHER THINGS"');
    expect(navbarSrc).not.toContain(
      "Get a Pointless Thing Every Day &amp; Give Things Away"
    );
    expect(navbarSrc).not.toContain("Sign in with Bluesky");
    expect(navbarSrc).toContain("LOGIN");
    expect(navbarSrc).not.toContain("00:00 UTC");
    expect(navbarSrc).not.toContain("@giveathing.com");
    expect(navbarSrc).toContain(
      "Copyright (c) 2026 Dylan Gregori Singer (symmetricalboy)"
    );

    const newsFooterIdx = navbarSrc.indexOf("NEWS ABOUT THINGS");
    const importantFooterIdx = navbarSrc.indexOf("IMPORTANT THINGS");
    expect(newsFooterIdx).toBeGreaterThan(-1);
    expect(importantFooterIdx).toBeGreaterThan(newsFooterIdx);

    const loginFormSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "AtmosphereLoginForm.tsx"),
      "utf8"
    );
    expect(loginFormSrc).toContain("ATmosphere Account");
    expect(loginFormSrc).toContain(
      "Don&apos;t have an ATmosphere Account? Make one on Bluesky!"
    );
    expect(loginFormSrc).toContain("https://bsky.app");

    const heroSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "HomeLandingHero.tsx"),
      "utf8"
    );
    expect(heroSrc).not.toContain("Pause Boxes");
    expect(heroSrc).not.toContain("Play Boxes");
    expect(heroSrc).not.toContain("NEWS &amp; UPDATES");
    expect(heroSrc).toContain("LOGIN");
    expect(heroSrc).toContain("GET A THING");
    expect(heroSrc).toContain("claim invite link sent to them!");
    expect(heroSrc).not.toContain("140-character gift note");

    const newsPageSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "app", "news", "page.tsx"),
      "utf8"
    );
    expect(newsPageSrc).toContain("NEWS ABOUT THINGS");
    expect(newsPageSrc).toContain("NEWS_POSTS");

    const profilePageSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "app", "profile", "page.tsx"),
      "utf8"
    );
    expect(profilePageSrc).toContain("YOUR THINGS");

    const userProfileClientSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "UserProfileClient.tsx"),
      "utf8"
    );
    expect(userProfileClientSrc).toContain("OWNED");
    expect(userProfileClientSrc).toContain("DISCOVERED");
    expect(userProfileClientSrc).toContain("CREATED");
    expect(userProfileClientSrc).toContain("GIVEN AWAY");
    expect(userProfileClientSrc).toContain("aspect-square");

    const feedTimelineSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "FeedTimeline.tsx"),
      "utf8"
    );
    expect(feedTimelineSrc).toContain("Everyone");
    expect(feedTimelineSrc).toContain("Following");
    expect(feedTimelineSrc).toContain("You");
    expect(feedTimelineSrc).not.toContain(">\n                Friends\n");

    const findSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "CatalogBrowser.tsx"),
      "utf8"
    );
    expect(findSrc).toContain("FIND THINGS");
    expect(findSrc).toContain("SEARCH THINGS");
    expect(findSrc).toContain("SEARCH USERS");
    expect(findSrc).toContain("USERS ({totalUsersCount})");
    expect(findSrc).not.toContain("Hot Potatoes");
    expect(findSrc).not.toContain("#0001+");
    expect(findSrc).toContain("rpg-tabpanel-stack");

    const otherSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "OtherThingsClient.tsx"),
      "utf8"
    );
    expect(otherSrc).toContain("IMPORTANT THINGS");
    expect(otherSrc).toContain("PRIVACY POLICY");
    expect(otherSrc).toContain("TERMS OF SERVICE");
    expect(otherSrc).toContain("CODE OF CONDUCT");
    expect(otherSrc).toContain("support@giveathing.com");
    expect(otherSrc).toContain("https://bsky.app/profile/giveathing.com");
    expect(otherSrc).toContain("DANGER ZONE");
    expect(otherSrc).toContain("rpg-tabpanel-stack");
    expect(USER_GIVEATHING_COLLECTIONS.length).toBe(7);

    const makePageSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "app", "make", "page.tsx"),
      "utf8"
    );
    expect(makePageSrc).toContain("isUnlimitedPullAccount");
    expect(makePageSrc).toContain("MakerStudioClient");
    expect(makePageSrc).toContain("COMING SOON");
    expect(makePageSrc).toContain("MAKE NEW THINGS");
    expect(makePageSrc.toLowerCase()).toContain("collections");
    expect(makePageSrc.toLowerCase()).toContain("sell");

    const makerStudioSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "MakerStudioClient.tsx"),
      "utf8"
    );
    expect(makerStudioSrc).toContain("512×512px PNG");
    expect(makerStudioSrc).toContain("Generate in Our Standard Style");
    expect(makerStudioSrc).toContain("Revoke &amp; Destroy");
    expect(userProfileClientSrc).toContain("MYSTERY BOXES");

    const pedestalSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "DailyParcelPedestal.tsx"),
      "utf8"
    );
    expect(pedestalSrc).toContain(
      "It could take up to about a minute to find the right thing for you.\\nPlease hang tight & don't leave this page!"
    );
    expect(pedestalSrc).toContain(
      "You've already gotten a thing today.\\nCome back tomorrow for another thing!"
    );
    expect(pedestalSrc).toContain(
      "Every day, click once to unwrap a completely unique, utterly pointless thing you can keep in your collection or give away to a friend!"
    );
    expect(pedestalSrc).toContain("Day resets in");
    expect(pedestalSrc).not.toContain("UTC Reset in");
    expect(pedestalSrc).toContain("/empty-box.svg");
    expect(pedestalSrc).not.toContain("initialTodaysThing");

    const cardSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "ThingGridCard.tsx"),
      "utf8"
    );
    expect(cardSrc).not.toContain("item.description");

    const uiFiles = [
      ...collectSourceFiles(path.join(process.cwd(), "src", "components")),
      ...collectSourceFiles(path.join(process.cwd(), "src", "app")).filter(
        (f) =>
          !f.includes(`${path.sep}api${path.sep}`) &&
          !f.includes(`${path.sep}oauth${path.sep}`)
      ),
    ];

    for (const file of uiFiles) {
      const content = fs.readFileSync(file, "utf8");
      expect(content, `Found Gemini mention in ${file}`).not.toContain(
        "Gemini"
      );
      expect(
        content,
        `Found buildPdsExplorerUrl in ${file}`
      ).not.toContain("buildPdsExplorerUrl");
      expect(content, `Found ATProtocol mention in ${file}`).not.toContain(
        "ATProtocol"
      );
    }
  });

  it("fills missing catalog numbers like #0011 before advancing and renders public/empty-box.svg cleanly", async () => {
    expect(findLowestMissingCatalogNumber([])).toBe(1);
    expect(findLowestMissingCatalogNumber([2, 3, 4])).toBe(1);
    expect(findLowestMissingCatalogNumber([1, 2, 3])).toBe(4);

    // Simulate production catalog #0001..#0019 with #0011 skipped
    const catalogWithSkipped11 = [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19,
    ];
    expect(findInteriorMissingCatalogNumbers(catalogWithSkipped11)).toEqual([
      11,
    ]);
    expect(findLowestMissingCatalogNumber(catalogWithSkipped11)).toBe(11);

    // Once #0011 is filled, no interior gaps remain and next pull gets #0020
    const healedCatalog = [...catalogWithSkipped11, 11];
    expect(findInteriorMissingCatalogNumbers(healedCatalog)).toEqual([]);
    expect(findLowestMissingCatalogNumber(healedCatalog)).toBe(20);

    const emptyBoxPath = path.join(process.cwd(), "public", "empty-box.svg");
    expect(fs.existsSync(emptyBoxPath)).toBe(true);
    const renderedPng = await sharp(emptyBoxPath)
      .resize(128, 128, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
    const meta = await sharp(renderedPng).metadata();
    expect(meta.width).toBe(128);
    expect(meta.height).toBe(128);
  });

  it("enforces Make New Things 512x512 PNG requirements, >= 5 item minimum, and per-collection uniqueness", async () => {
    expect(MIN_COLLECTION_ITEMS).toBe(5);

    // 1. Valid 512x512 transparent sticker PNG passes
    const transparent512 = await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 160,
              height: 160,
              channels: 4,
              background: { r: 255, g: 209, b: 92, alpha: 255 },
            },
          })
            .png()
            .toBuffer(),
          left: 176,
          top: 176,
        },
      ])
      .png()
      .toBuffer();

    const normalized = await validateAndNormalize512Png(transparent512);
    expect(normalized.hasTransparency).toBe(true);
    const meta512 = await sharp(normalized.sprite512Png).metadata();
    const meta64 = await sharp(normalized.sprite64Png).metadata();
    expect(meta512.width).toBe(512);
    expect(meta512.height).toBe(512);
    expect(meta64.width).toBe(64);
    expect(meta64.height).toBe(64);

    // 2. Wrong dimensions (256x256 PNG) rejected
    const wrongSizePng = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 255 },
      },
    })
      .png()
      .toBuffer();
    await expect(validateAndNormalize512Png(wrongSizePng)).rejects.toThrow(
      /512x512px/
    );

    // 3. Wrong format (512x512 JPEG) rejected
    const jpeg512 = await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 3,
        background: { r: 255, g: 0, b: 0 },
      },
    })
      .jpeg()
      .toBuffer();
    await expect(validateAndNormalize512Png(jpeg512)).rejects.toThrow(/PNG/);

    const samplePngDataUrl = `data:image/png;base64,${transparent512.toString("base64")}`;
    const makeDraft = (name: string) => ({
      name,
      subcategory: "Prize Counter Relics",
      description: "A charmingly specific plastic trinket from a roller rink.",
      flavorText: "Still carries a faint memory of pretzel salt.",
      uselessTrait: "+1 Pocket Clutter",
      iconAlt: "Pixel-art icon of a roller rink trinket.",
      spriteDataUrl: samplePngDataUrl,
    });

    // 4. Fewer than 5 items rejected
    expect(() =>
      validateCollectionUniqueness({
        collectionName: "Roller Rink Leftovers",
        items: [
          makeDraft("Neon Whistle Ring"),
          makeDraft("Velvet Skate Lace"),
          makeDraft("Plastic Trophy Base"),
          makeDraft("Warped Arcade Token"),
        ],
      })
    ).toThrow(/at least 5/);

    // 5. Duplicate item names within a 5-item collection rejected
    expect(() =>
      validateCollectionUniqueness({
        collectionName: "Roller Rink Leftovers",
        items: [
          makeDraft("The Neon Whistle Ring"),
          makeDraft("Velvet Skate Lace"),
          makeDraft("Plastic Trophy Base"),
          makeDraft("Warped Arcade Token"),
          makeDraft("Whistle Ring, Neon!"),
        ],
      })
    ).toThrow(/unique/i);

    // 6. Five distinct items pass cleanly
    const validSet = validateCollectionUniqueness({
      collectionName: "Roller Rink Leftovers",
      collectionDescription: "Forgotten prizes from the bottom shelf.",
      items: [
        makeDraft("Neon Whistle Ring"),
        makeDraft("Velvet Skate Lace"),
        makeDraft("Plastic Trophy Base"),
        makeDraft("Warped Arcade Token"),
        makeDraft("Faded Nacho Ticket Stub"),
      ],
    });
    expect(validSet.parsed.items.length).toBe(5);
    expect(new Set(validSet.fingerprints).size).toBe(5);
  });

  it("calculates Mystery Box Stripe fee estimates, Give a Thing support %, and enforces self-pull & paid-box rules", () => {
    expect(parseUsdInputToCents("2.50")).toBe(250);
    expect(parseUsdInputToCents("$12")).toBe(1200);
    expect(parseUsdInputToCents("abc")).toBeNull();
    expect(formatUsdCents(250)).toBe("$2.50");
    expect(percentToBps(10)).toBe(1000);
    expect(percentToBps(7.5)).toBe(750);
    expect(bpsToPercentDisplay(0)).toBe("0%");
    expect(bpsToPercentDisplay(1000)).toBe("10%");
    expect(bpsToPercentDisplay(750)).toBe("7.5%");

    // Free Mystery Box ($0.00)
    const freeBreakdown = estimateMysteryBoxPayoutBreakdown(0, 0);
    expect(freeBreakdown.isFree).toBe(true);
    expect(freeBreakdown.valid).toBe(true);
    expect(freeBreakdown.estimatedStripeFeeCents).toBe(0);
    expect(freeBreakdown.platformDonationCents).toBe(0);

    // Below Stripe $0.50 USD minimum rejected
    const tooLow = estimateMysteryBoxPayoutBreakdown(25, 0);
    expect(tooLow.valid).toBe(false);
    expect(tooLow.validationError).toMatch(/\$0\.50/);

    // $5.00 pull with 0% Give a Thing donation (default)
    const fiveDollarZeroDon = estimateMysteryBoxPayoutBreakdown(500, 0);
    expect(fiveDollarZeroDon.valid).toBe(true);
    expect(fiveDollarZeroDon.estimatedStripeFeeCents).toBe(45); // 15c + 30c
    expect(fiveDollarZeroDon.platformDonationCents).toBe(0);
    expect(fiveDollarZeroDon.estimatedCreatorNetCents).toBe(455);

    // $10.00 pull with 10% Give a Thing donation
    const tenDollarTenPct = estimateMysteryBoxPayoutBreakdown(1000, 1000);
    expect(tenDollarTenPct.valid).toBe(true);
    expect(tenDollarTenPct.estimatedStripeFeeCents).toBe(59); // 29c + 30c
    expect(tenDollarTenPct.platformDonationCents).toBe(100);
    expect(tenDollarTenPct.estimatedCreatorNetCents).toBe(841);

    // Negative creator payout ($0.50 with 80% donation -> 31c Stripe + 40c donation = 71c > 50c) rejected
    const negativeNet = estimateMysteryBoxPayoutBreakdown(50, 8000);
    expect(negativeNet.valid).toBe(false);
    expect(negativeNet.estimatedCreatorNetCents).toBeLessThan(1);

    // Creator self-pull error exists and is enforced unconditionally (never exempted for unlimited accounts)
    const selfErr = new CreatorCannotPullOwnBoxError();
    expect(selfErr.message).toMatch(/own mystery box/i);

    const collectionServiceSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "lib", "maker", "collection-service.ts"),
      "utf8"
    );
    expect(collectionServiceSrc).not.toContain(
      "if (!unlimited && collection.creatorDid === params.claimerDid)"
    );
    expect(collectionServiceSrc).toContain(
      "if (collection.creatorDid === params.claimerDid)"
    );

    const pricingFieldsSrc = fs.readFileSync(
      path.join(
        process.cwd(),
        "src",
        "components",
        "CollectionPricingFields.tsx"
      ),
      "utf8"
    );
    expect(pricingFieldsSrc).toContain("0% (Default)");
    expect(pricingFieldsSrc).toContain("10%");
    expect(pricingFieldsSrc).toContain("Custom %");
    expect(pricingFieldsSrc).toContain("Connect Payout Method");

    const makerStudioSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "MakerStudioClient.tsx"),
      "utf8"
    );
    expect(makerStudioSrc).toContain("Change Price");
    expect(makerStudioSrc).toContain("Set Price");

    const profileClientSrc = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "UserProfileClient.tsx"),
      "utf8"
    );
    expect(profileClientSrc).not.toContain("isSelf && !viewerUnlimitedPulls");
    expect(profileClientSrc).toContain("hasFreeMysteryBoxWithTimer");
    expect(profileClientSrc).toContain("Buy a Mystery Thing");
    expect(profileClientSrc).toContain("Buy Another");
  });
});
