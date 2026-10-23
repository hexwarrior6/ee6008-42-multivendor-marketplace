"use server"

import { sdk } from "@lib/config"
import { getAuthHeaders } from "@lib/data/cookies"
import { revalidatePath } from "next/cache"

export type CustomPaymentSession = {
  id: string
  provider_id: string
  status: string
  code_url: string
  mode: "mock" | "live"
  amount: number
  currency_code: string
}
export type CustomPaymentVerification =
  | "unverified"
  | "simulated"
  | "verified"
  | "review_required"

export async function prepareCustomOrderPayment(
  id: string
): Promise<
  { success: true; session: CustomPaymentSession } | { success: false }
> {
  try {
    const headers = await getAuthHeaders()
    if (!("authorization" in headers)) return { success: false }
    const path = `/store/custom-orders/${encodeURIComponent(id)}`
    await sdk.client.fetch(`${path}/payment-session`, {
      method: "GET",
      headers,
      cache: "no-store",
    })
    await sdk.client.fetch(`${path}/payment-collection`, {
      method: "POST",
      headers,
      body: {},
      cache: "no-store",
    })
    const result = await sdk.client.fetch<{
      payment_session: CustomPaymentSession
    }>(`${path}/payment-session`, {
      method: "POST",
      headers,
      body: {},
      cache: "no-store",
    })
    return { success: true, session: result.payment_session }
  } catch {
    return { success: false }
  }
}

export async function refreshCustomOrderPayment(
  id: string
): Promise<
  | {
      success: true
      verification: CustomPaymentVerification
      payment_status: string
    }
  | { success: false }
> {
  try {
    const headers = await getAuthHeaders()
    if (!("authorization" in headers)) return { success: false }
    const result = await sdk.client.fetch<{
      verification: CustomPaymentVerification
      payment_status: string
    }>(`/store/custom-orders/${encodeURIComponent(id)}/payment-status`, {
      method: "POST",
      headers,
      body: {},
      cache: "no-store",
    })
    revalidatePath("/[countryCode]/account/custom-orders", "layout")
    return { success: true, ...result }
  } catch {
    return { success: false }
  }
}
