import { cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";

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
  if (word.endsWith("es") && (word.endsWith("ches") || word.endsWith("shes") || word.endsWith("xes") || word.endsWith("sses"))) {
    return word.slice(0, -2);
  }
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) {
    return word.slice(0, -1);
  }
  return word;
}

/**
 * Produces a deterministic order-independent fingerprint of a Thing's name
 * so reordered or trivially punctuated variants collide immediately.
 */
export function computeCanonicalFingerprint(name: string): string {
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

/**
 * Identifies adjectives/nouns appearing frequently across recent pulls so
 * `gemini-4-carbon` actively avoids repetitive verbal tics.
 */
export function findOverusedWords(recentNames: string[], maxWords = 24): string[] {
  const counts = new Map<string, number>();
  for (const name of recentNames) {
    const words = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
    for (const w of new Set(words)) {
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxWords)
    .map(([word]) => word);
}

export interface CollisionMatch {
  catalogNumber: number;
  name: string;
  category: string;
  similarity: number;
  reason: "exact_fingerprint" | "semantic_vector";
}

export const SEMANTIC_SIMILARITY_THRESHOLD = 0.855;

/**
 * Checks both Layer 2 (canonical string fingerprint) and Layer 3 (pgvector HNSW
 * cosine similarity across ALL discovered Things in history).
 */
export async function checkCatalogCollision(
  db: PostgresJsDatabase<typeof schema>,
  candidateName: string,
  candidateEmbedding: number[]
): Promise<CollisionMatch | null> {
  const fingerprint = computeCanonicalFingerprint(candidateName);

  const [exactRows, exactCachedRows] = await Promise.all([
    db
      .select({
        catalogNumber: schema.things.catalogNumber,
        name: schema.things.name,
        category: schema.things.category,
      })
      .from(schema.things)
      .where(eq(schema.things.canonicalFingerprint, fingerprint))
      .limit(1),
    db
      .select({
        name: schema.dailyPullCache.name,
        category: schema.dailyPullCache.category,
      })
      .from(schema.dailyPullCache)
      .where(eq(schema.dailyPullCache.canonicalFingerprint, fingerprint))
      .limit(1),
  ]);

  if (exactRows[0]) {
    return {
      catalogNumber: exactRows[0].catalogNumber,
      name: exactRows[0].name,
      category: exactRows[0].category,
      similarity: 1.0,
      reason: "exact_fingerprint",
    };
  }
  if (exactCachedRows[0]) {
    return {
      catalogNumber: 0,
      name: exactCachedRows[0].name,
      category: exactCachedRows[0].category,
      similarity: 1.0,
      reason: "exact_fingerprint",
    };
  }

  const similarityExpr = sql<number>`1 - (${cosineDistance(
    schema.things.embedding,
    candidateEmbedding
  )})`;
  const cacheSimilarityExpr = sql<number>`1 - (${cosineDistance(
    schema.dailyPullCache.embedding,
    candidateEmbedding
  )})`;

  const [semanticRows, semanticCachedRows] = await Promise.all([
    db
      .select({
        catalogNumber: schema.things.catalogNumber,
        name: schema.things.name,
        category: schema.things.category,
        similarity: similarityExpr,
      })
      .from(schema.things)
      .where(gt(similarityExpr, SEMANTIC_SIMILARITY_THRESHOLD))
      .orderBy((t) => desc(t.similarity))
      .limit(1),
    db
      .select({
        name: schema.dailyPullCache.name,
        category: schema.dailyPullCache.category,
        similarity: cacheSimilarityExpr,
      })
      .from(schema.dailyPullCache)
      .where(gt(cacheSimilarityExpr, SEMANTIC_SIMILARITY_THRESHOLD))
      .orderBy((t) => desc(t.similarity))
      .limit(1),
  ]);

  if (semanticRows[0]) {
    return {
      catalogNumber: semanticRows[0].catalogNumber,
      name: semanticRows[0].name,
      category: semanticRows[0].category,
      similarity: Number(semanticRows[0].similarity),
      reason: "semantic_vector",
    };
  }
  if (semanticCachedRows[0]) {
    return {
      catalogNumber: 0,
      name: semanticCachedRows[0].name,
      category: semanticCachedRows[0].category,
      similarity: Number(semanticCachedRows[0].similarity),
      reason: "semantic_vector",
    };
  }

  return null;
}
