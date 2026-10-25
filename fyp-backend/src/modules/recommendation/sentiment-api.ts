import type {
  SentimentAnalyticsResponse,
  SentimentSummary,
} from "../../api/contracts"

const MAX_RESPONSE_BYTES = 256 * 1024
const ID = /^[a-zA-Z0-9_-]{1,128}$/
const VERSION = /^[a-zA-Z0-9._-]{1,128}$/
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/

const object = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value)
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max
const terms = (value: unknown): value is Array<[string, number]> =>
  Array.isArray(value) &&
  value.length <= 100 &&
  value.every(
    (term) =>
      Array.isArray(term) &&
      term.length === 2 &&
      typeof term[0] === "string" &&
      term[0].trim().length > 0 &&
      term[0].length <= 128 &&
      integer(term[1]) &&
      term[1] > 0
  )

function emptySentiment(storeId?: string): SentimentAnalyticsResponse {
  return {
    summary: null,
    dimension: "unavailable",
    context: storeId ? { store_id: storeId } : {},
    model_version: null,
    generated_at: null,
    source: "unavailable",
  }
}

function parseSummary(value: unknown): SentimentSummary {
  if (!object(value)) throw new Error("Invalid sentiment summary")
  const total = value.total
  const positive = value.positive
  const neutral = value.neutral
  const negative = value.negative
  if (
    !integer(total) ||
    !integer(positive) ||
    !integer(neutral) ||
    !integer(negative) ||
    positive + neutral + negative !== total ||
    !finite(value.positive_ratio, 0, 1) ||
    !finite(value.negative_ratio, 0, 1) ||
    !finite(value.average_score, -1, 1) ||
    !finite(value.average_rating, 0, 5) ||
    !terms(value.top_positive_terms) ||
    !terms(value.top_negative_terms)
  ) {
    throw new Error("Invalid sentiment summary")
  }
  const ratio = (count: number) => (total ? count / total : 0)
  if (
    Math.abs(value.positive_ratio - ratio(positive)) > 0.001 ||
    Math.abs(value.negative_ratio - ratio(negative)) > 0.001
  ) {
    throw new Error("Invalid sentiment summary")
  }
  return value as SentimentSummary
}

export function parseApiSentiment(
  value: unknown,
  storeId?: string
): SentimentAnalyticsResponse {
  if (!object(value) || !object(value.context))
    throw new Error("Invalid sentiment response")
  const dimension = value.dimension
  const contextStoreId = value.context.store_id
  if (
    !["store", "overall", "unavailable"].includes(String(dimension)) ||
    (contextStoreId !== undefined &&
      (typeof contextStoreId !== "string" || !ID.test(contextStoreId))) ||
    (storeId
      ? contextStoreId !== storeId
      : Object.prototype.hasOwnProperty.call(value.context, "store_id")) ||
    (value.model_version !== null &&
      (typeof value.model_version !== "string" ||
        !VERSION.test(value.model_version))) ||
    (value.generated_at !== null &&
      (typeof value.generated_at !== "string" ||
        !ISO_UTC.test(value.generated_at) ||
        !Number.isFinite(Date.parse(value.generated_at)))) ||
    typeof value.source !== "string" ||
    value.source.length < 1 ||
    value.source.length > 128
  ) {
    throw new Error("Invalid sentiment response")
  }
  if (value.summary === null) {
    if (dimension !== "unavailable")
      throw new Error("Invalid sentiment response")
    return emptySentiment(storeId)
  }
  if (
    (storeId && dimension !== "store") ||
    (!storeId && dimension !== "overall") ||
    value.model_version === null ||
    value.generated_at === null
  ) {
    throw new Error("Invalid sentiment response")
  }
  const summary = parseSummary(value.summary)
  // A zero-review artifact is an empty result, not a successful data card.
  if (summary.total === 0) return emptySentiment(storeId)
  return {
    summary,
    dimension,
    context: storeId ? { store_id: storeId } : {},
    model_version: value.model_version,
    generated_at: value.generated_at,
    source: value.source,
  } as SentimentAnalyticsResponse
}

/** Read the backend-only S4 endpoint; every provider failure degrades to empty data. */
export async function readApiSentiment(options: {
  storeId?: string
}): Promise<SentimentAnalyticsResponse> {
  const storeId = options.storeId
  const base = process.env.RECOMMENDATIONS_API_URL?.trim()
  const key = process.env.RECOMMENDATIONS_API_KEY?.trim()
  if (!base || !key || (storeId !== undefined && !ID.test(storeId)))
    return emptySentiment(storeId)
  const timeout = process.env.RECOMMENDATIONS_API_TIMEOUT_MS ?? "1500"
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
      Number(timeout) > 10000
    ) {
      throw new Error()
    }
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/sentiment`
    if (storeId) url.searchParams.set("store_id", storeId)
  } catch {
    return emptySentiment(storeId)
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
    if (
      !response.ok ||
      !reader ||
      !response.headers.get("content-type")?.includes("application/json")
    ) {
      return emptySentiment(storeId)
    }
    const length = response.headers.get("content-length")
    if (length && Number(length) > MAX_RESPONSE_BYTES)
      return emptySentiment(storeId)
    const chunks: Buffer[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) return emptySentiment(storeId)
      chunks.push(Buffer.from(value))
    }
    return parseApiSentiment(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
      storeId
    )
  } catch {
    // Do not disclose the provider URL, key, response body or store identity.
    return emptySentiment(storeId)
  } finally {
    clearTimeout(timer)
    await reader?.cancel().catch(() => undefined)
  }
}
