import { auditCustomOrderPayments } from "../audit-custom-order-payments"
const order = {
  id: "cor-1",
  customer_id: "customer-1",
  status: "confirmed",
  payment_status: "pending",
  version: 2,
  quoted_amount: 680,
  currency_code: "cny",
  metadata: { __custom_order_payment_collection_id: "pay_col_1" },
}
const collection = {
  id: "pay_col_1",
  amount: 6.8,
  currency_code: "cny",
  metadata: { custom_order_id: "cor-1" },
  payment_sessions: [],
  payments: [],
}
function setup(
  orders: unknown[],
  collections: unknown[],
  counts = [orders.length, collections.length]
) {
  return {
    service: {
      listAndCountCustomOrderRequests: jest.fn(async () => [orders, counts[0]]),
    } as never,
    payment: {
      listAndCountPaymentCollections: jest.fn(async () => [
        collections,
        counts[1],
      ]),
    } as never,
  }
}
describe("read-only custom payment audit", () => {
  it("finds no problem for a matching durable binding", async () => {
    const { service, payment } = setup([order], [collection])
    expect(await auditCustomOrderPayments(service, payment)).toMatchObject({
      read_only: true,
      truncated: false,
      issues: [],
    })
  })
  it("reports orphaned collections without deleting data or contacting providers", async () => {
    const { service, payment } = setup(
      [order],
      [
        collection,
        {
          ...collection,
          id: "pay_col_orphan",
          payment_sessions: [{ id: "session" }],
        },
      ]
    )
    expect(
      (await auditCustomOrderPayments(service, payment)).issues
    ).toContainEqual({
      order_id: "cor-1",
      collection_id: "pay_col_orphan",
      issue: "unbound_collection_with_activity",
    })
  })
  it("reports mismatches, missing collections and pending operations", async () => {
    const operation = {
      id: "op-1",
      kind: "retry",
      status: "requested",
      request_version: 1,
    }
    const { service, payment } = setup(
      [
        {
          ...order,
          metadata: {
            ...order.metadata,
            __custom_order_payment_operation: operation,
          },
        },
      ],
      []
    )
    expect((await auditCustomOrderPayments(service, payment)).issues).toEqual(
      expect.arrayContaining([
        {
          order_id: "cor-1",
          collection_id: "pay_col_1",
          issue: "pending_operation",
        },
        {
          order_id: "cor-1",
          collection_id: "pay_col_1",
          issue: "missing_collection",
        },
      ])
    )
    const mismatch = setup([order], [{ ...collection, amount: 1 }])
    expect(
      (await auditCustomOrderPayments(mismatch.service, mismatch.payment))
        .issues[0].issue
    ).toBe("binding_quote_mismatch")
  })
  it("labels capped scans as incomplete instead of claiming references are missing", async () => {
    const { service, payment } = setup(
      [order],
      [
        {
          ...collection,
          id: "pay_col_other",
          metadata: { custom_order_id: "outside" },
        },
      ],
      [2, 2]
    )
    const result = await auditCustomOrderPayments(service, payment, 1)
    expect(result.truncated).toBe(true)
    expect(result.issues.map((issue) => issue.issue)).toEqual(
      expect.arrayContaining(["order_outside_scan", "collection_outside_scan"])
    )
  })
})
