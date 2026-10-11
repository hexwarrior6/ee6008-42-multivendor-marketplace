jest.mock("../../../../utils/authz", () => ({
  getBackofficeAccess: jest.fn(),
  getAccessibleArtisanIds: jest.fn(),
}))
import { GET } from "../route"
import {
  getAccessibleArtisanIds,
  getBackofficeAccess,
} from "../../../../utils/authz"

const access = getBackofficeAccess as jest.Mock
const artisans = getAccessibleArtisanIds as jest.Mock
const rows = [
  {
    id: "1",
    status: "request",
    payment_status: "pending",
    created_at: "2026-10-09T12:00:00Z",
  },
  {
    id: "2",
    status: "delivered",
    payment_status: "captured",
    created_at: "2026-10-09T15:00:00Z",
  },
  {
    id: "3",
    status: "cancelled",
    payment_status: "failed",
    created_at: "2026-10-08T00:00:00Z",
  },
]
function setup(query = {}) {
  const list = jest.fn().mockResolvedValue([rows, rows.length])
  const profiles = jest.fn().mockResolvedValue([[{ id: "art-assigned" }], 1])
  return {
    list,
    profiles,
    res: { json: jest.fn() },
    req: {
      query: { from: "2026-10-08", to: "2026-10-09", ...query },
      scope: {
        resolve: (key: string) =>
          key === "custom_order"
            ? { listAndCountCustomOrderRequests: list }
            : { listAndCountArtisanProfiles: profiles },
      },
    } as never,
  }
}
beforeEach(() => {
  jest.clearAllMocks()
  access.mockResolvedValue({
    isPlatformAdmin: true,
    storeIds: [],
    context: { actor_id: "admin" },
  })
  artisans.mockResolvedValue(["art-owned"])
})

describe("custom-order analytics", () => {
  it("aggregates every lifecycle/payment state without pretending quotes are revenue", async () => {
    const { req, res, list } = setup()
    await GET(req, res as never)
    expect(list.mock.calls[0][0].created_at.$lte.toISOString()).toBe(
      "2026-10-09T23:59:59.999Z"
    )
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: {
          requests: 3,
          open_requests: 1,
          delivered_requests: 1,
          cancelled_requests: 1,
        },
        status_counts: {
          request: 1,
          quote: 0,
          confirmed: 0,
          produced: 0,
          delivered: 1,
          cancelled: 1,
        },
        payment_status_counts: {
          pending: 1,
          authorized: 0,
          captured: 1,
          failed: 1,
        },
        daily: [
          { date: "2026-10-08", requests: 1 },
          { date: "2026-10-09", requests: 2 },
        ],
        truncated: false,
      })
    )
    expect(res.json.mock.calls[0][0].summary).not.toHaveProperty("revenue")
  })
  it("filters seller analytics by accessible artisans and currency", async () => {
    access.mockResolvedValue({
      isPlatformAdmin: false,
      storeIds: ["store-1"],
      context: { actor_id: "seller" },
    })
    const { req, res, list } = setup({ currency_code: "usd" })
    await GET(req, res as never)
    expect(artisans).toHaveBeenCalledWith(req, ["store-1"])
    expect(list.mock.calls[0][0]).toMatchObject({
      artisan_id: ["art-owned"],
      currency_code: "usd",
    })
  })
  it("rejects another store before reading profiles or orders", async () => {
    access.mockResolvedValue({
      isPlatformAdmin: false,
      storeIds: ["store-1"],
      context: { actor_id: "seller" },
    })
    const { req, res, list, profiles } = setup({ store_id: "store-other" })
    await expect(GET(req, res as never)).rejects.toMatchObject({
      type: "not_allowed",
    })
    expect(list).not.toHaveBeenCalled()
    expect(profiles).not.toHaveBeenCalled()
    expect(artisans).not.toHaveBeenCalled()
  })
  it("returns zeros without loading orders when no artisans are accessible", async () => {
    access.mockResolvedValue({
      isPlatformAdmin: false,
      storeIds: [],
      context: { actor_id: "seller" },
    })
    artisans.mockResolvedValue([])
    const { req, res, list } = setup()
    await GET(req, res as never)
    expect(list).not.toHaveBeenCalled()
    expect(res.json.mock.calls[0][0].summary.requests).toBe(0)
  })
  it("lets platform admins inspect artisans assigned to another user in a specific store", async () => {
    const { req, res, profiles, list } = setup({ store_id: "store-1" })
    await GET(req, res as never)
    expect(profiles.mock.calls[0][0]).toEqual({ store_id: "store-1" })
    expect(artisans).not.toHaveBeenCalled()
    expect(list.mock.calls[0][0].artisan_id).toEqual(["art-assigned"])
  })
  it("rejects invalid filters before querying orders", async () => {
    const { req, res, list } = setup({ to: "2026-02-30" })
    await expect(GET(req, res as never)).rejects.toMatchObject({
      type: "invalid_data",
    })
    expect(list).not.toHaveBeenCalled()
  })
  it("paginates instead of silently truncating after one page", async () => {
    const { req, res, list } = setup()
    const page = Array.from({ length: 500 }, (_, id) => ({
      ...rows[0],
      id: String(id),
    }))
    list
      .mockResolvedValueOnce([page, 501])
      .mockResolvedValueOnce([[rows[1]], 501])
    await GET(req, res as never)
    expect(list.mock.calls[1][1].skip).toBe(500)
    expect(res.json.mock.calls[0][0].summary.requests).toBe(501)
    expect(res.json.mock.calls[0][0].truncated).toBe(false)
  })
  it("reports the 10000-request safety cap truthfully", async () => {
    const { req, res, list } = setup()
    list.mockResolvedValue([
      Array.from({ length: 500 }, (_, id) => ({ ...rows[0], id: String(id) })),
      10001,
    ])
    await GET(req, res as never)
    expect(list).toHaveBeenCalledTimes(20)
    expect(res.json.mock.calls[0][0]).toMatchObject({
      summary: { requests: 10000 },
      truncated: true,
    })
  })
})
