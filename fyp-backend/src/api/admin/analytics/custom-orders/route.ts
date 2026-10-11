import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  ARTISAN_PROFILE_MODULE,
  type ArtisanProfileService,
} from "../../../../modules/artisan-profile"
import {
  CUSTOM_ORDER_MODULE,
  type CustomOrderService,
} from "../../../../modules/custom-order"
import { CUSTOM_ORDER_STATUSES } from "../../../../modules/custom-order/state-machine"
import type { CustomOrderAnalyticsResponse } from "../../../contracts"
import {
  getAccessibleArtisanIds,
  getBackofficeAccess,
} from "../../../utils/authz"
import {
  parseAnalyticsPeriod,
  parseAnalyticsStoreId,
} from "../../../utils/analytics"
import { parseCurrencyCode } from "../../../utils/validation"

const PAGE_SIZE = 500
const MAX_REQUESTS = 10_000

export const customOrderAnalyticsScope = async (
  req: AuthenticatedMedusaRequest
) => {
  const access = await getBackofficeAccess(req)
  const storeId = parseAnalyticsStoreId(req.query.store_id)
  const { from, to } = parseAnalyticsPeriod(req.query)
  const currencyCode = parseCurrencyCode(req.query.currency_code)
  if (
    !access.isPlatformAdmin &&
    storeId &&
    !access.storeIds.includes(storeId)
  ) {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "You can only query analytics for your own store"
    )
  }
  let artisanIds: string[] | undefined
  if (!access.isPlatformAdmin) {
    artisanIds = await getAccessibleArtisanIds(
      req,
      storeId ? [storeId] : access.storeIds
    )
  } else if (storeId) {
    // Unlike the seller helper, platform admins can inspect every assigned
    // artisan in the requested store, not only their own artisan_user_id.
    const profiles: ArtisanProfileService = req.scope.resolve(
      ARTISAN_PROFILE_MODULE
    )
    artisanIds = []
    let skip = 0
    while (true) {
      const [page, count] = await profiles.listAndCountArtisanProfiles(
        { store_id: storeId },
        { take: PAGE_SIZE, skip, select: ["id"], order: { id: "ASC" } }
      )
      artisanIds.push(...page.map((profile) => profile.id))
      skip += page.length
      if (skip >= count || page.length < PAGE_SIZE) break
      if (skip >= MAX_REQUESTS)
        throw new MedusaError(
          MedusaError.Types.INVALID_DATA,
          "Too many artisans for synchronous analytics"
        )
    }
  }
  return { from, to, currencyCode, artisanIds }
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { from, to, currencyCode, artisanIds } =
    await customOrderAnalyticsScope(req)
  const result: CustomOrderAnalyticsResponse = {
    period: { from: from.toISOString(), to: to.toISOString() },
    currency_code: currencyCode,
    summary: {
      requests: 0,
      open_requests: 0,
      delivered_requests: 0,
      cancelled_requests: 0,
    },
    status_counts: Object.fromEntries(
      CUSTOM_ORDER_STATUSES.map((status) => [status, 0])
    ) as CustomOrderAnalyticsResponse["status_counts"],
    payment_status_counts: {
      pending: 0,
      authorized: 0,
      captured: 0,
      failed: 0,
    },
    daily: [],
    truncated: false,
  }
  if (artisanIds && !artisanIds.length) return res.json(result)
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const daily = new Map<string, CustomOrderAnalyticsResponse["daily"][number]>()
  let skip = 0
  while (true) {
    const [page, count] = await service.listAndCountCustomOrderRequests(
      {
        ...(artisanIds ? { artisan_id: artisanIds } : {}),
        currency_code: currencyCode,
        created_at: { $gte: from, $lte: to },
      },
      {
        take: Math.min(PAGE_SIZE, MAX_REQUESTS - skip),
        skip,
        select: ["id", "status", "payment_status", "created_at"],
        order: { created_at: "ASC", id: "ASC" },
      }
    )
    for (const order of page) {
      result.summary.requests += 1
      result.status_counts[order.status] += 1
      result.payment_status_counts[order.payment_status] += 1
      if (order.status === "delivered") result.summary.delivered_requests += 1
      else if (order.status === "cancelled")
        result.summary.cancelled_requests += 1
      else result.summary.open_requests += 1
      const date = new Date(order.created_at).toISOString().slice(0, 10)
      const day = daily.get(date) || { date, requests: 0 }
      day.requests += 1
      daily.set(date, day)
    }
    skip += page.length
    if (skip >= MAX_REQUESTS) {
      result.truncated = count > skip
      break
    }
    if (skip >= count || page.length < PAGE_SIZE) break
  }
  result.daily = [...daily.values()].sort((a, b) =>
    a.date.localeCompare(b.date)
  )
  return res.json(result)
}
