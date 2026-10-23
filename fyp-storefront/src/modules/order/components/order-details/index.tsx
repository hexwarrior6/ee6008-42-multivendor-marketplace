"use client"

import { useStorefrontI18n } from "@lib/i18n/storefront-context"
import { HttpTypes } from "@medusajs/types"
import { Text } from "@medusajs/ui"

type OrderDetailsProps = {
  order: HttpTypes.StoreOrder
  showStatus?: boolean
}

const OrderDetails = ({ order, showStatus }: OrderDetailsProps) => {
  const { locale, t } = useStorefrontI18n()
  const formatStatus = (str: string) => {
    const formatted = str.split("_").join(" ")

    return formatted.slice(0, 1).toUpperCase() + formatted.slice(1)
  }
  const fulfillmentStatus =
    t.order.fulfillmentStatus[
      order.fulfillment_status as keyof typeof t.order.fulfillmentStatus
    ] || formatStatus(order.fulfillment_status)
  const paymentStatus =
    t.order.paymentStatusLabels[
      order.payment_status as keyof typeof t.order.paymentStatusLabels
    ] || formatStatus(order.payment_status)

  return (
    <div>
      <Text>
        {t.order.confirmationSent}{" "}
        <span
          className="text-ui-fg-medium-plus font-semibold"
          data-testid="order-email"
        >
          {order.email}
        </span>
        .
      </Text>
      <Text className="mt-2">
        {t.order.orderDate}:{" "}
        <span data-testid="order-date">
          {new Date(order.created_at).toLocaleDateString(locale)}
        </span>
      </Text>
      <Text className="mt-2 text-ui-fg-interactive">
        {t.order.orderId}:{" "}
        <span data-testid="order-id">{order.display_id}</span>
      </Text>

      <div className="flex items-center text-compact-small gap-x-4 mt-4">
        {showStatus && (
          <>
            <Text>
              {t.order.orderStatus}:{" "}
              <span className="text-ui-fg-subtle " data-testid="order-status">
                {fulfillmentStatus}
              </span>
            </Text>
            <Text>
              {t.order.paymentStatus}:{" "}
              <span
                className="text-ui-fg-subtle "
                sata-testid="order-payment-status"
              >
                {paymentStatus}
              </span>
            </Text>
          </>
        )}
      </div>
    </div>
  )
}

export default OrderDetails
