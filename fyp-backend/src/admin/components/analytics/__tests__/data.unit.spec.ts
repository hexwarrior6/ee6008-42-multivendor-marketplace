import {
  buildTimeline,
  bucketTimeline,
  formatAmount,
  loadAnalytics,
  presetRange,
  validateFilters,
} from "../data"

const filters = { from: "2026-10-01", to: "2026-10-03", currency_code: "cny" }
const sales = {
  period: { from: "2026-10-01T00:00:00Z", to: "2026-10-03T23:59:59.999Z" },
  currency_code: "cny",
  summary: { revenue: 800, orders: 1, average_order_value: 800 },
  top_products: [
    { product_id: "prod_a", title: "Cup", units: 2, revenue: 800 },
  ],
  daily: [{ date: "2026-10-02", orders: 1, revenue: 800 }],
  truncated: false,
}
const custom = {
  period: sales.period,
  currency_code: "cny",
  summary: {
    requests: 1,
    open_requests: 1,
    delivered_requests: 0,
    cancelled_requests: 0,
  },
  status_counts: {
    request: 1,
    quote: 0,
    confirmed: 0,
    produced: 0,
    delivered: 0,
    cancelled: 0,
  },
  payment_status_counts: { pending: 1, authorized: 0, captured: 0, failed: 0 },
  daily: [{ date: "2026-10-03", requests: 1 }],
  truncated: false,
}

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

test("preset dates are inclusive UTC days even near a timezone boundary", () => {
  expect(presetRange(7, new Date("2026-10-24T00:30:00+08:00"))).toEqual({
    from: "2026-10-17",
    to: "2026-10-23",
  })
})
test.each(["2026-02-30", "2026-13-01", "", "not-a-date"])(
  "rejects invalid calendar date %s",
  (from) => {
    expect(validateFilters({ ...filters, from })).toBe("dates")
  }
)
test("rejects reversed/oversized ranges and unsupported currencies", () => {
  expect(validateFilters({ ...filters, from: "2026-10-04" })).toBe("dates")
  expect(validateFilters({ ...filters, to: "2027-10-03" })).toBe("range")
  expect(validateFilters({ ...filters, currency_code: "invalid" })).toBe(
    "currency"
  )
  expect(validateFilters(filters)).toBeNull()
})
test("formats Medusa v2 main-unit values without dividing by one hundred", () => {
  expect(formatAmount(800, "cny", "en")).toBe("CN¥800.00")
  expect(formatAmount(0, "usd", "en")).toBe("$0.00")
})
test("fills missing UTC dates without mixing custom requests with paid orders", () => {
  expect(buildTimeline(filters, sales.daily, custom.daily)).toEqual([
    { date: "2026-10-01", revenue: 0, orders: 0, requests: 0 },
    { date: "2026-10-02", revenue: 800, orders: 1, requests: 0 },
    { date: "2026-10-03", revenue: 0, orders: 0, requests: 1 },
  ])
})
test("buckets long ranges without losing totals or the final day", () => {
  const days = Array.from({ length: 90 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)).toISOString().slice(0, 10),
    revenue: 2,
    orders: 1,
    requests: 3,
  }))
  const buckets = bucketTimeline(days)
  expect(buckets.length).toBeLessThanOrEqual(30)
  expect(buckets[0].from).toBe("2026-01-01")
  expect(buckets[buckets.length - 1].to).toBe("2026-03-31")
  expect(buckets.reduce((sum, item) => sum + item.revenue, 0)).toBe(180)
  expect(buckets.reduce((sum, item) => sum + item.orders, 0)).toBe(90)
})
test("queries both scoped endpoints read-only without caller-supplied store IDs", async () => {
  const fetcher = jest
    .spyOn(global, "fetch")
    .mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).startsWith("/admin/analytics/sales") ? sales : custom
          )
        )
    )
  const controller = new AbortController()
  const result = await loadAnalytics(filters, controller.signal)
  expect(result.sales.data).toEqual(sales)
  expect(result.custom.data).toEqual(custom)
  expect(fetcher.mock.calls).toHaveLength(2)
  for (const [url, options] of fetcher.mock.calls) {
    expect(String(url)).toContain(
      "from=2026-10-01&to=2026-10-03&currency_code=cny"
    )
    expect(String(url)).not.toContain("store_id")
    expect(options).toEqual(
      expect.objectContaining({
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })
    )
    expect(options?.signal).toBeInstanceOf(AbortSignal)
  }
})
test.each([
  [401, "session"],
  [403, "forbidden"],
  [503, "unavailable"],
])(
  "maps HTTP %s to a safe UI error without leaking upstream text",
  async (status, expected) => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("private details", { status }))
    const result = await loadAnalytics(filters, new AbortController().signal)
    expect(result.sales).toEqual({ error: expected })
    expect(result.custom).toEqual({ error: expected })
  }
)
test("preserves successful data when only the custom-order endpoint fails", async () => {
  jest
    .spyOn(global, "fetch")
    .mockImplementation(async (input) =>
      String(input).startsWith("/admin/analytics/sales")
        ? new Response(JSON.stringify(sales))
        : new Response("offline", { status: 503 })
    )
  const result = await loadAnalytics(filters, new AbortController().signal)
  expect(result.sales.data?.summary.revenue).toBe(800)
  expect(result.custom).toEqual({ error: "unavailable" })
})
test.each([
  { ...sales, currency_code: "usd" },
  { ...sales, summary: { ...sales.summary, revenue: null } },
  { ...sales, daily: [{ date: "2026-02-30", revenue: 800, orders: 1 }] },
  { ...sales, top_products: null },
])(
  "rejects malformed or wrong-currency responses instead of displaying false zeroes",
  async (data) => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response(JSON.stringify(data)))
    expect(
      (await loadAnalytics(filters, new AbortController().signal)).sales
    ).toEqual({ error: "invalid" })
  }
)
test("preserves truncation and does not reinterpret empty data as a network failure", async () => {
  jest
    .spyOn(global, "fetch")
    .mockImplementation(
      async (input) =>
        new Response(
          JSON.stringify(
            String(input).startsWith("/admin/analytics/sales")
              ? { ...sales, truncated: true }
              : {
                  ...custom,
                  daily: [],
                  summary: {
                    requests: 0,
                    open_requests: 0,
                    delivered_requests: 0,
                    cancelled_requests: 0,
                  },
                }
          )
        )
    )
  const result = await loadAnalytics(filters, new AbortController().signal)
  expect(result.sales.data?.truncated).toBe(true)
  expect(result.custom.data?.summary.requests).toBe(0)
})
test("aborting navigation does not return fabricated empty datasets", async () => {
  const controller = new AbortController()
  controller.abort()
  jest
    .spyOn(global, "fetch")
    .mockRejectedValue(new DOMException("Aborted", "AbortError"))
  await expect(loadAnalytics(filters, controller.signal)).rejects.toMatchObject(
    { name: "AbortError" }
  )
})

test("a timed-out custom endpoint preserves already loaded sales", async () => {
  jest.useFakeTimers()
  const controller = new AbortController()
  let pendingSignal: AbortSignal | undefined
  jest.spyOn(global, "fetch").mockImplementation(async (url, options) => {
    if (String(url).startsWith("/admin/analytics/sales"))
      return new Response(JSON.stringify(sales))
    pendingSignal = options?.signal as AbortSignal
    return new Promise((_resolve, reject) =>
      pendingSignal!.addEventListener("abort", () =>
        reject(new DOMException("Aborted", "AbortError"))
      )
    )
  })
  const pending = loadAnalytics(filters, controller.signal).catch(() => null)
  await jest.advanceTimersByTimeAsync(10001)
  const timedOut = pendingSignal?.aborted
  if (!timedOut) controller.abort()
  const result = await pending
  expect(timedOut).toBe(true)
  expect(result?.sales.data?.summary.revenue).toBe(800)
  expect(result?.custom).toEqual({ error: "unavailable" })
})
