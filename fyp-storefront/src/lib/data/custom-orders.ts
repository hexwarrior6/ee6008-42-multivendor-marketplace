"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { buildCustomOrderPayload } from "@lib/util/custom-order-request"
import type { CustomOrderPayload } from "@lib/util/custom-order-request"
import type { CustomOrderStatus } from "@lib/util/custom-order-status"

export type CustomOrder = {
  id: string
  artisan_id: string
  customer_id: string
  title: string
  product_category: string
  product_category_id: string | null
  product_id: string | null
  listing_type: "custom_request" | "product"
  description: string
  budget_amount: number | null
  quoted_amount: number | null
  currency_code: string
  status: CustomOrderStatus
  payment_status: "pending" | "authorized" | "captured" | "failed"
  delivered_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export type CustomOrderSummary = {
  id: string
  title: string
  status: string
}

export type CreateCustomOrderState = {
  success: boolean
  error: string | null
  customOrder: CustomOrderSummary | null
}

export type TalkJsSession = {
  app_id: string
  user_id: string
  conversation_id: string
  token: string
}

type CreateCustomOrderResponse = {
  custom_order: CustomOrderSummary
}

type ListCustomOrdersResponse = {
  custom_orders: CustomOrder[]
  count: number
  limit: number
  offset: number
  has_more: boolean
}

export async function listCustomOrders(): Promise<CustomOrder[]> {
  const headers = await getAuthHeaders()
  const { custom_orders } = await sdk.client.fetch<ListCustomOrdersResponse>(
    "/store/custom-orders",
    {
      method: "GET",
      headers,
      query: { limit: 100, offset: 0 },
      cache: "no-store",
    }
  )

  return custom_orders
}

export async function retrieveCustomOrder(id: string): Promise<CustomOrder> {
  const headers = await getAuthHeaders()
  const { custom_order } = await sdk.client.fetch<{
    custom_order: CustomOrder
  }>(`/store/custom-orders/${id}`, {
    method: "GET",
    headers,
    cache: "no-store",
  })

  return custom_order
}

export async function retrieveCustomOrderTalkJsSession(
  orderId: string
): Promise<TalkJsSession> {
  const headers = await getAuthHeaders()
  const { talkjs } = await sdk.client.fetch<{ talkjs: TalkJsSession }>(
    `/store/custom-orders/${encodeURIComponent(orderId)}/talkjs`,
    {
      method: "GET",
      headers,
      cache: "no-store",
    }
  )

  return talkjs
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return "We could not submit your request. Please try again."
}

export async function createCustomOrder(
  _currentState: CreateCustomOrderState,
  formData: FormData
): Promise<CreateCustomOrderState> {
  try {
    const headers = await getAuthHeaders()

    if (!("authorization" in headers)) {
      return {
        success: false,
        error: "Please sign in before submitting a custom order request.",
        customOrder: null,
      }
    }

    const payload: CustomOrderPayload = buildCustomOrderPayload(formData)
    const { custom_order } = await sdk.client.fetch<CreateCustomOrderResponse>(
      "/store/custom-orders",
      {
        method: "POST",
        headers,
        body: payload,
        cache: "no-store",
      }
    )

    return {
      success: true,
      error: null,
      customOrder: {
        id: custom_order.id,
        title: custom_order.title,
        status: custom_order.status,
      },
    }
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
      customOrder: null,
    }
  }
}
