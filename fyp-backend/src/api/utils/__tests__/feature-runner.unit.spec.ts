jest.mock("@medusajs/framework/pg", () => ({ Client: jest.fn() }))
import { Client } from "@medusajs/framework/pg"
const {
  runFeatureHttpTests,
} = require("../../../../scripts/run-feature-http-tests.cjs")

const original = process.env.TEST_DATABASE_URL
const mockClient = { connect: jest.fn(), query: jest.fn(), end: jest.fn() }
beforeEach(() => {
  jest.clearAllMocks()
  ;(Client as unknown as jest.Mock).mockImplementation(() => mockClient)
  mockClient.query.mockResolvedValue({ rows: [] })
  process.env.TEST_DATABASE_URL =
    "postgres://test:password@localhost:5432/business"
})
afterAll(() => {
  if (original === undefined) delete process.env.TEST_DATABASE_URL
  else process.env.TEST_DATABASE_URL = original
})
describe("isolated test database safety", () => {
  it("never silently uses the application's DATABASE_URL", async () => {
    delete process.env.TEST_DATABASE_URL
    await expect(runFeatureHttpTests()).rejects.toThrow(
      "Set TEST_DATABASE_URL explicitly"
    )
    expect(Client).not.toHaveBeenCalled()
  })
  it("rejects non-PostgreSQL sources before connecting", async () => {
    process.env.TEST_DATABASE_URL = "https://example.com/business"
    await expect(runFeatureHttpTests()).rejects.toThrow("PostgreSQL URL")
    expect(Client).not.toHaveBeenCalled()
  })
  it("rejects credentials the underlying runner cannot safely encode", async () => {
    process.env.TEST_DATABASE_URL = "postgres://test:p%40ss@localhost/business"
    await expect(runFeatureHttpTests()).rejects.toThrow(
      "URL-safe test credentials"
    )
    expect(Client).not.toHaveBeenCalled()
  })
  it("refuses to use or clean up an existing database", async () => {
    mockClient.query.mockResolvedValue({ rows: [{ datname: "existing" }] })
    await expect(runFeatureHttpTests()).rejects.toThrow("already exists")
    expect(mockClient.query).toHaveBeenCalledTimes(1)
    expect(mockClient.query.mock.calls[0][1][0]).toMatch(
      /^medusa_feature_test_[a-f0-9]{32}$/
    )
    expect(mockClient.end).toHaveBeenCalled()
  })
  it("does not issue any write if the account lacks create-database permission", async () => {
    mockClient.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ rolcreatedb: false }] })
    await expect(runFeatureHttpTests()).rejects.toThrow(
      "create an isolated database"
    )
    expect(
      mockClient.query.mock.calls.every(([sql]) => /^select /i.test(sql))
    ).toBe(true)
    expect(mockClient.end).toHaveBeenCalled()
  })
})
