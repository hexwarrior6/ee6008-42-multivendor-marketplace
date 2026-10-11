jest.mock("../../../../modules/recommendation/artifact", () => ({
  ...jest.requireActual("../../../../modules/recommendation/artifact"),
  readRecommendationArtifact: jest.fn(),
}))
import { GET } from "../route"
import { readRecommendationArtifact } from "../../../../modules/recommendation/artifact"
const read = readRecommendationArtifact as jest.Mock
const item = (product_id: string, score = 0.9) => ({
  product_id,
  score,
  title: "obsolete title",
  handle: "obsolete-handle",
  thumbnail: "https://unsafe.test/picture",
  reason: null,
})
const artifact = () => ({
  source: "als",
  model_version: "reco-v1-test",
  generated_at: new Date().toISOString(),
  by_user: { customer_me: [item("second"), item("first")] },
  by_product: { seed: [item("first")] },
  fallback: [item("second")],
})
function fixture(query = {}, authenticated = false) {
  const catalog = [
    "seed",
    "first",
    "second",
    "draft",
    "no_variant",
    "hidden",
  ].map((id) => ({
    id,
    title: `Current ${id}`,
    handle: `current-${id}`,
    thumbnail: null,
    status: id === "draft" ? "draft" : "published",
    variants: id === "no_variant" ? [] : [{ id: "variant" }],
    categories: [],
    created_at: "2026-10-01",
  }))
  const graph = jest.fn(async ({ entity, filters }) => {
    const ids =
      typeof filters.product_id === "string"
        ? [filters.product_id]
        : filters.product_id
    if (entity === "product_sales_channel")
      return {
        data: catalog
          .filter(
            (p) =>
              p.id !== "hidden" &&
              (ids ? ids.includes(p.id) : ["seed", "first"].includes(p.id))
          )
          .map((p) => ({ product_id: p.id })),
      }
    const selected = typeof filters.id === "string" ? [filters.id] : filters.id
    return { data: catalog.filter((p) => selected.includes(p.id)) }
  })
  const req: any = {
    query,
    publishable_key_context: { sales_channel_ids: ["sc_public"] },
    scope: { resolve: () => ({ graph }) },
    ...(authenticated
      ? { auth_context: { actor_type: "customer", actor_id: "customer_me" } }
      : {}),
  }
  const res: any = { json: jest.fn(), setHeader: jest.fn() }
  return { req, res, graph, result: () => res.json.mock.calls[0][0] }
}
beforeEach(() => {
  jest.clearAllMocks()
  read.mockResolvedValue({ artifact: artifact() })
})
describe("S4 JSON API adapter", () => {
  it("uses authenticated identity without a caller-supplied customer id and preserves model ordering", async () => {
    const h = fixture({ product_id: "seed", limit: "2" }, true)
    await GET(h.req, h.res)
    expect(h.result()).toMatchObject({
      source: "als",
      model_version: "reco-v1-test",
      personalized: true,
      strategy: "by_user",
      context: { customer_id: "customer_me" },
    })
    expect(h.result().recommendations.map((x: any) => x.product_id)).toEqual([
      "second",
      "first",
    ])
    expect(h.result().recommendations[0]).toMatchObject({
      title: "Current second",
      handle: "current-second",
      thumbnail: null,
    })
    expect(h.res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store"
    )
    expect(h.result()).not.toHaveProperty("by_user")
  })
  it("returns product recommendations for anonymous visitors", async () => {
    const h = fixture({ product_id: "seed" })
    await GET(h.req, h.res)
    expect(h.result()).toMatchObject({
      strategy: "by_product",
      personalized: false,
      count: 1,
    })
  })
  it("returns artifact fallback for an anonymous home page", async () => {
    const h = fixture()
    await GET(h.req, h.res)
    expect(h.result()).toMatchObject({
      strategy: "fallback",
      personalized: false,
    })
    expect(h.result().context).not.toHaveProperty("customer_id")
  })
  it("filters hidden/draft/no-variant/self/duplicate results before applying limit", async () => {
    read.mockResolvedValue({
      artifact: {
        ...artifact(),
        by_product: {
          seed: [
            item("hidden"),
            item("draft"),
            item("no_variant"),
            item("seed"),
            item("second"),
            item("second"),
            item("first"),
          ],
        },
      },
    })
    const h = fixture({ product_id: "seed", limit: "2" })
    await GET(h.req, h.res)
    expect(h.result().recommendations.map((x: any) => x.product_id)).toEqual([
      "second",
      "first",
    ])
    expect(
      h.graph.mock.calls.some(([call]) =>
        call.filters.product_id?.includes?.("hidden")
      )
    ).toBe(true)
  })
  it("falls through an invisible user list to product recommendations", async () => {
    read.mockResolvedValue({
      artifact: { ...artifact(), by_user: { customer_me: [item("hidden")] } },
    })
    const h = fixture({ product_id: "seed" }, true)
    await GET(h.req, h.res)
    expect(h.result()).toMatchObject({
      strategy: "by_product",
      personalized: false,
    })
  })
  it.each(["not_configured", "unavailable", "invalid", "expired"])(
    "honestly uses rules when artifact is %s",
    async (reason) => {
      read.mockResolvedValue({ reason })
      const h = fixture()
      await GET(h.req, h.res)
      expect(h.result()).toMatchObject({
        source: "rules",
        strategy: "rules",
        personalized: false,
        fallback_reason: reason,
      })
    }
  )
  it("uses rules if every artifact result is unavailable in this channel", async () => {
    read.mockResolvedValue({
      artifact: {
        ...artifact(),
        by_user: {},
        by_product: {},
        fallback: [item("hidden")],
      },
    })
    const h = fixture()
    await GET(h.req, h.res)
    expect(h.result()).toMatchObject({
      source: "rules",
      fallback_reason: "no_visible_results",
    })
  })
  it("rejects cross-customer lookups before reading the artifact", async () => {
    const h = fixture({ customer_id: "customer_other" }, true)
    await expect(GET(h.req, h.res)).rejects.toMatchObject({
      type: "not_allowed",
    })
    expect(read).not.toHaveBeenCalled()
  })
})
