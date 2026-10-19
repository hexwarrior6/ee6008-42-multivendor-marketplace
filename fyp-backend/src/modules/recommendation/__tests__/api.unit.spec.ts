jest.mock("../artifact", () => ({
  ...jest.requireActual("../artifact"),
  readRecommendationArtifact: jest.fn(),
}))
import {
  readApiRecommendations,
  readRecommendationSource,
  parseApiRecommendations,
} from "../api"
import { readRecommendationArtifact } from "../artifact"

const payload = (overrides = {}) => ({
  recommendations: [{ product_id: "prod_one", score: -0.1, reason: null }],
  count: 1,
  limit: 24,
  source: "content",
  model_version: "reco-v1-test",
  generated_at: new Date().toISOString(),
  strategy: "fallback",
  personalized: false,
  ...overrides,
})
describe("S4 REST client", () => {
  const env = { ...process.env }
  const originalFetch = global.fetch
  let fetcher: jest.Mock
  beforeEach(() => {
    process.env.RECOMMENDATIONS_API_URL = "https://recommender.example.test"
    process.env.RECOMMENDATIONS_API_KEY = "test-server-only-key"
    delete process.env.RECOMMENDATIONS_API_TIMEOUT_MS
    delete process.env.RECOMMENDATIONS_MAX_AGE_SECONDS
    fetcher = jest.fn().mockResolvedValue(Response.json(payload()))
    global.fetch = fetcher
    jest.clearAllMocks()
  })
  afterEach(() => {
    process.env = { ...env }
    global.fetch = originalFetch
    jest.useRealTimers()
  })
  it("uses the documented GET route, backend key, max candidate limit and no shared cache", async () => {
    const result = await readApiRecommendations({
      customerId: "cus_me",
      productId: "prod_seed",
    })
    expect(result).toMatchObject({
      transport: "api",
      artifact: { source: "content", fallback: [{ product_id: "prod_one" }] },
    })
    const [url, init] = fetcher.mock.calls[0]
    expect(url.pathname).toBe("/recommendations")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      customer_id: "cus_me",
      product_id: "prod_seed",
      limit: "24",
    })
    expect(init).toMatchObject({
      method: "GET",
      headers: { "X-API-Key": "test-server-only-key" },
      cache: "no-store",
      redirect: "error",
    })
    expect(JSON.stringify(result)).not.toContain("test-server-only-key")
  })
  it("sends no identity on anonymous requests", async () => {
    await readApiRecommendations({})
    expect(fetcher.mock.calls[0][0].searchParams.has("customer_id")).toBe(false)
  })
  it("normalizes user and product strategies without exposing export maps", () => {
    const user = parseApiRecommendations(
      payload({ strategy: "by_user", personalized: true }),
      { customerId: "cus_me" }
    )
    expect(user.by_user.cus_me).toHaveLength(1)
    expect(user.fallback).toEqual([])
    const product = parseApiRecommendations(
      payload({ strategy: "by_product" }),
      { productId: "prod_seed" }
    )
    expect(product.by_product.prod_seed).toHaveLength(1)
  })
  it.each(["RECOMMENDATIONS_API_URL", "RECOMMENDATIONS_API_KEY"])(
    "fails closed when %s is missing",
    async (name) => {
      delete process.env[name]
      expect(await readApiRecommendations({})).toMatchObject({
        reason: "api_not_configured",
      })
      expect(fetcher).not.toHaveBeenCalled()
    }
  )
  it.each([
    "http://remote.example.test",
    "https://user:secret@example.test",
    "https://example.test?token=secret",
    "file:///tmp/model",
  ])("rejects unsafe configuration %s", async (url) => {
    process.env.RECOMMENDATIONS_API_URL = url
    expect(await readApiRecommendations({})).toMatchObject({
      reason: "api_invalid",
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each(["0", "99", "10001", "Infinity", "bad"])(
    "rejects invalid timeout %s",
    async (timeout) => {
      process.env.RECOMMENDATIONS_API_TIMEOUT_MS = timeout
      expect(await readApiRecommendations({})).toMatchObject({
        reason: "api_invalid",
      })
      expect(fetcher).not.toHaveBeenCalled()
    }
  )
  it.each([401, 403, 429, 500, 503])(
    "degrades on HTTP %s without disclosing provider bodies",
    async (status) => {
      fetcher.mockResolvedValue(
        new Response("test-server-only-key", { status })
      )
      expect(await readApiRecommendations({})).toEqual({
        reason: "api_unavailable",
        transport: "api",
      })
    }
  )
  it("degrades on connection errors and redirects without leaking credentials", async () => {
    fetcher.mockRejectedValue(new Error("test-server-only-key"))
    expect(await readApiRecommendations({})).toEqual({
      reason: "api_unavailable",
      transport: "api",
    })
  })
  it("aborts a slow request within the configured deadline", async () => {
    jest.useFakeTimers()
    process.env.RECOMMENDATIONS_API_TIMEOUT_MS = "100"
    fetcher.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted")))
        )
    )
    const pending = readApiRecommendations({})
    await jest.advanceTimersByTimeAsync(101)
    expect(await pending).toEqual({ reason: "api_timeout", transport: "api" })
  })
  it("leaves room for local fallback within the storefront's 3000ms deadline by default", async () => {
    jest.useFakeTimers()
    fetcher.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted")))
        )
    )
    const pending = readApiRecommendations({})
    await jest.advanceTimersByTimeAsync(1501)
    expect(await pending).toEqual({ reason: "api_timeout", transport: "api" })
  })
  it.each([
    { recommendations: null },
    { count: 99 },
    { source: "unknown" },
    { strategy: "unknown" },
    { strategy: "by_user", personalized: true },
    { strategy: "by_product" },
    { personalized: true },
    { recommendations: [{ product_id: "../secret", score: 1 }] },
    { recommendations: [{ product_id: "prod_one", score: "1" }] },
    { generated_at: "bad" },
    { generated_at: "2999-01-01T00:00:00Z" },
    {
      recommendations: Array(25).fill({ product_id: "prod_one", score: 1 }),
      count: 25,
    },
  ])("rejects a malformed contract %j", async (overrides) => {
    fetcher.mockResolvedValue(Response.json(payload(overrides)))
    expect(await readApiRecommendations({})).toMatchObject({
      reason: "api_invalid",
    })
  })
  it("rejects stale exports", async () => {
    fetcher.mockResolvedValue(
      Response.json(payload({ generated_at: "2000-01-01T00:00:00Z" }))
    )
    expect(await readApiRecommendations({})).toMatchObject({
      reason: "expired",
    })
  })
  it("accepts an empty result for local rule fallback", async () => {
    fetcher.mockResolvedValue(
      Response.json(
        payload({ recommendations: [], count: 0, strategy: "empty" })
      )
    )
    expect(await readApiRecommendations({})).toMatchObject({
      artifact: { fallback: [] },
    })
  })
  it("rejects an empty strategy that contains candidates", async () => {
    fetcher.mockResolvedValue(Response.json(payload({ strategy: "empty" })))
    expect(await readApiRecommendations({})).toMatchObject({
      reason: "api_invalid",
    })
  })
  it("rejects non-JSON and corrupt JSON", async () => {
    fetcher.mockResolvedValue(new Response("<html>unavailable</html>"))
    expect(await readApiRecommendations({})).toMatchObject({
      reason: "api_invalid",
    })
    fetcher.mockResolvedValue(
      new Response("{bad", { headers: { "content-type": "application/json" } })
    )
    expect(await readApiRecommendations({})).toMatchObject({
      reason: "api_invalid",
    })
  })
  it("bounds chunked responses without trusting content-length", async () => {
    fetcher.mockResolvedValue(
      new Response(" ".repeat(256 * 1024 + 1), {
        headers: { "content-type": "application/json" },
      })
    )
    expect(await readApiRecommendations({})).toMatchObject({
      reason: "api_invalid",
    })
  })
  it("never silently reads a stale local file after an API failure", async () => {
    fetcher.mockRejectedValue(new Error("offline"))
    expect(await readRecommendationSource({})).toMatchObject({
      reason: "api_unavailable",
    })
    expect(readRecommendationArtifact).not.toHaveBeenCalled()
  })
  it("keeps explicit legacy JSON compatibility when API URL is empty", async () => {
    delete process.env.RECOMMENDATIONS_API_URL
    ;(readRecommendationArtifact as jest.Mock).mockResolvedValue({
      reason: "not_configured",
    })
    expect(await readRecommendationSource({})).toEqual({
      reason: "not_configured",
      transport: "file",
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
