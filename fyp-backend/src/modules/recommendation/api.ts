import {
  parseRecommendationArtifact,
  readRecommendationArtifact,
  type ArtifactFailure,
  type RecommendationArtifact,
} from "./artifact"

const MAX_RESPONSE_BYTES = 256 * 1024
type RequestContext = { customerId?: string; productId?: string }
type Result =
  | {
      artifact: RecommendationArtifact
      reason?: never
      transport: "api" | "file"
    }
  | {
      artifact?: never
      reason:
        | ArtifactFailure
        | "api_timeout"
        | "api_unavailable"
        | "api_invalid"
        | "api_not_configured"
      transport: "api" | "file"
    }

/** The API chooses one strategy; normalize it for the existing live-product gate. */
export function parseApiRecommendations(
  value: unknown,
  context: RequestContext
) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid recommendation response")
  const data = value as Record<string, unknown>
  const strategy = data.strategy
  if (
    !["by_user", "by_product", "fallback", "empty"].includes(
      String(strategy)
    ) ||
    data.personalized !== (strategy === "by_user") ||
    (strategy === "by_user" && !context.customerId) ||
    (strategy === "by_product" && !context.productId) ||
    !Array.isArray(data.recommendations) ||
    data.recommendations.length > 24 ||
    (strategy === "empty" && data.recommendations.length !== 0) ||
    data.count !== data.recommendations.length
  )
    throw new Error("Invalid recommendation response")
  return parseRecommendationArtifact({
    source: data.source,
    model_version: data.model_version,
    generated_at: data.generated_at,
    by_user:
      strategy === "by_user"
        ? { [context.customerId!]: data.recommendations }
        : {},
    by_product:
      strategy === "by_product"
        ? { [context.productId!]: data.recommendations }
        : {},
    fallback:
      strategy === "fallback" || strategy === "empty"
        ? data.recommendations
        : [],
  })
}

/** Backend-owned URL and secret only; no caller headers, paths or URLs are forwarded. */
export async function readApiRecommendations(
  context: RequestContext
): Promise<Result> {
  const base = process.env.RECOMMENDATIONS_API_URL?.trim()
  const key = process.env.RECOMMENDATIONS_API_KEY?.trim()
  if (!base || !key) return { reason: "api_not_configured", transport: "api" }
  const timeout = process.env.RECOMMENDATIONS_API_TIMEOUT_MS ?? "1500"
  const maxAge = process.env.RECOMMENDATIONS_MAX_AGE_SECONDS ?? "86400"
  let url: URL
  try {
    url = new URL(base)
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        )) ||
      !/^\d+$/.test(timeout) ||
      Number(timeout) < 100 ||
      Number(timeout) > 10000 ||
      !/^\d+$/.test(maxAge) ||
      Number(maxAge) < 60 ||
      Number(maxAge) > 2592000
    )
      throw new Error()
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/recommendations`
    // Fetch the API's maximum candidate page before local channel filtering.
    url.searchParams.set("limit", "24")
    if (context.customerId)
      url.searchParams.set("customer_id", context.customerId)
    if (context.productId) url.searchParams.set("product_id", context.productId)
  } catch {
    return { reason: "api_invalid", transport: "api" }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Number(timeout))
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "X-API-Key": key, Accept: "application/json" },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    })
    reader = response.body?.getReader()
    if (!response.ok) return { reason: "api_unavailable", transport: "api" }
    if (
      !reader ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      return { reason: "api_invalid", transport: "api" }
    const length = response.headers.get("content-length")
    if (length && Number(length) > MAX_RESPONSE_BYTES)
      return { reason: "api_invalid", transport: "api" }
    const chunks: Buffer[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES)
        return { reason: "api_invalid", transport: "api" }
      chunks.push(Buffer.from(value))
    }
    let artifact: RecommendationArtifact
    try {
      artifact = parseApiRecommendations(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
        context
      )
    } catch {
      return { reason: "api_invalid", transport: "api" }
    }
    const age = Date.now() - Date.parse(artifact.generated_at)
    if (age < -300000) return { reason: "api_invalid", transport: "api" }
    if (age > Number(maxAge) * 1000)
      return { reason: "expired", transport: "api" }
    return { artifact, transport: "api" }
  } catch {
    // Never return/log the request URL, API key, provider body or customer identity.
    return {
      reason: controller.signal.aborted ? "api_timeout" : "api_unavailable",
      transport: "api",
    }
  } finally {
    clearTimeout(timer)
    await reader?.cancel().catch(() => undefined)
  }
}

export async function readRecommendationSource(
  context: RequestContext
): Promise<Result> {
  // A configured API is authoritative: failures fall back to rules, not stale files.
  if (process.env.RECOMMENDATIONS_API_URL?.trim())
    return readApiRecommendations(context)
  const result = await readRecommendationArtifact()
  return { ...result, transport: "file" }
}
