import { parseAnalyticsPeriod, parseAnalyticsStoreId } from "../analytics"

describe("analytics filters", () => {
  it("includes the whole UTC end date", () => {
    const { from, to } = parseAnalyticsPeriod({
      from: "2026-10-09",
      to: "2026-10-09",
    })
    expect(from.toISOString()).toBe("2026-10-09T00:00:00.000Z")
    expect(to.toISOString()).toBe("2026-10-09T23:59:59.999Z")
  })
  it("preserves exact timezone-bearing timestamps", () => {
    expect(
      parseAnalyticsPeriod({
        from: "2026-10-09T08:00:00+08:00",
        to: "2026-10-09T09:00:00+08:00",
      }).to.toISOString()
    ).toBe("2026-10-09T01:00:00.000Z")
  })
  it("defaults to the last 30 days", () => {
    const now = new Date("2026-10-09T12:00:00Z")
    const period = parseAnalyticsPeriod({}, now)
    expect(period.to).toEqual(now)
    expect(period.from.toISOString()).toBe("2026-09-09T12:00:00.000Z")
  })
  it.each([
    "2026-02-30",
    "2025-02-29",
    "10/09/2026",
    "2026-10-09T12:00:00",
    "2026-10-09T24:00:00Z",
    ["2026-10-09", "2026-10-08"],
    null,
  ])("rejects ambiguous/invalid dates %p", (value) => {
    expect(() => parseAnalyticsPeriod({ from: value })).toThrow()
  })
  it("accepts leap days and rejects reverse or oversized ranges", () => {
    expect(() =>
      parseAnalyticsPeriod({ from: "2024-02-29", to: "2024-03-01" })
    ).not.toThrow()
    expect(() =>
      parseAnalyticsPeriod({ from: "2026-10-09", to: "2026-10-08" })
    ).toThrow("from must")
    expect(() =>
      parseAnalyticsPeriod({ from: "2024-01-01", to: "2026-10-09" })
    ).toThrow("366 days")
  })
  it.each([["store-1", "store-2"], "", "store/other", 3])(
    "rejects unsafe store scope %p",
    (value) => {
      expect(() => parseAnalyticsStoreId(value)).toThrow("Invalid store_id")
    }
  )
})
