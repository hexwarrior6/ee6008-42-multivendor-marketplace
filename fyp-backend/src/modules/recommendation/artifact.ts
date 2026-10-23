import { open } from "node:fs/promises"

export const ARTIFACT_MAX_BYTES = 8 * 1024 * 1024
export const MODEL_CANDIDATE_LIMIT = 200
export type ModelItem = {
  product_id: string
  score: number
  reason?: string | null
}
export type RecommendationArtifact = {
  source: "svd" | "als" | "lightfm" | "content"
  model_version: string
  generated_at: string
  by_user: Record<string, ModelItem[]>
  by_product: Record<string, ModelItem[]>
  fallback: ModelItem[]
}
export type ArtifactFailure =
  | "not_configured"
  | "unavailable"
  | "invalid"
  | "expired"
type ArtifactResult =
  | { artifact: RecommendationArtifact; reason?: never }
  | { artifact?: never; reason: ArtifactFailure }
const id = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(value)
const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
const items = (value: unknown): value is ModelItem[] =>
  Array.isArray(value) &&
  value.length <= MODEL_CANDIDATE_LIMIT &&
  value.every(
    (item) =>
      object(item) &&
      id(item.product_id) &&
      typeof item.score === "number" &&
      Number.isFinite(item.score) &&
      (item.reason == null ||
        (typeof item.reason === "string" && item.reason.length <= 256))
  )
const mapping = (value: unknown): value is Record<string, ModelItem[]> =>
  object(value) &&
  Object.entries(value).every(([key, list]) => id(key) && items(list))

export function parseRecommendationArtifact(
  value: unknown
): RecommendationArtifact {
  if (
    !object(value) ||
    !["svd", "als", "lightfm", "content"].includes(String(value.source)) ||
    typeof value.model_version !== "string" ||
    !/^[a-zA-Z0-9._-]{1,128}$/.test(value.model_version) ||
    typeof value.generated_at !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(
      value.generated_at
    ) ||
    !Number.isFinite(Date.parse(value.generated_at)) ||
    new Date(value.generated_at).toISOString().replace(".000Z", "Z") !==
      value.generated_at.replace(".000Z", "Z") ||
    !mapping(value.by_user) ||
    !mapping(value.by_product) ||
    !items(value.fallback)
  ) {
    throw new Error("Invalid S4 recommendation artifact")
  }
  // Ignore export-time product titles/URLs: the API rehydrates current visible products.
  return value as RecommendationArtifact
}

/** Operator-controlled local file only. Never fetch a caller-supplied URL or path. */
export async function readRecommendationArtifact(
  file = process.env.RECOMMENDATIONS_FILE,
  maxAge = process.env.RECOMMENDATIONS_MAX_AGE_SECONDS ?? "86400",
  now = Date.now()
): Promise<ArtifactResult> {
  if (!file) return { reason: "not_configured" }
  if (!/^\d+$/.test(maxAge) || Number(maxAge) < 60 || Number(maxAge) > 2592000)
    return { reason: "invalid" }
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(file, "r")
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size < 2 || stat.size > ARTIFACT_MAX_BYTES)
      return { reason: "invalid" }
    // Bounded read also catches an in-place writer growing the file after stat.
    // Publishers should atomically rename a completed export instead.
    const buffer = Buffer.alloc(stat.size + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    if (bytesRead !== stat.size) return { reason: "invalid" }
    const artifact = parseRecommendationArtifact(
      JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"))
    )
    const age = now - Date.parse(artifact.generated_at)
    if (age < -300000) return { reason: "invalid" }
    if (age > Number(maxAge) * 1000) return { reason: "expired" }
    return { artifact }
  } catch (error) {
    return {
      reason:
        error instanceof SyntaxError ||
        (error instanceof Error &&
          error.message === "Invalid S4 recommendation artifact")
          ? "invalid"
          : "unavailable",
    }
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

export function recommendationLists(
  artifact: RecommendationArtifact,
  customerId?: string,
  productId?: string
) {
  const own = (map: Record<string, ModelItem[]>, key?: string) =>
    key && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : []
  return [
    { strategy: "by_user" as const, items: own(artifact.by_user, customerId) },
    {
      strategy: "by_product" as const,
      items: own(artifact.by_product, productId),
    },
    { strategy: "fallback" as const, items: artifact.fallback },
  ]
}
