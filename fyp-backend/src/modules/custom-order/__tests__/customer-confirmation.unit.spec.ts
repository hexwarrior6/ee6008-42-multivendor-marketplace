import { assertCustomerCustomOrderMutation } from "../customer-confirmation"
import { assertCustomOrderBusinessRules } from "../state-machine"
import type { CustomOrderMutation } from "../service"

const current = {
  customer_id: "customer-1",
  status: "quote",
  version: 3,
  quoted_amount: 680,
  currency_code: "cny",
  payment_status: "pending",
}
const confirmation: CustomOrderMutation = {
  id: "cor-1",
  status: "confirmed",
  actor: { actor_type: "customer", actor_id: "customer-1" },
  customer_confirmation: {
    version: 3,
    quoted_amount: 680,
    currency_code: "cny",
  },
}

describe("atomic customer quote confirmation guards", () => {
  it("lets the owner accept exactly the quote they saw", () => {
    expect(() =>
      assertCustomerCustomOrderMutation(current, confirmation)
    ).not.toThrow()
    expect(() =>
      assertCustomOrderBusinessRules(
        current as never,
        "confirmed",
        confirmation
      )
    ).not.toThrow()
  })
  it.each([
    { version: 2, quoted_amount: 680, currency_code: "cny" },
    { version: 3, quoted_amount: 681, currency_code: "cny" },
    { version: 3, quoted_amount: 680, currency_code: "usd" },
  ])("rejects stale version, amount or currency: %p", (accepted) => {
    expect(() =>
      assertCustomerCustomOrderMutation(current, {
        ...confirmation,
        customer_confirmation: accepted,
      })
    ).toThrow("quote has changed")
  })
  it("rejects another customer inside the service, not just at the route", () => {
    expect(() =>
      assertCustomerCustomOrderMutation(current, {
        ...confirmation,
        actor: { actor_type: "customer", actor_id: "other" },
      })
    ).toThrow("own custom orders")
  })
  it.each(["request", "confirmed", "produced", "delivered", "cancelled"])(
    "does not confirm a %s order",
    (status) => {
      expect(() =>
        assertCustomerCustomOrderMutation({ ...current, status }, confirmation)
      ).toThrow("Only a quoted order")
    }
  )
  it("retains generic workflow restrictions and metadata-only updates", () => {
    expect(() =>
      assertCustomerCustomOrderMutation(current, {
        ...confirmation,
        customer_confirmation: undefined,
      })
    ).toThrow("cannot quote")
    expect(() =>
      assertCustomerCustomOrderMutation(current, {
        id: "cor-1",
        actor: confirmation.actor,
        metadata: { gift: true },
      })
    ).not.toThrow()
  })
  it.each([
    "quoted_amount",
    "product_category",
    "product_category_id",
    "product_id",
    "listing_type",
    "payment_status",
    "cancellation_reason",
  ])("cannot smuggle %s into confirmation", (key) => {
    expect(() =>
      assertCustomerCustomOrderMutation(current, {
        ...confirmation,
        [key]: "unexpected",
      })
    ).toThrow("cannot quote")
  })
})
