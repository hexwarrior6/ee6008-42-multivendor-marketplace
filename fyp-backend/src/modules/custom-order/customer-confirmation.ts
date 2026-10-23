import { MedusaError } from "@medusajs/framework/utils"
import type { CustomOrderMutation } from "./service"

export type CustomerConfirmation = {
  version: number
  quoted_amount: number
  currency_code: string
}

/** Called inside the mutation transaction, using the latest order snapshot. */
export function assertCustomerCustomOrderMutation(
  current: {
    customer_id?: string | null
    status: string
    version?: number
    quoted_amount?: number | null
    currency_code: string
  },
  input: CustomOrderMutation
) {
  if (input.actor?.actor_type !== "customer") return
  if (input.actor.actor_id !== current.customer_id) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "You can only update your own custom orders"
    )
  }
  const restrictedFields = [
    "quoted_amount",
    "product_category",
    "product_category_id",
    "product_id",
    "listing_type",
    "payment_status",
    "cancellation_reason",
  ] as const
  if (restrictedFields.some((key) => input[key] !== undefined)) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Customers cannot quote or change the custom order workflow"
    )
  }
  if (input.customer_confirmation !== undefined) {
    const accepted = input.customer_confirmation
    if (
      input.status !== "confirmed" ||
      current.status !== "quote" ||
      input.metadata !== undefined
    ) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "Only a quoted order can be confirmed"
      )
    }
    if (
      !Number.isInteger(accepted.version) ||
      accepted.version !== Number(current.version ?? 0) ||
      accepted.quoted_amount !== current.quoted_amount ||
      accepted.currency_code !== current.currency_code
    ) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "The quote has changed. Refresh the order before confirming"
      )
    }
  } else if (input.status !== undefined && input.status !== current.status) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Customers cannot quote or change the custom order workflow"
    )
  }
}
