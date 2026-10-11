import { GET } from "../route"
jest.mock("../../../../modules/recommendation/artifact", () => ({
  ...jest.requireActual("../../../../modules/recommendation/artifact"),
  readRecommendationArtifact: jest.fn(async () => ({
    reason: "not_configured",
  })),
}))
import {
  rankRecommendations,
  type RecommendationProduct,
} from "../../../../modules/recommendation/ranking"

const product = (id: string, overrides = {}): RecommendationProduct => ({
  id,
  title: id,
  status: "published",
  variants: [{ id: "v-1" }],
  categories: [{ id: "cat-1", is_active: true, is_internal: false }],
  created_at: "2026-10-01",
  ...overrides,
})
const makeRequest = (query = {}, options: Record<string, unknown> = {}) => {
  const graph = jest.fn(async ({ entity, filters }) => {
    if (entity === "product_sales_channel")
      return {
        data: filters.product_id
          ? [{ product_id: "seed" }]
          : [
              { product_id: "seed" },
              { product_id: "same" },
              { product_id: "other" },
            ],
      }
    return {
      data:
        typeof filters.id === "string"
          ? [product("seed")]
          : [
              product("seed"),
              product("same"),
              product("other", { categories: [] }),
            ],
    }
  })
  return {
    graph,
    req: {
      query,
      publishable_key_context: { sales_channel_ids: ["sc-1"] },
      scope: { resolve: () => ({ graph }) },
      ...options,
    } as never,
  }
}

describe("rule-based recommendations", () => {
  function paged(
    catalog: RecommendationProduct[],
    linkIds = catalog.map((p) => p.id)
  ) {
    const graph = jest.fn(async ({ entity, filters, pagination }) => {
      if (entity === "product_sales_channel") {
        expect(filters.sales_channel_id).toEqual(["sc-1"])
        return {
          data: linkIds
            .slice(pagination.skip, pagination.skip + pagination.take)
            .map((product_id) => ({ product_id })),
        }
      }
      return {
        data: catalog.filter(
          (p) => filters.id.includes(p.id) && p.status === filters.status
        ),
      }
    })
    const req = {
      query: {},
      publishable_key_context: { sales_channel_ids: ["sc-1"] },
      scope: { resolve: () => ({ graph }) },
    } as never
    const res = { json: jest.fn(), setHeader: jest.fn() }
    return {
      req,
      res: res as never,
      graph,
      result: () => res.json.mock.calls[0][0],
    }
  }
  it("finds a published candidate after 200 draft links", async () => {
    const h = paged([
      ...Array.from({ length: 200 }, (_, i) =>
        product(`draft_${i}`, { status: "draft" })
      ),
      product("visible"),
    ])
    await GET(h.req, h.res)
    expect(h.result().recommendations.map((p: any) => p.product_id)).toEqual([
      "visible",
    ])
    expect(
      h.graph.mock.calls.some(
        ([q]) =>
          q.entity === "product_sales_channel" && q.pagination.skip === 200
      )
    ).toBe(true)
    expect(h.result().candidate_scan_truncated).toBe(false)
  })
  it("does not let duplicate channel links or products without variants fill the usable quota", async () => {
    const h = paged(
      [product("empty", { variants: [] }), product("visible")],
      [...Array(200).fill("empty"), "visible"]
    )
    await GET(h.req, h.res)
    expect(h.result().recommendations.map((p: any) => p.product_id)).toEqual([
      "visible",
    ])
  })
  it("stops scanning once the usable candidate quota is filled", async () => {
    const h = paged(
      Array.from({ length: 300 }, (_, i) => product(`visible_${i}`))
    )
    await GET(h.req, h.res)
    expect(
      h.graph.mock.calls.filter(([q]) => q.entity === "product_sales_channel")
    ).toHaveLength(1)
    expect(h.result().count).toBe(8)
  })
  it("bounds scanning and reports incomplete candidates instead of looping forever", async () => {
    const h = paged(
      [product("draft", { status: "draft" })],
      Array(10_001).fill("draft")
    )
    await GET(h.req, h.res)
    expect(
      h.graph.mock.calls.filter(([q]) => q.entity === "product_sales_channel")
    ).toHaveLength(50)
    expect(h.result()).toMatchObject({
      count: 0,
      candidate_scan_limit: 10_000,
      candidate_scan_truncated: true,
    })
  })
  it("ranks public category similarity above recency, excludes seed/drafts/no variants, deduplicates", () => {
    const ranked = rankRecommendations(
      [
        product("seed"),
        product("same"),
        product("same"),
        product("recent", { categories: [], created_at: "2026-10-09" }),
        product("draft", { status: "draft" }),
        product("empty", { variants: [] }),
      ],
      product("seed"),
      8
    )
    expect(ranked.map((p) => p.product_id)).toEqual(["same", "recent"])
    expect(ranked[0]).toMatchObject({ score: 1, reason: "same_category" })
  })
  it("does not use internal or inactive categories for similarity", () => {
    expect(
      rankRecommendations(
        [
          product("same", {
            categories: [{ id: "cat-1", is_active: true, is_internal: true }],
          }),
        ],
        product("seed"),
        8
      )[0].reason
    ).toBe("recently_added")
  })
  it("provides stable limited cold-start recommendations", () => {
    expect(
      rankRecommendations(
        [product("b"), product("a"), product("c")],
        undefined,
        2
      ).map((p) => p.product_id)
    ).toEqual(["a", "b"])
  })
  it("queries only channel-linked published products and returns real results", async () => {
    const { req, graph } = makeRequest({ product_id: "seed", limit: "2" })
    const res = { json: jest.fn(), setHeader: jest.fn() }
    await GET(req, res as never)
    expect(graph.mock.calls[0][0]).toMatchObject({
      entity: "product_sales_channel",
      filters: { sales_channel_id: ["sc-1"] },
    })
    expect(graph.mock.calls.at(-1)?.[0]).toMatchObject({
      entity: "product",
      filters: { status: "published", id: ["seed", "same", "other"] },
    })
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "rules",
        personalized: false,
        count: 2,
        recommendations: expect.arrayContaining([
          expect.objectContaining({ product_id: "same" }),
        ]),
      })
    )
  })
  it.each(["0", "25", "1.5", "NaN", "Infinity", ["2", "3"]])(
    "rejects invalid limit %p",
    async (limit) => {
      const { req, graph } = makeRequest({ limit })
      await expect(
        GET(req, { json: jest.fn() } as never)
      ).rejects.toMatchObject({ type: "invalid_data" })
      expect(graph).not.toHaveBeenCalled()
    }
  )
  it("fails closed without channel scope", async () => {
    const { req, graph } = makeRequest(
      {},
      { publishable_key_context: { sales_channel_ids: [] } }
    )
    await expect(GET(req, {} as never)).rejects.toMatchObject({
      type: "not_allowed",
    })
    expect(graph).not.toHaveBeenCalled()
  })
  it("rejects another customer's identity", async () => {
    const { req, graph } = makeRequest(
      { customer_id: "customer-other" },
      { auth_context: { actor_type: "customer", actor_id: "customer-me" } }
    )
    await expect(GET(req, {} as never)).rejects.toMatchObject({
      type: "not_allowed",
    })
    expect(graph).not.toHaveBeenCalled()
  })
  it("does not query a seed outside the publishable key's channels", async () => {
    const { req, graph } = makeRequest({ product_id: "hidden" })
    graph
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
    await expect(GET(req, {} as never)).rejects.toMatchObject({
      type: "not_found",
    })
    expect(graph).toHaveBeenCalledTimes(2)
  })
  it("returns a truthful empty result when the channel has no products", async () => {
    const { req, graph } = makeRequest()
    graph.mockResolvedValue({ data: [] })
    const res = { json: jest.fn(), setHeader: jest.fn() }
    await GET(req, res as never)
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "rules",
        count: 0,
        recommendations: [],
      })
    )
  })
})
