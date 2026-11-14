import { parseApiSentiment, readApiSentiment } from "../sentiment-api"

const summary = (overrides = {}) => ({
  total: 10,
  positive: 6,
  neutral: 2,
  negative: 2,
  positive_ratio: 0.6,
  negative_ratio: 0.2,
  average_score: 0.42,
  average_rating: 4.1,
  top_positive_terms: [["quality", 4]],
  top_negative_terms: [["slow", 2]],
  ...overrides,
})
const payload = (overrides = {}) => ({
  summary: summary(),
  dimension: "store",
  context: { store_id: "store_one" },
  model_version: "sentiment-v1",
  generated_at: "2026-10-23T00:00:00Z",
  source: "unavailable",
  ...overrides,
})

describe("S4 sentiment REST client", () => {
  const env = { ...process.env }
  const originalFetch = global.fetch
  let fetcher: jest.Mock
  beforeEach(() => {
    process.env.RECOMMENDATIONS_API_URL = "https://recommender.example.test"
    process.env.RECOMMENDATIONS_API_KEY = "test-server-only-key"
    delete process.env.RECOMMENDATIONS_API_TIMEOUT_MS
    fetcher = jest.fn().mockResolvedValue(Response.json(payload()))
    global.fetch = fetcher
  })
  afterEach(() => {
    process.env = { ...env }
    global.fetch = originalFetch
    jest.useRealTimers()
  })

  it("calls the documented backend-only store endpoint", async () => {
    const result = await readApiSentiment({ storeId: "store_one" })
    expect(result).toMatchObject({
      dimension: "store",
      context: { store_id: "store_one" },
      summary: { total: 10 },
    })
    const [url, init] = fetcher.mock.calls[0]
    expect(url.pathname).toBe("/sentiment")
    expect(Object.fromEntries(url.searchParams)).toEqual({
      store_id: "store_one",
    })
    expect(init).toMatchObject({
      method: "GET",
      headers: {
        "X-API-Key": "test-server-only-key",
        Accept: "application/json",
      },
      cache: "no-store",
      redirect: "error",
    })
    expect(JSON.stringify(result)).not.toContain("test-server-only-key")
  })

  it("accepts the overall dimension only when no store is requested", async () => {
    fetcher.mockResolvedValue(
      Response.json(
        payload({ dimension: "overall", context: {}, summary: summary() })
      )
    )
    expect(await readApiSentiment({})).toMatchObject({
      dimension: "overall",
      context: {},
    })
    expect(fetcher.mock.calls[0][0].searchParams.has("store_id")).toBe(false)
  })

  it("rejects S4's overall fallback for a store-scoped request", () => {
    expect(() =>
      parseApiSentiment(
        payload({ dimension: "overall", context: { store_id: "store_one" } }),
        "store_one"
      )
    ).toThrow("Invalid sentiment response")
  })

  it.each(["RECOMMENDATIONS_API_URL", "RECOMMENDATIONS_API_KEY"])(
    "returns an empty contract when %s is missing",
    async (name) => {
      delete process.env[name]
      expect(await readApiSentiment({ storeId: "store_one" })).toEqual({
        summary: null,
        dimension: "unavailable",
        context: { store_id: "store_one" },
        model_version: null,
        generated_at: null,
        source: "unavailable",
      })
      expect(fetcher).not.toHaveBeenCalled()
    }
  )

  it.each([401, 403, 429, 500, 503])(
    "degrades safely on HTTP %s",
    async (status) => {
      fetcher.mockResolvedValue(new Response("provider detail", { status }))
      expect(await readApiSentiment({ storeId: "store_one" })).toMatchObject({
        summary: null,
        dimension: "unavailable",
      })
    }
  )

  it("aborts a slow request within the configured deadline", async () => {
    jest.useFakeTimers()
    process.env.RECOMMENDATIONS_API_TIMEOUT_MS = "100"
    fetcher.mockImplementation(
      (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(new Error("aborted")))
        )
    )
    const pending = readApiSentiment({ storeId: "store_one" })
    await jest.advanceTimersByTimeAsync(101)
    expect(await pending).toMatchObject({
      summary: null,
      dimension: "unavailable",
    })
  })

  it("accepts S4's unavailable empty response", () => {
    expect(
      parseApiSentiment(
        payload({
          summary: null,
          dimension: "unavailable",
          model_version: null,
          generated_at: null,
        }),
        "store_one"
      )
    ).toEqual({
      summary: null,
      dimension: "unavailable",
      context: { store_id: "store_one" },
      model_version: null,
      generated_at: null,
      source: "unavailable",
    })
  })

  it("normalizes a zero-review summary to the empty contract", () => {
    expect(
      parseApiSentiment(
        payload({
          summary: summary({
            total: 0,
            positive: 0,
            neutral: 0,
            negative: 0,
            positive_ratio: 0,
            negative_ratio: 0,
            average_score: 0,
            average_rating: 0,
            top_positive_terms: [],
            top_negative_terms: [],
          }),
        }),
        "store_one"
      )
    ).toMatchObject({ summary: null, dimension: "unavailable" })
  })

  it.each([
    { summary: summary({ total: 9 }) },
    { summary: summary({ positive_ratio: 0.9 }) },
    { summary: summary({ average_score: 2 }) },
    { summary: summary({ average_rating: null }) },
    { summary: summary({ top_positive_terms: [["", 1]] }) },
    { context: { store_id: "other" } },
    { generated_at: "not-a-date" },
    { model_version: "bad version" },
  ])("rejects malformed provider data %j", async (overrides) => {
    fetcher.mockResolvedValue(Response.json(payload(overrides)))
    expect(await readApiSentiment({ storeId: "store_one" })).toMatchObject({
      summary: null,
      dimension: "unavailable",
    })
  })

  it("rejects unsafe configuration, non-JSON and oversized bodies", async () => {
    process.env.RECOMMENDATIONS_API_URL = "http://remote.example.test"
    expect(await readApiSentiment({})).toMatchObject({ summary: null })
    expect(fetcher).not.toHaveBeenCalled()
    process.env.RECOMMENDATIONS_API_URL = "https://recommender.example.test"
    fetcher.mockResolvedValue(new Response("<html>failed</html>"))
    expect(await readApiSentiment({})).toMatchObject({ summary: null })
    fetcher.mockResolvedValue(
      new Response(" ".repeat(256 * 1024 + 1), {
        headers: { "content-type": "application/json" },
      })
    )
    expect(await readApiSentiment({})).toMatchObject({ summary: null })
  })
})
