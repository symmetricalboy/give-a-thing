"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  Edit3,
  ExternalLink,
  Gift,
  Hammer,
  ImagePlus,
  Loader2,
  PackageOpen,
  Plus,
  Sparkles,
  Trash2,
  Wallet,
  Wand2,
} from "lucide-react";
import {
  CollectionPricingFields,
  derivePricingPayload,
  pricingStateFromCollection,
  type CollectionPricingFormState,
} from "@/components/CollectionPricingFields";
import { RpgModal } from "@/components/RpgModal";
import type { CreatorStudioCollectionSummary } from "@/lib/maker/collection-service";
import type { CreatorPayoutStatus } from "@/lib/stripe/connect";
import { bpsToPercentDisplay, formatUsdCents } from "@/lib/stripe/pricing";

const MIN_COLLECTION_ITEMS = 5;
const MAX_COLLECTION_ITEMS = 50;
const DRAFT_STORAGE_KEY = "gat_maker_draft_v1";

const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "for",
  "in",
  "on",
  "at",
  "to",
  "from",
  "with",
  "by",
  "and",
  "or",
  "one",
  "single",
  "very",
]);

function lightSingularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) {
    return word.slice(0, -3) + "y";
  }
  if (
    word.endsWith("es") &&
    (word.endsWith("ches") ||
      word.endsWith("shes") ||
      word.endsWith("xes") ||
      word.endsWith("sses"))
  ) {
    return word.slice(0, -2);
  }
  if (
    word.endsWith("s") &&
    !word.endsWith("ss") &&
    !word.endsWith("us") &&
    !word.endsWith("is")
  ) {
    return word.slice(0, -1);
  }
  return word;
}

function clientCanonicalFingerprint(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");

  const tokens = normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map(lightSingularize);

  const uniqueSorted = Array.from(new Set(tokens)).sort();
  return uniqueSorted.join("-") || normalized.trim().replace(/\s+/g, "-");
}

interface DraftThingItem {
  localId: string;
  name: string;
  subcategory: string;
  description: string;
  flavorText: string;
  uselessTrait: string;
  iconAlt: string;
  spriteDataUrl: string;
  artworkSource: "upload" | "generated";
  hasTransparency?: boolean;
}

interface PersistedMakerDraft {
  collectionName: string;
  collectionDescription: string;
  pricing?: CollectionPricingFormState;
  items: DraftThingItem[];
}

interface MakerStudioClientProps {
  initialCollections: CreatorStudioCollectionSummary[];
  initialPayoutStatus: CreatorPayoutStatus;
  creatorHandle: string;
}

const DEFAULT_PRICING_FORM: CollectionPricingFormState = {
  isPaid: false,
  priceDollarsInput: "2.50",
  donationPreset: "0",
  customDonationInput: "5",
};

const WIZARD_STEPS = [
  { step: 1, shortLabel: "1. Collection", title: "Name Your Collection (`category`)" },
  { step: 2, shortLabel: "2. Identity", title: "Name & Subcategory (`name`, `subcategory`)" },
  { step: 3, shortLabel: "3. Lore & Trait", title: "Description, Quote & Pointless Trait" },
  { step: 4, shortLabel: "4. Artwork", title: "512×512 Icon & Alt Text (`icon`, `iconAlt`)" },
  { step: 5, shortLabel: "5. Tray & Publish", title: "Review Unique Set & Publish Mystery Box" },
] as const;

export function MakerStudioClient({
  initialCollections,
  initialPayoutStatus,
  creatorHandle,
}: MakerStudioClientProps) {
  const baseId = useId();
  const progressId = `${baseId}-collection-progress`;
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [studioTab, setStudioTab] = useState<"create" | "manage">("create");
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Collection-level fields (`category` = collectionName) + pull pricing
  const [collectionName, setCollectionName] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [draftPricing, setDraftPricing] =
    useState<CollectionPricingFormState>(DEFAULT_PRICING_FORM);
  const [draftItems, setDraftItems] = useState<DraftThingItem[]>([]);

  // Stripe Connect payout status + existing-collection price editor modal
  const [payoutStatus, setPayoutStatus] =
    useState<CreatorPayoutStatus>(initialPayoutStatus);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [stripeReturnNotice, setStripeReturnNotice] = useState<string | null>(
    null
  );
  const [editingPriceCollection, setEditingPriceCollection] =
    useState<CreatorStudioCollectionSummary | null>(null);
  const [editPriceForm, setEditPriceForm] =
    useState<CollectionPricingFormState>(DEFAULT_PRICING_FORM);
  const [savingPrice, setSavingPrice] = useState(false);
  const [editPriceError, setEditPriceError] = useState<string | null>(null);

  // Active item builder fields (`.thing` lexicon fields)
  const [editingLocalId, setEditingLocalId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [description, setDescription] = useState("");
  const [flavorText, setFlavorText] = useState("");
  const [uselessTrait, setUselessTrait] = useState("");
  const [artworkMode, setArtworkMode] = useState<"upload" | "generated">("upload");
  const [spriteDataUrl, setSpriteDataUrl] = useState("");
  const [spriteTransparencyNote, setSpriteTransparencyNote] = useState<
    "transparent" | "opaque" | null
  >(null);
  const [iconAlt, setIconAlt] = useState("");

  // Interaction-deferred validation tracking (`validate-input-after-interaction`)
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [stepAttempted, setStepAttempted] = useState<Record<number, boolean>>({});

  // Async action states
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [generatingSprite, setGeneratingSprite] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [publishedBanner, setPublishedBanner] = useState<{
    name: string;
    totalItems: number;
  } | null>(null);

  // Published collections & revoke dialog state
  const [collections, setCollections] =
    useState<CreatorStudioCollectionSummary[]>(initialCollections);
  const [revokeTarget, setRevokeTarget] = useState<{
    thingTid: string;
    catalogNumber: number;
    name: string;
    status: string;
    currentOwnerHandle: string;
  } | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Hydrate saved draft from localStorage once on mount
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<PersistedMakerDraft>;
        if (typeof parsed.collectionName === "string") {
          setCollectionName(parsed.collectionName);
        }
        if (typeof parsed.collectionDescription === "string") {
          setCollectionDescription(parsed.collectionDescription);
        }
        if (parsed.pricing && typeof parsed.pricing === "object") {
          setDraftPricing({
            ...DEFAULT_PRICING_FORM,
            ...parsed.pricing,
          });
        }
        if (Array.isArray(parsed.items)) {
          setDraftItems(parsed.items);
        }
      }
    } catch {
      // Ignore malformed localStorage
    }

    // Check URL params for returning from Stripe Connect OR deep-linking to edit a collection's price
    try {
      const url = new URL(window.location.href);
      const tabParam = url.searchParams.get("tab");
      const editPriceTid = url.searchParams.get("editPrice");
      const stripeParam = url.searchParams.get("stripe");

      if (tabParam === "collections" || editPriceTid) {
        setStudioTab("manage");
      }

      if (editPriceTid) {
        const target = initialCollections.find(
          (c) => c.collectionTid === editPriceTid
        );
        if (target) {
          setEditPriceError(null);
          setEditPriceForm(
            pricingStateFromCollection(target.priceCents, target.platformFeeBps)
          );
          setEditingPriceCollection(target);
        }
        url.searchParams.delete("editPrice");
      }

      if (stripeParam === "return") {
        void fetch("/api/stripe/connect")
          .then((r) => r.json())
          .then((d: { status?: CreatorPayoutStatus }) => {
            if (d.status) {
              setPayoutStatus(d.status);
              setStripeReturnNotice(
                d.status.payoutsReady
                  ? "Stripe payout method connected! You can now set paid pull prices on new or existing Mystery Boxes."
                  : "Returned from Stripe—some verification details are still pending before paid pulls can be activated."
              );
            }
          })
          .catch(() => {});
        url.searchParams.delete("stripe");
      }

      if (tabParam || editPriceTid || stripeParam) {
        url.searchParams.delete("tab");
        window.history.replaceState({}, "", url.pathname + url.search);
      }
    } catch {
      // Ignore URL cleanup errors
    }

    setHydrated(true);
  }, []);

  // Persist draft automatically
  useEffect(() => {
    if (!hydrated) return;
    try {
      const payload: PersistedMakerDraft = {
        collectionName,
        collectionDescription,
        pricing: draftPricing,
        items: draftItems,
      };
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota warnings if many 512px PNGs are staged
    }
  }, [
    hydrated,
    collectionName,
    collectionDescription,
    draftPricing,
    draftItems,
  ]);

  const handleStartPayoutOnboarding = async (mode: "onboard" | "update") => {
    setOnboardingBusy(true);
    setOnboardingError(null);
    setStudioError(null);
    setEditPriceError(null);
    try {
      const res = await fetch("/api/stripe/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        const msg =
          data.error ?? "Could not open Stripe payout setup. Please try again.";
        setOnboardingError(msg);
        setStudioError(msg);
        setEditPriceError(msg);
        setOnboardingBusy(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      const msg = "Network error starting Stripe payout setup.";
      setOnboardingError(msg);
      setStudioError(msg);
      setEditPriceError(msg);
      setOnboardingBusy(false);
    }
  };

  const handleSaveEditedPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPriceCollection) return;
    setEditPriceError(null);

    const derived = derivePricingPayload(
      editPriceForm,
      payoutStatus.stripeAccountId === "platform"
    );
    if (!derived.valid) {
      setEditPriceError(derived.validationError ?? "Invalid collection price.");
      return;
    }
    if (derived.priceCents > 0 && !payoutStatus.payoutsReady) {
      setEditPriceError(
        "Connect and finish your Stripe payout method before charging for pulls."
      );
      return;
    }

    setSavingPrice(true);
    try {
      const res = await fetch(
        `/api/maker/collections/${encodeURIComponent(editingPriceCollection.collectionTid)}/pricing`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priceCents: derived.priceCents,
            platformFeeBps: derived.platformFeeBps,
          }),
        }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        collections?: CreatorStudioCollectionSummary[];
      };
      if (!res.ok || !data.ok) {
        setEditPriceError(
          data.error ?? "Could not update collection pricing."
        );
        return;
      }

      if (data.collections) {
        setCollections(data.collections);
      }
      setStatusMessage(
        derived.priceCents > 0
          ? `Updated "${editingPriceCollection.name}" to ${formatUsdCents(derived.priceCents)} per pull!`
          : `Updated "${editingPriceCollection.name}" to Free ($0.00).`
      );
      setEditingPriceCollection(null);
    } catch {
      setEditPriceError("Network error updating collection price.");
    } finally {
      setSavingPrice(false);
    }
  };

  const goToStep = (nextStep: 1 | 2 | 3 | 4 | 5) => {
    setStudioError(null);
    setActiveStep(nextStep);
    requestAnimationFrame(() => {
      stepHeadingRef.current?.focus();
    });
  };

  const markTouched = (field: string) => {
    setTouchedFields((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  const resetCurrentItemFields = () => {
    setEditingLocalId(null);
    setName("");
    setSubcategory("");
    setDescription("");
    setFlavorText("");
    setUselessTrait("");
    setSpriteDataUrl("");
    setSpriteTransparencyNote(null);
    setIconAlt("");
    setUploadError(null);
    setTouchedFields((prev) => ({
      collectionName: Boolean(prev.collectionName),
      collectionDescription: Boolean(prev.collectionDescription),
    }));
    setStepAttempted((prev) => ({ 1: Boolean(prev[1]) }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Field-level error calculators
  const duplicateDraftMatch = (() => {
    const trimmed = name.trim();
    if (trimmed.length < 2) return null;
    const fp = clientCanonicalFingerprint(trimmed);
    if (!fp) return null;
    return (
      draftItems.find(
        (item) =>
          item.localId !== editingLocalId &&
          clientCanonicalFingerprint(item.name) === fp
      ) ?? null
    );
  })();

  const duplicateSpriteMatch = (() => {
    if (!spriteDataUrl) return null;
    return (
      draftItems.find(
        (item) =>
          item.localId !== editingLocalId && item.spriteDataUrl === spriteDataUrl
      ) ?? null
    );
  })();

  const errors = {
    collectionName:
      collectionName.trim().length < 2
        ? "Enter a collection name of at least 2 characters (this becomes every item's category)."
        : collectionName.trim().length > 100
          ? "Collection name must be 100 characters or fewer."
          : null,
    name:
      name.trim().length < 2
        ? "Give this thing a specific name (at least 2 characters)."
        : name.trim().length > 120
          ? "Name must be 120 characters or fewer."
          : duplicateDraftMatch
            ? `Every thing in a collection must be unique! "${name.trim()}" is too similar to "${duplicateDraftMatch.name}".`
            : null,
    subcategory:
      subcategory.trim().length < 2
        ? "Enter a playful subcategory (at least 2 characters)."
        : subcategory.trim().length > 120
          ? "Subcategory must be 120 characters or fewer."
          : null,
    description:
      description.trim().length < 10
        ? "Write at least 10 characters describing what this odd object looks and feels like."
        : description.trim().length > 500
          ? "Description must be 500 characters or fewer."
          : null,
    flavorText:
      flavorText.trim().length < 3
        ? "Add a short wry flavor quote (at least 3 characters)."
        : flavorText.trim().length > 280
          ? "Flavor quote must be 280 characters or fewer."
          : null,
    uselessTrait:
      uselessTrait.trim().length < 2
        ? "Enter a pointless trait modifier (at least 2 characters, e.g. +1 Desk Clutter)."
        : uselessTrait.trim().length > 80
          ? "Pointless trait must be 80 characters or fewer."
          : null,
    sprite: !spriteDataUrl
      ? "Upload a 512×512px PNG or generate an icon in our standard style."
      : duplicateSpriteMatch
        ? `Every thing must have its own unique design! This exact image is already used by "${duplicateSpriteMatch.name}".`
        : null,
    iconAlt:
      iconAlt.trim().length < 5
        ? "Write accessible alt text (at least 5 characters) describing the sprite visually."
        : iconAlt.trim().length > 300
          ? "Alt text must be 300 characters or fewer."
          : null,
  };

  const showFieldError = (field: keyof typeof errors, stepNum: number) =>
    Boolean(errors[field] && (touchedFields[field] || stepAttempted[stepNum]));

  const buildAriaDescribedBy = (hintId: string, errorId: string, errorShown: boolean) =>
    errorShown ? `${hintId} ${errorId}` : hintId;

  const validateAndAdvanceFromStep1 = () => {
    setStepAttempted((prev) => ({ ...prev, 1: true }));
    if (errors.collectionName) {
      setStudioError(errors.collectionName);
      return;
    }
    goToStep(2);
  };

  const validateAndAdvanceFromStep2 = () => {
    setStepAttempted((prev) => ({ ...prev, 2: true }));
    if (errors.name || errors.subcategory) {
      setStudioError(errors.name ?? errors.subcategory);
      return;
    }
    goToStep(3);
  };

  const validateAndAdvanceFromStep3 = () => {
    setStepAttempted((prev) => ({ ...prev, 3: true }));
    if (errors.description || errors.flavorText || errors.uselessTrait) {
      setStudioError(
        errors.description ?? errors.flavorText ?? errors.uselessTrait
      );
      return;
    }
    goToStep(4);
  };

  const handlePngUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setStudioError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== "image/png") {
      setUploadError(
        "Only PNG files (.png) are accepted. Please export your artwork as a 512×512px PNG."
      );
      e.target.value = "";
      return;
    }

    if (file.size > 1_000_000) {
      setUploadError(
        "PNG file must be 1 MB or smaller so it can be stored cleanly in your Personal Data Server (PDS)."
      );
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl.startsWith("data:image/png;base64,")) {
        setUploadError("Could not read PNG file. Please try another 512×512px PNG.");
        return;
      }

      const img = new window.Image();
      img.onload = () => {
        if (img.naturalWidth !== 512 || img.naturalHeight !== 512) {
          setUploadError(
            `Uploaded PNG must be strictly 512×512px (your image is ${img.naturalWidth}×${img.naturalHeight}px).`
          );
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }

        // Inspect alpha channel on a canvas to give friendly sticker cutout feedback
        let detectedAlpha = false;
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 512;
          canvas.height = 512;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            const { data } = ctx.getImageData(0, 0, 512, 512);
            for (let i = 3; i < data.length; i += 32) {
              if (data[i]! < 250) {
                detectedAlpha = true;
                break;
              }
            }
          }
        } catch {
          // Canvas check is optional UX polish
        }

        setSpriteDataUrl(dataUrl);
        setArtworkMode("upload");
        setSpriteTransparencyNote(detectedAlpha ? "transparent" : "opaque");
        markTouched("sprite");
        setStatusMessage("512×512px PNG loaded!");
      };
      img.onerror = () => {
        setUploadError("Invalid PNG image file.");
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateStandardSprite = async () => {
    setStudioError(null);
    setUploadError(null);

    if (errors.collectionName) {
      setStudioError("Set your Collection Name in Step 1 before generating an icon.");
      goToStep(1);
      return;
    }
    if (errors.name || errors.subcategory) {
      setStudioError("Fill in this thing's Name and Subcategory in Step 2 first.");
      goToStep(2);
      return;
    }
    if (errors.description || errors.flavorText) {
      setStudioError("Fill in this thing's Description and Flavor Quote in Step 3 first.");
      goToStep(3);
      return;
    }

    setGeneratingSprite(true);
    try {
      const res = await fetch("/api/maker/generate-sprite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category: collectionName.trim(),
          subcategory: subcategory.trim(),
          description: description.trim(),
          flavorText: flavorText.trim(),
          uselessTrait: uselessTrait.trim() || undefined,
        }),
      });
      const data = (await res.json()) as {
        spriteDataUrl?: string;
        suggestedIconAlt?: string;
        error?: string;
      };

      if (!res.ok || !data.spriteDataUrl) {
        setStudioError(
          data.error ?? "Could not generate an icon right now. Please try again!"
        );
        return;
      }

      setSpriteDataUrl(data.spriteDataUrl);
      setArtworkMode("generated");
      setSpriteTransparencyNote("transparent");
      if (!iconAlt.trim() && data.suggestedIconAlt) {
        setIconAlt(data.suggestedIconAlt);
      }
      setStatusMessage("Generated a 512×512px 16-bit cutout sprite!");
    } catch {
      setStudioError("Network error while generating sprite. Please try again.");
    } finally {
      setGeneratingSprite(false);
    }
  };

  const handleSaveItemToTray = () => {
    setStepAttempted((prev) => ({ ...prev, 1: true, 2: true, 3: true, 4: true }));
    setStudioError(null);

    const firstError =
      errors.collectionName ??
      errors.name ??
      errors.subcategory ??
      errors.description ??
      errors.flavorText ??
      errors.uselessTrait ??
      errors.sprite ??
      errors.iconAlt;

    if (firstError) {
      setStudioError(firstError);
      return;
    }

    if (!editingLocalId && draftItems.length >= MAX_COLLECTION_ITEMS) {
      setStudioError(`A collection can hold at most ${MAX_COLLECTION_ITEMS} items.`);
      return;
    }

    const cleanQuotelessFlavor = flavorText
      .trim()
      .replace(/^["“”']+/, "")
      .replace(/["“”']+$/, "")
      .trim();

    const itemPayload: DraftThingItem = {
      localId:
        editingLocalId ??
        `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      subcategory: subcategory.trim(),
      description: description.trim(),
      flavorText: cleanQuotelessFlavor || flavorText.trim(),
      uselessTrait: uselessTrait.trim(),
      iconAlt: iconAlt.trim(),
      spriteDataUrl,
      artworkSource: artworkMode,
      hasTransparency: spriteTransparencyNote === "transparent",
    };

    if (editingLocalId) {
      setDraftItems((prev) =>
        prev.map((it) => (it.localId === editingLocalId ? itemPayload : it))
      );
      setStatusMessage(`Updated "${itemPayload.name}" in your collection tray.`);
    } else {
      setDraftItems((prev) => [...prev, itemPayload]);
      setStatusMessage(`Added "${itemPayload.name}" to your collection tray!`);
    }

    resetCurrentItemFields();
    goToStep(5);
  };

  const handleEditDraftItem = (item: DraftThingItem) => {
    setEditingLocalId(item.localId);
    setName(item.name);
    setSubcategory(item.subcategory);
    setDescription(item.description);
    setFlavorText(item.flavorText);
    setUselessTrait(item.uselessTrait);
    setArtworkMode(item.artworkSource);
    setSpriteDataUrl(item.spriteDataUrl);
    setSpriteTransparencyNote(item.hasTransparency ? "transparent" : null);
    setIconAlt(item.iconAlt);
    setUploadError(null);
    goToStep(2);
  };

  const handleRemoveDraftItem = (localId: string) => {
    setDraftItems((prev) => prev.filter((it) => it.localId !== localId));
    if (editingLocalId === localId) {
      resetCurrentItemFields();
    }
  };

  const handlePublishCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudioError(null);
    setPublishedBanner(null);

    if (errors.collectionName) {
      setStepAttempted((prev) => ({ ...prev, 1: true }));
      setStudioError(errors.collectionName);
      goToStep(1);
      return;
    }

    if (draftItems.length < MIN_COLLECTION_ITEMS) {
      setStudioError(
        `Collections must contain at least ${MIN_COLLECTION_ITEMS} unique things before publishing (${MIN_COLLECTION_ITEMS - draftItems.length} more needed).`
      );
      return;
    }

    const pricingPayload = derivePricingPayload(
      draftPricing,
      payoutStatus.stripeAccountId === "platform"
    );
    if (!pricingPayload.valid) {
      setStudioError(
        pricingPayload.validationError ?? "Invalid collection pricing."
      );
      return;
    }
    if (pricingPayload.priceCents > 0 && !payoutStatus.payoutsReady) {
      setStudioError(
        "Connect and finish your Stripe payout method before publishing a paid Mystery Box."
      );
      return;
    }

    setPublishing(true);
    try {
      const res = await fetch("/api/maker/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collectionName: collectionName.trim(),
          collectionDescription: collectionDescription.trim() || undefined,
          priceCents: pricingPayload.priceCents,
          platformFeeBps: pricingPayload.platformFeeBps,
          items: draftItems.map((it) => ({
            name: it.name,
            subcategory: it.subcategory,
            description: it.description,
            flavorText: it.flavorText,
            uselessTrait: it.uselessTrait,
            iconAlt: it.iconAlt,
            spriteDataUrl: it.spriteDataUrl,
          })),
        }),
      });

      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        collection?: { name: string; totalItems: number };
        collections?: CreatorStudioCollectionSummary[];
      };

      if (!res.ok || !data.ok) {
        setStudioError(
          data.error ?? "Could not publish collection. Please check your items and try again."
        );
        return;
      }

      if (data.collections) {
        setCollections(data.collections);
      }
      setPublishedBanner({
        name: data.collection?.name ?? collectionName.trim(),
        totalItems: data.collection?.totalItems ?? draftItems.length,
      });
      setCollectionName("");
      setCollectionDescription("");
      setDraftPricing(DEFAULT_PRICING_FORM);
      setDraftItems([]);
      resetCurrentItemFields();
      try {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // Ignore
      }
      setStatusMessage("Collection published and live as a profile Mystery Box!");
    } catch {
      setStudioError("Network error while publishing collection. Please try again.");
    } finally {
      setPublishing(false);
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    setRevokeError(null);

    try {
      const res = await fetch(
        `/api/maker/things/${encodeURIComponent(revokeTarget.thingTid)}/revoke`,
        { method: "POST" }
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setRevokeError(data.error ?? "Could not revoke and destroy this thing.");
        return;
      }

      // Remove destroyed item from local collections state
      setCollections((prev) =>
        prev.map((col) => {
          const nextItems = col.items.filter(
            (i) => i.thingTid !== revokeTarget.thingTid
          );
          const nextUnclaimed = nextItems.filter(
            (i) => i.status === "unclaimed"
          ).length;
          return {
            ...col,
            unclaimedCount: nextUnclaimed,
            claimedCount: nextItems.length - nextUnclaimed,
            items: nextItems,
          };
        })
      );
      setStatusMessage(
        `Revoked and permanently destroyed "${revokeTarget.name}".`
      );
      setRevokeTarget(null);
    } catch {
      setRevokeError("Network error while revoking thing. Please try again.");
    } finally {
      setRevoking(false);
    }
  };

  const activeStepMeta = WIZARD_STEPS.find((s) => s.step === activeStep)!;
  const itemOrdinal = editingLocalId
    ? draftItems.findIndex((i) => i.localId === editingLocalId) + 1
    : draftItems.length + 1;

  return (
    <div className="space-y-6">
      {/* Polite screen-reader live region for async sprite/save/publish updates */}
      <div role="status" aria-live="polite" className="sr-only">
        {statusMessage ?? ""}
      </div>

      {/* Workshop Header */}
      <section className="rpg-panel overflow-hidden">
        <div className="candy-ribbon w-full" aria-hidden="true" />
        <div className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#ffd15c]/60 bg-[#160f24] px-3 py-1 font-pixel text-[10px] text-[#ffd15c]">
              <Hammer className="h-3.5 w-3.5 text-[#ff99ac]" aria-hidden="true" />
              <span>WORKSHOP STUDIO · @{creatorHandle}</span>
            </div>
            <h1 className="font-pixel text-lg sm:text-xl text-[#ffd15c]">
              MAKE NEW THINGS
            </h1>
            <p className="text-sm text-[#cfc3e8] max-w-2xl">
              Craft themed collections of at least {MIN_COLLECTION_ITEMS} completely
              unique, wonderfully pointless things. Genesis{" "}
              <code className="text-[#8ec8ff]">.thing</code> records live in your own
              Personal Data Server (PDS), and finished sets appear as daily Mystery
              Boxes on your profile until every item is claimed!
            </p>
          </div>

          <Link
            href={`/u/${encodeURIComponent(creatorHandle)}`}
            className="rpg-btn-secondary shrink-0 inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-[10px] text-[#8ec8ff]"
          >
            <Gift className="h-3.5 w-3.5" aria-hidden="true" />
            VIEW YOUR PROFILE BOXES
          </Link>
        </div>
      </section>

      {/* Stripe Onboarding Return Notice */}
      {stripeReturnNotice ? (
        <section className="rpg-panel-blue p-4 sm:p-5 flex items-center justify-between gap-3">
          <p className="text-xs sm:text-sm text-[#fdf6e9]">
            {stripeReturnNotice}
          </p>
          <button
            type="button"
            onClick={() => setStripeReturnNotice(null)}
            className="rpg-btn-secondary shrink-0 px-3 py-1.5 font-pixel text-[10px]"
          >
            Dismiss
          </button>
        </section>
      ) : null}

      {/* Published Celebration Banner */}
      {publishedBanner ? (
        <section className="rpg-panel-blue p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="font-pixel text-xs text-[#4be3a0] flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              MYSTERY BOX COLLECTION PUBLISHED!
            </p>
            <p className="text-sm text-[#fdf6e9]">
              <strong>{publishedBanner.name}</strong> ({publishedBanner.totalItems}{" "}
              unique things) is now stored in your PDS and live on your profile for
              players to draw once per day!
            </p>
          </div>
          <Link
            href={`/u/${encodeURIComponent(creatorHandle)}`}
            className="rpg-btn-primary shrink-0 inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
          >
            See Mystery Box
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </section>
      ) : null}

      {/* Always-Available Creator Payout Setup Bar (Set Up Anytime Before Making a Collection!) */}
      <div className="rpg-panel-subtle p-4 sm:p-5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Wallet className="h-4 w-4 text-[#ffd15c]" aria-hidden="true" />
              <p className="font-pixel text-xs text-[#ffd15c]">
                CREATOR PAYOUTS (OPTIONAL)
              </p>
              {payoutStatus.payoutsReady ? (
                <span className="inline-flex items-center gap-1 rounded bg-[#4be3a0]/20 px-2 py-0.5 font-pixel text-[9px] text-[#4be3a0]">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  CONNECTED &amp; READY
                </span>
              ) : payoutStatus.connected ? (
                <span className="rounded bg-[#ffd15c]/20 px-2 py-0.5 font-pixel text-[9px] text-[#ffd15c]">
                  SETUP INCOMPLETE
                </span>
              ) : (
                <span className="rounded bg-[#160f24] px-2 py-0.5 font-pixel text-[9px] text-[#cfc3e8]">
                  NOT CONNECTED
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-[#cfc3e8]">
              {payoutStatus.stripeAccountId === "platform"
                ? "Connected directly to Give a Thing's Stripe account! You can charge per pull on any collection."
                : payoutStatus.payoutsReady
                  ? "Your Stripe payout method is ready! You can publish paid Mystery Boxes or update prices on existing collections anytime."
                  : payoutStatus.connected
                    ? "Finish your Stripe payout details anytime so you're ready to charge per pull on Mystery Boxes."
                    : "Making free Mystery Boxes needs zero setup! Want to charge per pull? You can connect your Stripe payout method right now in advance—even before creating your first collection."}
            </p>
          </div>

          {payoutStatus.stripeConfigured &&
          payoutStatus.stripeAccountId !== "platform" ? (
            <button
              type="button"
              disabled={onboardingBusy}
              onClick={() =>
                void handleStartPayoutOnboarding(
                  payoutStatus.payoutsReady ? "update" : "onboard"
                )
              }
              className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 font-pixel text-[10px] ${
                payoutStatus.payoutsReady
                  ? "rpg-btn-secondary text-[#8ec8ff]"
                  : "rpg-btn-blue"
              }`}
            >
              {onboardingBusy ? (
                <>
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                  Opening Stripe…
                </>
              ) : (
                <>
                  {payoutStatus.payoutsReady
                    ? "Payout Settings"
                    : payoutStatus.connected
                      ? "Finish Payout Setup"
                      : "Connect Payout Method"}
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </>
              )}
            </button>
          ) : null}
        </div>

        {onboardingError ? (
          <div
            role="alert"
            className="rounded border-2 border-[#ff4d6d] bg-[#ff4d6d]/15 p-3 text-xs sm:text-sm text-[#ffd6de] flex items-start gap-2.5"
          >
            <AlertTriangle
              className="h-4 w-4 shrink-0 text-[#ff4d6d] mt-0.5"
              aria-hidden="true"
            />
            <span>{onboardingError}</span>
          </div>
        ) : null}
      </div>

      {/* Studio Mode Tabs */}
      <div role="tablist" aria-label="Workshop Views" className="rpg-tablist">
        <button
          type="button"
          role="tab"
          id={`${baseId}-tab-create`}
          aria-selected={studioTab === "create"}
          aria-controls={`${baseId}-panel-create`}
          onClick={() => setStudioTab("create")}
          className="rpg-tab inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          CREATE A COLLECTION
          <span className="rounded bg-[#160f24]/90 px-1.5 py-0.5 text-[10px] text-[#ffd15c]">
            {draftItems.length}/{MIN_COLLECTION_ITEMS}+
          </span>
        </button>

        <button
          type="button"
          role="tab"
          id={`${baseId}-tab-manage`}
          aria-selected={studioTab === "manage"}
          aria-controls={`${baseId}-panel-manage`}
          onClick={() => setStudioTab("manage")}
          className="rpg-tab inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
        >
          <PackageOpen className="h-3.5 w-3.5" aria-hidden="true" />
          YOUR COLLECTIONS
          <span className="rounded bg-[#160f24]/90 px-1.5 py-0.5 text-[10px] text-[#8ec8ff]">
            {collections.length}
          </span>
        </button>
      </div>

      <div className="rpg-tabpanel-stack">
        {/* TAB 1: STEP-BY-STEP COLLECTION & .THING BUILDER */}
        <section
          role="tabpanel"
          id={`${baseId}-panel-create`}
          aria-labelledby={`${baseId}-tab-create`}
          hidden={studioTab !== "create"}
          className="space-y-6"
        >
          {/* Progress & Stepper Bar */}
          <div className="rpg-panel-subtle p-5 sm:p-6 space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor={progressId}
                  className="font-pixel text-[11px] text-[#ffd15c]"
                >
                  COLLECTION PROGRESS: {draftItems.length} OF {MIN_COLLECTION_ITEMS}{" "}
                  MINIMUM UNIQUE THINGS READY
                </label>
                <span className="text-xs text-[#cfc3e8]">
                  {draftItems.length >= MIN_COLLECTION_ITEMS
                    ? "Ready to publish (or keep adding more unique things!)"
                    : `Craft ${MIN_COLLECTION_ITEMS - draftItems.length} more unique ${
                        MIN_COLLECTION_ITEMS - draftItems.length === 1 ? "thing" : "things"
                      } to unlock publishing`}
                </span>
              </div>
              <progress
                id={progressId}
                className="rpg-progress"
                value={Math.min(draftItems.length, MIN_COLLECTION_ITEMS)}
                max={MIN_COLLECTION_ITEMS}
              />
            </div>

            <nav aria-label="Collection Builder Steps">
              <ol className="grid gap-2 sm:grid-cols-5">
                {WIZARD_STEPS.map((s) => {
                  const isCurrent = activeStep === s.step;
                  const isStepComplete =
                    (s.step === 1 && !errors.collectionName) ||
                    (s.step === 2 && !errors.name && !errors.subcategory) ||
                    (s.step === 3 &&
                      !errors.description &&
                      !errors.flavorText &&
                      !errors.uselessTrait) ||
                    (s.step === 4 && !errors.sprite && !errors.iconAlt) ||
                    (s.step === 5 && draftItems.length >= MIN_COLLECTION_ITEMS);

                  return (
                    <li key={s.step}>
                      <button
                        type="button"
                        aria-current={isCurrent ? "step" : undefined}
                        onClick={() => goToStep(s.step)}
                        className={`w-full rounded border-2 px-3 py-2.5 text-left transition-colors cursor-pointer ${
                          isCurrent
                            ? "border-[#ffd15c] bg-[#483275] text-[#ffd15c]"
                            : isStepComplete
                              ? "border-[#4be3a0]/60 bg-[#160f24]/80 text-[#4be3a0] hover:border-[#8ec8ff]"
                              : "border-[#9e762a]/70 bg-[#251a3c] text-[#cfc3e8] hover:border-[#8ec8ff]"
                        }`}
                      >
                        <span className="block font-pixel text-[10px]">
                          {s.shortLabel}
                        </span>
                        <span className="mt-0.5 block text-[11px] opacity-90 truncate">
                          {isStepComplete && !isCurrent ? "Ready ✓" : s.title}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>

          {/* Main Wizard Form */}
          <form
            action="/api/maker/collections"
            method="POST"
            noValidate
            onSubmit={handlePublishCollection}
            aria-labelledby={`${baseId}-step-heading`}
            className="rpg-panel p-5 sm:p-6 space-y-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#9e762a]/50 pb-4">
              <div>
                <p className="font-pixel text-[10px] text-[#8ec8ff]">
                  STEP {activeStep} OF 5{" "}
                  {activeStep >= 2 && activeStep <= 4
                    ? editingLocalId
                      ? `· EDITING THING #${itemOrdinal}`
                      : `· CRAFTING THING #${itemOrdinal}`
                    : ""}
                </p>
                <h2
                  ref={stepHeadingRef}
                  id={`${baseId}-step-heading`}
                  tabIndex={-1}
                  className="mt-1 font-pixel text-sm sm:text-base text-[#ffd15c] outline-none"
                >
                  {activeStepMeta.title}
                </h2>
              </div>

              {editingLocalId ? (
                <button
                  type="button"
                  onClick={() => {
                    resetCurrentItemFields();
                    goToStep(5);
                  }}
                  className="rpg-btn-secondary px-3 py-1.5 font-pixel text-[10px] text-[#ff99ac]"
                >
                  Cancel Item Edit
                </button>
              ) : null}
            </div>

            {studioError ? (
              <div
                role="alert"
                className="rounded border-2 border-[#ff4d6d] bg-[#ff4d6d]/15 p-3.5 text-sm text-[#ffd6de] flex items-start gap-2.5"
              >
                <AlertTriangle
                  className="h-4 w-4 shrink-0 text-[#ff4d6d] mt-0.5"
                  aria-hidden="true"
                />
                <span>{studioError}</span>
              </div>
            ) : null}

            {/* STEP 1: COLLECTION THEME (`category`) */}
            <div hidden={activeStep !== 1} className="space-y-5">
              <div className="rpg-slot p-4 space-y-2 text-xs sm:text-sm text-[#cfc3e8]">
                <p className="font-pixel text-[10px] text-[#ffd15c]">
                  HOW TO PICK A GREAT GIVE A THING COLLECTION THEME
                </p>
                <p>
                  In the <code className="text-[#8ec8ff]">com.giveathing.thing</code>{" "}
                  schema, your <strong>Collection Name</strong> populates each
                  item&apos;s <code className="text-[#8ec8ff]">category</code> field!
                  Aim for a cozy, hyper-specific corner of everyday life rather than a
                  generic bucket:
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-[#fdf6e9]/90">
                  <li>
                    <strong>Great themes:</strong>{" "}
                    <em>&ldquo;Roller Rink Prize Counter Leftovers&rdquo;</em>,{" "}
                    <em>&ldquo;Suspiciously Specific Desk Souvenirs&rdquo;</em>,{" "}
                    <em>&ldquo;Midnight Laundromat Relics&rdquo;</em>
                  </li>
                  <li>
                    <strong>Minimum 5 unique items:</strong> Every thing in your
                    collection must be its own distinct object—never repeat the same
                    item or recolor the same design over &amp; over.
                  </li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${baseId}-collection-name`}
                    className="font-pixel text-xs text-[#fdf6e9]"
                  >
                    Collection Name (<code className="text-[#8ec8ff]">category</code>) *
                  </label>
                  <span className="text-xs text-[#cfc3e8]">
                    {collectionName.trim().length}/100
                  </span>
                </div>
                <p
                  id={`${baseId}-collection-name-hint`}
                  className="text-xs text-[#cfc3e8]"
                >
                  2–100 characters. Shown as the Mystery Box title on your profile and
                  on every item card in this set.
                </p>
                <input
                  id={`${baseId}-collection-name`}
                  name="collectionName"
                  type="text"
                  required
                  minLength={2}
                  maxLength={100}
                  enterKeyHint="next"
                  value={collectionName}
                  onChange={(e) => {
                    setCollectionName(e.target.value);
                    setStudioError(null);
                  }}
                  onBlur={() => markTouched("collectionName")}
                  aria-invalid={showFieldError("collectionName", 1)}
                  aria-describedby={buildAriaDescribedBy(
                    `${baseId}-collection-name-hint`,
                    `${baseId}-collection-name-err`,
                    showFieldError("collectionName", 1)
                  )}
                  placeholder="e.g., Forgotten Roller Rink Prizes"
                  className="rpg-field-control w-full rounded border-2 border-[#9e762a] bg-[#160f24] px-3.5 py-2.5 text-[#fdf6e9] placeholder-[#cfc3e8]/45 focus:border-[#ffd15c] focus:outline-none"
                />
                {showFieldError("collectionName", 1) ? (
                  <p
                    id={`${baseId}-collection-name-err`}
                    className="text-xs text-[#ff99ac]"
                  >
                    Error: {errors.collectionName}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${baseId}-collection-desc`}
                    className="font-pixel text-xs text-[#fdf6e9]"
                  >
                    Mystery Box Tagline (Optional)
                  </label>
                  <span className="text-xs text-[#cfc3e8]">
                    {collectionDescription.length}/280
                  </span>
                </div>
                <p
                  id={`${baseId}-collection-desc-hint`}
                  className="text-xs text-[#cfc3e8]"
                >
                  A 1-sentence teaser shown on your profile&apos;s Mystery Box card
                  before players unwrap a thing.
                </p>
                <textarea
                  id={`${baseId}-collection-desc`}
                  name="collectionDescription"
                  rows={2}
                  maxLength={280}
                  value={collectionDescription}
                  onChange={(e) => setCollectionDescription(e.target.value)}
                  aria-describedby={`${baseId}-collection-desc-hint`}
                  placeholder="e.g., Plastic trophies, slightly warped tokens, and neon trinkets rescued from the bottom shelf."
                  className="rpg-field-control w-full rounded border-2 border-[#9e762a] bg-[#160f24] px-3.5 py-2.5 text-[#fdf6e9] placeholder-[#cfc3e8]/45 focus:border-[#ffd15c] focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={validateAndAdvanceFromStep1}
                  className="rpg-btn-primary px-5 py-2.5 font-pixel text-xs"
                >
                  Next: Thing Identity →
                </button>
              </div>
            </div>

            {/* STEP 2: THING IDENTITY (`name` & `subcategory`) */}
            <div hidden={activeStep !== 2} className="space-y-5">
              <div className="rpg-slot p-4 space-y-2 text-xs sm:text-sm text-[#cfc3e8]">
                <p className="font-pixel text-[10px] text-[#ffd15c]">
                  WRITING SPECIFIC, MEMORABLE ITEM NAMES
                </p>
                <p>
                  The funniest Give a Thing items sound like real physical objects
                  with an oddly specific history—never generic fantasy loot like{" "}
                  <em>&ldquo;Magic Sword&rdquo;</em> or plain nouns like{" "}
                  <em>&ldquo;Blue Cup&rdquo;</em>.
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-[#fdf6e9]/90">
                  <li>
                    <strong>Great names (2–6 words):</strong>{" "}
                    <em>&ldquo;Lopsided Velvet Bowling Pin Keychain&rdquo;</em>,{" "}
                    <em>&ldquo;1997 Civic Magnet for a Plumber Named Doug&rdquo;</em>,{" "}
                    <em>&ldquo;Half-Peeled Glow-in-the-Dark Saturn Sticker&rdquo;</em>
                  </li>
                  <li>
                    <strong>No repeats:</strong> Give every item in{" "}
                    <strong>{collectionName.trim() || "your collection"}</strong> its
                    own unmistakable silhouette and concept!
                  </li>
                </ul>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${baseId}-thing-name`}
                    className="font-pixel text-xs text-[#fdf6e9]"
                  >
                    Thing Name (<code className="text-[#8ec8ff]">name</code>) *
                  </label>
                  <span className="text-xs text-[#cfc3e8]">
                    {name.trim().length}/120
                  </span>
                </div>
                <p id={`${baseId}-thing-name-hint`} className="text-xs text-[#cfc3e8]">
                  2–120 characters. Make it vivid, concrete, and completely distinct
                  from every other thing!
                </p>
                <input
                  id={`${baseId}-thing-name`}
                  name="thingName"
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  enterKeyHint="next"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setStudioError(null);
                  }}
                  onBlur={() => markTouched("name")}
                  aria-invalid={showFieldError("name", 2)}
                  aria-describedby={buildAriaDescribedBy(
                    `${baseId}-thing-name-hint`,
                    `${baseId}-thing-name-err`,
                    showFieldError("name", 2)
                  )}
                  placeholder="e.g., Slightly Sun-Faded Nacho Cheese Ticket Stub"
                  className="rpg-field-control w-full rounded border-2 border-[#9e762a] bg-[#160f24] px-3.5 py-2.5 text-[#fdf6e9] placeholder-[#cfc3e8]/45 focus:border-[#ffd15c] focus:outline-none"
                />
                {showFieldError("name", 2) ? (
                  <p id={`${baseId}-thing-name-err`} className="text-xs text-[#ff99ac]">
                    Error: {errors.name}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${baseId}-thing-subcat`}
                    className="font-pixel text-xs text-[#fdf6e9]"
                  >
                    Subcategory (<code className="text-[#8ec8ff]">subcategory</code>) *
                  </label>
                  <span className="text-xs text-[#cfc3e8]">
                    {subcategory.trim().length}/120
                  </span>
                </div>
                <p
                  id={`${baseId}-thing-subcat-hint`}
                  className="text-xs text-[#cfc3e8]"
                >
                  A playful aisle or micro-shelf inside{" "}
                  <strong>{collectionName.trim() || "your collection"}</strong> (e.g.,{" "}
                  <em>&ldquo;Snack Bar Ephemera&rdquo;</em> or{" "}
                  <em>&ldquo;Pocket-Worn Souvenirs&rdquo;</em>).
                </p>
                <input
                  id={`${baseId}-thing-subcat`}
                  name="thingSubcategory"
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  enterKeyHint="next"
                  value={subcategory}
                  onChange={(e) => {
                    setSubcategory(e.target.value);
                    setStudioError(null);
                  }}
                  onBlur={() => markTouched("subcategory")}
                  aria-invalid={showFieldError("subcategory", 2)}
                  aria-describedby={buildAriaDescribedBy(
                    `${baseId}-thing-subcat-hint`,
                    `${baseId}-thing-subcat-err`,
                    showFieldError("subcategory", 2)
                  )}
                  placeholder="e.g., Snack Bar Ephemera"
                  className="rpg-field-control w-full rounded border-2 border-[#9e762a] bg-[#160f24] px-3.5 py-2.5 text-[#fdf6e9] placeholder-[#cfc3e8]/45 focus:border-[#ffd15c] focus:outline-none"
                />
                {showFieldError("subcategory", 2) ? (
                  <p
                    id={`${baseId}-thing-subcat-err`}
                    className="text-xs text-[#ff99ac]"
                  >
                    Error: {errors.subcategory}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  className="rpg-btn-secondary px-4 py-2.5 font-pixel text-xs"
                >
                  ← Back: Collection
                </button>
                <button
                  type="button"
                  onClick={validateAndAdvanceFromStep2}
                  className="rpg-btn-primary px-5 py-2.5 font-pixel text-xs"
                >
                  Next: Lore &amp; Trait →
                </button>
              </div>
            </div>

            {/* STEP 3: LORE, QUOTE & POINTLESS TRAIT (`description`, `flavorText`, `uselessTrait`) */}
            <div hidden={activeStep !== 3} className="space-y-5">
              <div className="rpg-slot p-4 space-y-2 text-xs sm:text-sm text-[#cfc3e8]">
                <p className="font-pixel text-[10px] text-[#ffd15c]">
                  CAPTURING THE GIVE A THING VOICE
                </p>
                <p>
                  Treat a mundane, zero-value object with the loving seriousness of a
                  classic 16-bit RPG item screen! Describe tiny scuffs, textures, or
                  how it ended up in a junk drawer, then pair it with a dry quote and
                  a stat that helps nobody.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${baseId}-thing-desc`}
                    className="font-pixel text-xs text-[#fdf6e9]"
                  >
                    Description (<code className="text-[#8ec8ff]">description</code>) *
                  </label>
                  <span className="text-xs text-[#cfc3e8]">
                    {description.trim().length}/500
                  </span>
                </div>
                <p id={`${baseId}-thing-desc-hint`} className="text-xs text-[#cfc3e8]">
                  10–500 characters (2–3 sentences). Describe its physical colors, wear
                  and tear, and charmingly pointless backstory.
                </p>
                <textarea
                  id={`${baseId}-thing-desc`}
                  name="thingDescription"
                  rows={3}
                  required
                  minLength={10}
                  maxLength={500}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setStudioError(null);
                  }}
                  onBlur={() => markTouched("description")}
                  aria-invalid={showFieldError("description", 3)}
                  aria-describedby={buildAriaDescribedBy(
                    `${baseId}-thing-desc-hint`,
                    `${baseId}-thing-desc-err`,
                    showFieldError("description", 3)
                  )}
                  placeholder="e.g., Printed on neon pink cardstock that faded to salmon on one side after spending three summers on a dashboard. Valid only at a snack counter that switched to tokens in 2004."
                  className="rpg-field-control w-full rounded border-2 border-[#9e762a] bg-[#160f24] px-3.5 py-2.5 text-[#fdf6e9] placeholder-[#cfc3e8]/45 focus:border-[#ffd15c] focus:outline-none"
                />
                {showFieldError("description", 3) ? (
                  <p id={`${baseId}-thing-desc-err`} className="text-xs text-[#ff99ac]">
                    Error: {errors.description}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${baseId}-thing-flavor`}
                    className="font-pixel text-xs text-[#fdf6e9]"
                  >
                    Flavor Quote (<code className="text-[#8ec8ff]">flavorText</code>) *
                  </label>
                  <span className="text-xs text-[#cfc3e8]">
                    {flavorText.trim().length}/280
                  </span>
                </div>
                <p
                  id={`${baseId}-thing-flavor-hint`}
                  className="text-xs text-[#cfc3e8]"
                >
                  3–280 characters. A wry one-liner displayed in italics when someone
                  inspects the item (no surrounding quotation marks needed).
                </p>
                <input
                  id={`${baseId}-thing-flavor`}
                  name="thingFlavorText"
                  type="text"
                  required
                  minLength={3}
                  maxLength={280}
                  enterKeyHint="next"
                  value={flavorText}
                  onChange={(e) => {
                    setFlavorText(e.target.value);
                    setStudioError(null);
                  }}
                  onBlur={() => markTouched("flavorText")}
                  aria-invalid={showFieldError("flavorText", 3)}
                  aria-describedby={buildAriaDescribedBy(
                    `${baseId}-thing-flavor-hint`,
                    `${baseId}-thing-flavor-err`,
                    showFieldError("flavorText", 3)
                  )}
                  placeholder="e.g., Admit one to a tray of jalapeños that have long since cooled."
                  className="rpg-field-control w-full rounded border-2 border-[#9e762a] bg-[#160f24] px-3.5 py-2.5 text-[#fdf6e9] placeholder-[#cfc3e8]/45 focus:border-[#ffd15c] focus:outline-none"
                />
                {showFieldError("flavorText", 3) ? (
                  <p
                    id={`${baseId}-thing-flavor-err`}
                    className="text-xs text-[#ff99ac]"
                  >
                    Error: {errors.flavorText}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${baseId}-thing-trait`}
                    className="font-pixel text-xs text-[#fdf6e9]"
                  >
                    Pointless Trait (
                    <code className="text-[#8ec8ff]">uselessTrait</code>) *
                  </label>
                  <span className="text-xs text-[#cfc3e8]">
                    {uselessTrait.trim().length}/80
                  </span>
                </div>
                <p id={`${baseId}-thing-trait-hint`} className="text-xs text-[#cfc3e8]">
                  2–80 characters. A playful RPG stat badge that provides zero actual
                  power (e.g., <em>&ldquo;+2 Wallet Crease&rdquo;</em>,{" "}
                  <em>&ldquo;0% Redeemable&rdquo;</em>,{" "}
                  <em>&ldquo;Faintly Cinnamon-Scented&rdquo;</em>).
                </p>
                <input
                  id={`${baseId}-thing-trait`}
                  name="thingUselessTrait"
                  type="text"
                  required
                  minLength={2}
                  maxLength={80}
                  enterKeyHint="next"
                  value={uselessTrait}
                  onChange={(e) => {
                    setUselessTrait(e.target.value);
                    setStudioError(null);
                  }}
                  onBlur={() => markTouched("uselessTrait")}
                  aria-invalid={showFieldError("uselessTrait", 3)}
                  aria-describedby={buildAriaDescribedBy(
                    `${baseId}-thing-trait-hint`,
                    `${baseId}-thing-trait-err`,
                    showFieldError("uselessTrait", 3)
                  )}
                  placeholder="e.g., +2 Wallet Crease"
                  className="rpg-field-control w-full rounded border-2 border-[#9e762a] bg-[#160f24] px-3.5 py-2.5 text-[#fdf6e9] placeholder-[#cfc3e8]/45 focus:border-[#ffd15c] focus:outline-none"
                />
                {showFieldError("uselessTrait", 3) ? (
                  <p
                    id={`${baseId}-thing-trait-err`}
                    className="text-xs text-[#ff99ac]"
                  >
                    Error: {errors.uselessTrait}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => goToStep(2)}
                  className="rpg-btn-secondary px-4 py-2.5 font-pixel text-xs"
                >
                  ← Back: Identity
                </button>
                <button
                  type="button"
                  onClick={validateAndAdvanceFromStep3}
                  className="rpg-btn-primary px-5 py-2.5 font-pixel text-xs"
                >
                  Next: Artwork &amp; Alt Text →
                </button>
              </div>
            </div>

            {/* STEP 4: ARTWORK & ALT TEXT (`icon` & `iconAlt`) */}
            <div hidden={activeStep !== 4} className="space-y-5">
              <div className="rpg-slot p-4 space-y-2 text-xs sm:text-sm text-[#cfc3e8]">
                <p className="font-pixel text-[10px] text-[#ffd15c]">
                  ARTWORK GUIDELINES · STICKER CUTOUTS &amp; PIXEL ART ENCOURAGED!
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-[#fdf6e9]/90">
                  <li>
                    <strong>Strict upload format:</strong> Custom uploads must be a{" "}
                    <strong>512×512px PNG</strong> file (up to 1 MB).
                  </li>
                  <li>
                    <strong>Recommended look (encouraged, not required):</strong>{" "}
                    Items look best as a{" "}
                    <strong>
                      cutout image like a die-cut sticker with a transparent
                      background
                    </strong>
                    , and <strong>ideally pixel-art</strong> so they feel right at home
                    in everyone&apos;s inventory!
                  </li>
                  <li>
                    <strong>Or generate automatically:</strong> Don&apos;t have art
                    drawn yet? Choose <em>Generate in Our Standard Style</em> to paint
                    a 16-bit cutout sprite directly from the fields you wrote in Steps
                    1–3!
                  </li>
                </ul>
              </div>

              <fieldset className="space-y-3 rounded border-2 border-[#9e762a]/70 bg-[#251a3c]/70 p-4">
                <legend className="px-2 font-pixel text-[11px] text-[#ffd15c]">
                  Choose How to Supply This Thing&apos;s Icon (<code>icon</code>)
                </legend>

                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <input
                      id={`${baseId}-mode-upload`}
                      type="radio"
                      name="artworkMode"
                      checked={artworkMode === "upload"}
                      onChange={() => setArtworkMode("upload")}
                      className="h-4 w-4 accent-[#ffd15c]"
                    />
                    <label
                      htmlFor={`${baseId}-mode-upload`}
                      className="text-sm font-medium text-[#fdf6e9] cursor-pointer"
                    >
                      Upload 512×512px PNG
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id={`${baseId}-mode-generate`}
                      type="radio"
                      name="artworkMode"
                      checked={artworkMode === "generated"}
                      onChange={() => setArtworkMode("generated")}
                      className="h-4 w-4 accent-[#ffd15c]"
                    />
                    <label
                      htmlFor={`${baseId}-mode-generate`}
                      className="text-sm font-medium text-[#fdf6e9] cursor-pointer"
                    >
                      Generate in Our Standard Style
                    </label>
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-[1fr_auto] items-center pt-2">
                  {artworkMode === "upload" ? (
                    <div className="space-y-2.5">
                      <label
                        htmlFor={`${baseId}-png-file`}
                        className="block font-pixel text-xs text-[#8ec8ff]"
                      >
                        Select a 512×512px PNG Image
                      </label>
                      <input
                        ref={fileInputRef}
                        id={`${baseId}-png-file`}
                        name="spritePngFile"
                        type="file"
                        accept="image/png"
                        onChange={handlePngUpload}
                        className="block w-full text-xs text-[#cfc3e8] file:mr-3 file:rounded file:border-2 file:border-[#fff6d9] file:bg-[#ffd15c] file:px-3.5 file:py-2 file:font-pixel file:text-[10px] file:text-[#1f1204] hover:file:brightness-105 cursor-pointer"
                      />
                      {uploadError ? (
                        <p role="alert" className="text-xs text-[#ff99ac]">
                          Error: {uploadError}
                        </p>
                      ) : null}
                      {spriteTransparencyNote === "transparent" ? (
                        <p className="text-xs text-[#4be3a0]">
                          ✓ 512×512px PNG verified—transparent sticker cutout detected!
                        </p>
                      ) : spriteTransparencyNote === "opaque" ? (
                        <p className="text-xs text-[#ffd15c]">
                          ✓ 512×512px PNG verified! (Tip: a transparent cutout
                          background is encouraged if you want a sticker silhouette,
                          though solid backgrounds are allowed too.)
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-xs sm:text-sm text-[#cfc3e8]">
                        Uses your item&apos;s name (
                        <strong>{name.trim() || "…"}</strong>), collection (
                        <strong>{collectionName.trim() || "…"}</strong>), description,
                        quote, and pointless trait to conjure a 512×512 transparent
                        sprite in Give a Thing&apos;s standard 16-bit style.
                      </p>
                      <button
                        type="button"
                        disabled={generatingSprite}
                        onClick={handleGenerateStandardSprite}
                        className="rpg-btn-blue inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
                      >
                        {generatingSprite ? (
                          <>
                            <Loader2
                              className="h-4 w-4 animate-spin"
                              aria-hidden="true"
                            />
                            Painting 16-Bit Sprite…
                          </>
                        ) : (
                          <>
                            <Wand2 className="h-4 w-4" aria-hidden="true" />
                            {spriteDataUrl
                              ? "Regenerate Standard Sprite"
                              : "Generate Standard Sprite"}
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* 512x512 Preview Frame */}
                  <div className="mx-auto flex flex-col items-center gap-1.5">
                    <div
                      className="rpg-slot flex h-36 w-36 items-center justify-center overflow-hidden p-2"
                      style={{
                        backgroundImage:
                          "repeating-conic-gradient(rgba(255,255,255,0.04) 0% 25%, transparent 0% 50%)",
                        backgroundSize: "16px 16px",
                      }}
                    >
                      {spriteDataUrl ? (
                        <img
                          src={spriteDataUrl}
                          alt={iconAlt.trim() || name.trim() || "Thing sprite preview"}
                          className="pixel-art h-full w-full object-contain"
                        />
                      ) : (
                        <div className="text-center text-[#cfc3e8]/55 space-y-1 px-2">
                          <ImagePlus
                            className="mx-auto h-7 w-7"
                            aria-hidden="true"
                          />
                          <span className="block font-pixel text-[9px]">
                            512×512 PNG
                          </span>
                        </div>
                      )}
                    </div>
                    {showFieldError("sprite", 4) ? (
                      <p className="max-w-[11rem] text-center text-[11px] text-[#ff99ac]">
                        {errors.sprite}
                      </p>
                    ) : null}
                  </div>
                </div>
              </fieldset>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <label
                    htmlFor={`${baseId}-thing-alt`}
                    className="font-pixel text-xs text-[#fdf6e9]"
                  >
                    Sprite Alt Text (<code className="text-[#8ec8ff]">iconAlt</code>) *
                  </label>
                  <span className="text-xs text-[#cfc3e8]">
                    {iconAlt.trim().length}/300
                  </span>
                </div>
                <p id={`${baseId}-thing-alt-hint`} className="text-xs text-[#cfc3e8]">
                  5–300 characters. Describe the visual artwork clearly for screen
                  readers (shapes, colors, and details).
                </p>
                <input
                  id={`${baseId}-thing-alt`}
                  name="thingIconAlt"
                  type="text"
                  required
                  minLength={5}
                  maxLength={300}
                  enterKeyHint="done"
                  value={iconAlt}
                  onChange={(e) => {
                    setIconAlt(e.target.value);
                    setStudioError(null);
                  }}
                  onBlur={() => markTouched("iconAlt")}
                  aria-invalid={showFieldError("iconAlt", 4)}
                  aria-describedby={buildAriaDescribedBy(
                    `${baseId}-thing-alt-hint`,
                    `${baseId}-thing-alt-err`,
                    showFieldError("iconAlt", 4)
                  )}
                  placeholder="e.g., Pixel-art sticker of a salmon-faded ticket stub with tiny red nacho lettering and a torn corner."
                  className="rpg-field-control w-full rounded border-2 border-[#9e762a] bg-[#160f24] px-3.5 py-2.5 text-[#fdf6e9] placeholder-[#cfc3e8]/45 focus:border-[#ffd15c] focus:outline-none"
                />
                {showFieldError("iconAlt", 4) ? (
                  <p id={`${baseId}-thing-alt-err`} className="text-xs text-[#ff99ac]">
                    Error: {errors.iconAlt}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => goToStep(3)}
                  className="rpg-btn-secondary px-4 py-2.5 font-pixel text-xs"
                >
                  ← Back: Lore &amp; Trait
                </button>
                <button
                  type="button"
                  onClick={handleSaveItemToTray}
                  className="rpg-btn-primary inline-flex items-center gap-2 px-5 py-2.5 font-pixel text-xs"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  {editingLocalId
                    ? "Update Thing in Collection Tray →"
                    : "Save Thing to Collection Tray →"}
                </button>
              </div>
            </div>

            {/* STEP 5: COLLECTION TRAY & PUBLISH MYSTERY BOX */}
            <div hidden={activeStep !== 5} className="space-y-5">
              <div className="rpg-slot p-4 space-y-2 text-xs sm:text-sm text-[#cfc3e8]">
                <p className="font-pixel text-[10px] text-[#ffd15c]">
                  COLLECTION UNIQUENESS &amp; PDS OWNERSHIP RULES
                </p>
                <ul className="list-disc pl-5 space-y-1 text-xs text-[#fdf6e9]/90">
                  <li>
                    <strong>At least {MIN_COLLECTION_ITEMS} unique things:</strong>{" "}
                    Every item in <strong>{collectionName.trim() || "your set"}</strong>{" "}
                    must be a one-of-a-kind thing—double-check that none of your items
                    repeat the same design over and over!
                  </li>
                  <li>
                    <strong>Stored in your PDS:</strong> Publishing mints each genesis{" "}
                    <code className="text-[#8ec8ff]">com.giveathing.thing</code> record
                    in your own Personal Data Server (PDS) with{" "}
                    <code className="text-[#8ec8ff]">createdBy</code> set to your DID,
                    meaning you can revoke &amp; destroy any created thing at any time.
                  </li>
                  <li>
                    <strong>Profile Mystery Box:</strong> Free collections let
                    other players draw once per day, while paid collections have
                    no daily cooldown so buyers can purchase as many pulls as
                    they want until the box runs out!
                  </li>
                </ul>
              </div>

              {/* Mystery Box Pricing, Payout Method & Give a Thing Support % */}
              <CollectionPricingFields
                payoutStatus={payoutStatus}
                onboardingBusy={onboardingBusy}
                onStartOnboarding={handleStartPayoutOnboarding}
                value={draftPricing}
                onChange={setDraftPricing}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-pixel text-xs text-[#fdf6e9]">
                  STAGED THINGS IN &ldquo;{collectionName.trim() || "UNTITLED SET"}
                  &rdquo; ({draftItems.length}/{MIN_COLLECTION_ITEMS} MINIMUM)
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    resetCurrentItemFields();
                    goToStep(2);
                  }}
                  className="rpg-btn-blue inline-flex items-center gap-1.5 px-4 py-2 font-pixel text-[11px]"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Craft Another Unique Thing
                </button>
              </div>

              {draftItems.length === 0 ? (
                <div className="rpg-slot p-8 text-center space-y-3">
                  <p className="font-pixel text-xs text-[#ffd15c]">
                    YOUR COLLECTION TRAY IS EMPTY
                  </p>
                  <p className="text-sm text-[#cfc3e8] max-w-md mx-auto">
                    Walk through Steps 2–4 to craft at least {MIN_COLLECTION_ITEMS}{" "}
                    unique things for this Mystery Box collection!
                  </p>
                  <button
                    type="button"
                    onClick={() => goToStep(2)}
                    className="rpg-btn-primary inline-flex items-center gap-2 px-4 py-2.5 font-pixel text-xs"
                  >
                    Craft Thing #1 →
                  </button>
                </div>
              ) : (
                <div className="thing-grid">
                  {draftItems.map((item, idx) => (
                    <article
                      key={item.localId}
                      className="rpg-panel-subtle p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="rpg-slot flex h-20 w-20 shrink-0 items-center justify-center p-1.5">
                          <img
                            src={item.spriteDataUrl}
                            alt={item.iconAlt}
                            className="pixel-art h-full w-full object-contain"
                          />
                        </div>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-pixel text-[10px] text-[#ffd15c]">
                              ITEM #{idx + 1}
                            </span>
                            <span className="rounded bg-[#160f24] px-2 py-0.5 text-[10px] text-[#8ec8ff] truncate">
                              {item.subcategory}
                            </span>
                          </div>
                          <h4 className="font-bold text-sm text-[#fdf6e9] leading-snug">
                            {item.name}
                          </h4>
                          <p className="text-xs italic text-[#cfc3e8] line-clamp-2">
                            &ldquo;{item.flavorText}&rdquo;
                          </p>
                          <span className="inline-block rounded border border-[#4be3a0]/40 bg-[#160f24] px-2 py-0.5 text-[11px] text-[#4be3a0]">
                            {item.uselessTrait}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 border-t border-[#9e762a]/40 pt-2.5">
                        <button
                          type="button"
                          onClick={() => handleEditDraftItem(item)}
                          className="rpg-btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 font-pixel text-[10px] text-[#8ec8ff]"
                        >
                          <Edit3 className="h-3 w-3" aria-hidden="true" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveDraftItem(item.localId)}
                          className="rpg-btn-secondary inline-flex items-center gap-1 px-2.5 py-1.5 font-pixel text-[10px] text-[#ff99ac]"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t-2 border-[#9e762a]/50 pt-4">
                <button
                  type="button"
                  onClick={() => goToStep(1)}
                  className="rpg-btn-secondary px-4 py-2.5 font-pixel text-xs"
                >
                  ← Edit Collection Name
                </button>

                <button
                  type="submit"
                  disabled={publishing}
                  className="rpg-btn-red inline-flex items-center gap-2 px-5 py-3 font-pixel text-xs"
                >
                  {publishing ? (
                    <>
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Minting to Your PDS…
                    </>
                  ) : (
                    <>
                      <Gift className="h-4 w-4" aria-hidden="true" />
                      Complete &amp; Publish Collection ({draftItems.length}/
                      {MIN_COLLECTION_ITEMS}+)
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* TAB 2: MANAGE PUBLISHED COLLECTIONS & REVOKE/DESTROY THINGS */}
        <section
          role="tabpanel"
          id={`${baseId}-panel-manage`}
          aria-labelledby={`${baseId}-tab-manage`}
          hidden={studioTab !== "manage"}
          className="space-y-6"
        >
          {collections.length === 0 ? (
            <div className="rpg-panel p-6 sm:p-8 text-center space-y-3">
              <p className="font-pixel text-sm text-[#ffd15c]">
                NO PUBLISHED COLLECTIONS YET
              </p>
              <p className="text-sm text-[#cfc3e8] max-w-md mx-auto">
                Once you complete and publish a collection of at least{" "}
                {MIN_COLLECTION_ITEMS} unique things, you can monitor Mystery Box
                draws and manage your PDS genesis records right here.
              </p>
              <button
                type="button"
                onClick={() => setStudioTab("create")}
                className="rpg-btn-primary px-4 py-2.5 font-pixel text-xs"
              >
                Start Your First Collection
              </button>
            </div>
          ) : (
            collections.map((col) => (
              <article
                key={col.collectionTid}
                className="rpg-panel p-5 sm:p-6 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-[#9e762a]/50 pb-3.5">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-pixel text-sm sm:text-base text-[#ffd15c]">
                        {col.name}
                      </h2>
                      {col.priceCents > 0 ? (
                        <span className="rounded border border-[#ffd15c]/70 bg-[#160f24] px-2.5 py-0.5 font-pixel text-[9px] text-[#ffd15c]">
                          {formatUsdCents(col.priceCents)} / PULL
                          {col.platformFeeBps > 0
                            ? ` · ${bpsToPercentDisplay(col.platformFeeBps)} SUPPORT`
                            : ""}
                        </span>
                      ) : (
                        <span className="rounded border border-[#8ec8ff]/55 bg-[#160f24] px-2.5 py-0.5 font-pixel text-[9px] text-[#8ec8ff]">
                          FREE · 1 / DAY
                        </span>
                      )}
                      {col.unclaimedCount > 0 ? (
                        <span className="rounded border border-[#4be3a0]/60 bg-[#160f24] px-2.5 py-0.5 font-pixel text-[9px] text-[#4be3a0]">
                          LIVE ON PROFILE · {col.unclaimedCount} LEFT
                        </span>
                      ) : (
                        <span className="rounded border border-[#9e762a]/60 bg-[#160f24] px-2.5 py-0.5 font-pixel text-[9px] text-[#cfc3e8]">
                          ALL CLAIMED · HIDDEN FROM PROFILE
                        </span>
                      )}
                    </div>
                    {col.description ? (
                      <p className="text-xs sm:text-sm text-[#cfc3e8]">
                        {col.description}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="text-xs text-[#cfc3e8]">
                      {col.claimedCount} claimed · {col.unclaimedCount} in Mystery Box
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditPriceError(null);
                        setEditPriceForm(
                          pricingStateFromCollection(
                            col.priceCents,
                            col.platformFeeBps
                          )
                        );
                        setEditingPriceCollection(col);
                      }}
                      className="rpg-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 font-pixel text-[10px]"
                    >
                      <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                      {col.priceCents > 0 ? "Change Price" : "Set Price"}
                    </button>
                  </div>
                </div>

                {col.items.length === 0 ? (
                  <p className="text-xs italic text-[#cfc3e8]">
                    All items in this collection have been revoked and destroyed.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {col.items.map((item) => (
                      <div
                        key={item.thingTid}
                        className="rpg-slot p-3 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={item.iconUrl}
                            alt={item.iconAlt}
                            className="pixel-art h-12 w-12 shrink-0 rounded bg-[#251a3c]/70 p-1 object-contain"
                          />
                          <div className="min-w-0">
                            <p className="font-pixel text-[9px] text-[#ffd15c]">
                              #{String(item.catalogNumber).padStart(4, "0")} ·{" "}
                              {item.status === "unclaimed"
                                ? "IN MYSTERY BOX"
                                : `HELD BY @${item.currentOwnerHandle}`}
                            </p>
                            {item.status === "unclaimed" ? (
                              <p className="font-bold text-xs sm:text-sm text-[#fdf6e9] truncate">
                                {item.name}
                              </p>
                            ) : (
                              <Link
                                href={`/thing/${item.thingTid}`}
                                className="font-bold text-xs sm:text-sm text-[#8ec8ff] hover:underline truncate block"
                              >
                                {item.name}
                              </Link>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setRevokeError(null);
                            setRevokeTarget(item);
                          }}
                          className="rpg-btn-secondary shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 font-pixel text-[9px] text-[#ff99ac]"
                        >
                          <Trash2 className="h-3 w-3" aria-hidden="true" />
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      </div>

      {/* Edit Existing Collection Price Modal */}
      <RpgModal
        open={Boolean(editingPriceCollection)}
        onClose={() => {
          if (!savingPrice) setEditingPriceCollection(null);
        }}
        title="MYSTERY BOX PRICING"
      >
        {editingPriceCollection ? (
          <form onSubmit={handleSaveEditedPrice} className="space-y-4">
            <p className="text-xs sm:text-sm text-[#cfc3e8]">
              Configure per-pull pricing for{" "}
              <strong className="text-[#fdf6e9]">
                {editingPriceCollection.name}
              </strong>
              . Changes apply immediately on your profile!
            </p>

            <CollectionPricingFields
              payoutStatus={payoutStatus}
              onboardingBusy={onboardingBusy}
              onStartOnboarding={handleStartPayoutOnboarding}
              value={editPriceForm}
              onChange={setEditPriceForm}
            />

            {editPriceError ? (
              <p role="alert" className="text-xs text-[#ff99ac]">
                Error: {editPriceError}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={savingPrice}
                onClick={() => setEditingPriceCollection(null)}
                className="rpg-btn-secondary px-4 py-2 font-pixel text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPrice}
                className="rpg-btn-primary inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
              >
                {savingPrice ? (
                  <>
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                    Saving…
                  </>
                ) : (
                  <>
                    <Coins className="h-3.5 w-3.5" aria-hidden="true" />
                    Save Price
                  </>
                )}
              </button>
            </div>
          </form>
        ) : null}
      </RpgModal>

      {/* Destructive Confirmation Modal (`dialog` guide: autofocus on safe Cancel action) */}
      <RpgModal
        open={Boolean(revokeTarget)}
        onClose={() => {
          if (!revoking) setRevokeTarget(null);
        }}
        title="REVOKE & DESTROY THING?"
      >
        {revokeTarget ? (
          <div className="space-y-4">
            <p className="text-sm text-[#fdf6e9] leading-relaxed">
              Are you sure you want to permanently revoke and destroy{" "}
              <strong>
                #{String(revokeTarget.catalogNumber).padStart(4, "0")}{" "}
                {revokeTarget.name}
              </strong>
              ?
            </p>
            <p className="text-xs text-[#cfc3e8] leading-relaxed">
              Because its genesis <code className="text-[#8ec8ff]">.thing</code>{" "}
              record lives in your Personal Data Server (PDS), revoking it will
              delete the genesis record from your PDS and remove the item from{" "}
              {revokeTarget.status === "unclaimed"
                ? "your profile Mystery Box."
                : `@${revokeTarget.currentOwnerHandle}'s inventory and the catalog.`}
            </p>

            {revokeError ? (
              <p role="alert" className="text-xs text-[#ff99ac]">
                Error: {revokeError}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                autoFocus
                disabled={revoking}
                onClick={() => setRevokeTarget(null)}
                className="rpg-btn-secondary px-4 py-2 font-pixel text-xs"
              >
                Keep Thing
              </button>
              <button
                type="button"
                disabled={revoking}
                onClick={handleConfirmRevoke}
                className="rpg-btn-red inline-flex items-center gap-2 px-4 py-2 font-pixel text-xs"
              >
                {revoking ? (
                  <>
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                    Destroying…
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Revoke &amp; Destroy
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}
      </RpgModal>
    </div>
  );
}
