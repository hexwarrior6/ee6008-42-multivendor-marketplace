jest.mock("../../../../utils/authz", () => ({
  getBackofficeAccess: jest.fn(),
}))
jest.mock("../../../../../modules/recommendation/sentiment-api", () => ({
  readApiSentiment: jest.fn(),
}))
import { GET } from "../route"
import { getBackofficeAccess } from "../../../../utils/authz"
import { readApiSentiment } from "../../../../../modules/recommendation/sentiment-api"

const access = getBackofficeAccess as jest.Mock
const read = readApiSentiment as jest.Mock
const empty = {
  summary: null,
  dimension: "unavailable",
  context: {},
  model_version: null,
  generated_at: null,
  source: "unavailable",
}
function setup(query = {}) {
  return {
    req: { query } as never,
    res: { json: jest.fn(), setHeader: jest.fn() },
  }
}
beforeEach(() => {
  jest.clearAllMocks()
  access.mockResolvedValue({
    isPlatformAdmin: false,
    storeIds: ["store_one"],
    context: { actor_id: "seller" },
  })
  read.mockResolvedValue({
    ...empty,
    context: { store_id: "store_one" },
  })
})

describe("admin sentiment analytics", () => {
  it("derives a seller's only store from trusted ownership", async () => {
    const { req, res } = setup()
    await GET(req, res as never)
    expect(read).toHaveBeenCalledWith({ storeId: "store_one" })
    expect(res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store"
    )
  })

  it("allows a seller to select an owned store", async () => {
    access.mockResolvedValue({
      isPlatformAdmin: false,
      storeIds: ["store_one", "store_two"],
      context: { actor_id: "seller" },
    })
    const { req, res } = setup({ store_id: "store_two" })
    await GET(req, res as never)
    expect(read).toHaveBeenCalledWith({ storeId: "store_two" })
  })

  it("rejects another store before calling S4", async () => {
    const { req, res } = setup({ store_id: "store_other" })
    await expect(GET(req, res as never)).rejects.toMatchObject({
      type: "not_allowed",
    })
    expect(read).not.toHaveBeenCalled()
  })

  it("does not guess or call overall for a multi-store seller", async () => {
    access.mockResolvedValue({
      isPlatformAdmin: false,
      storeIds: ["store_one", "store_two"],
      context: { actor_id: "seller" },
    })
    const { req, res } = setup()
    await GET(req, res as never)
    expect(read).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(empty)
  })

  it("lets platform admins request overall or one store", async () => {
    access.mockResolvedValue({
      isPlatformAdmin: true,
      storeIds: [],
      context: { actor_id: "admin" },
    })
    const overall = setup()
    await GET(overall.req, overall.res as never)
    expect(read).toHaveBeenLastCalledWith({ storeId: undefined })
    const store = setup({ store_id: "store_other" })
    await GET(store.req, store.res as never)
    expect(read).toHaveBeenLastCalledWith({ storeId: "store_other" })
  })

  it("rejects malformed store ids before calling S4", async () => {
    const { req, res } = setup({ store_id: "bad id!" })
    await expect(GET(req, res as never)).rejects.toMatchObject({
      type: "invalid_data",
    })
    expect(read).not.toHaveBeenCalled()
  })
})
