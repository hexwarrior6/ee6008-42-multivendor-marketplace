import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../../modules/custom-order"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../../modules/artisan-profile"
import {
  assertCustomOrderAccess,
  getBackofficeAccess,
  securityLog,
} from "../../../utils/authz"
import {
  parseNonNegativeAmount,
  validateMetadata,
} from "../../../utils/validation"
import { dismissCustomOrderLinks } from "../../../utils/module-links"
import { assertCustomOrderProductReferences } from "../../../utils/product-ownership"
import {
  isCustomOrderStatus,
  type CustomOrderStatus,
} from "../../../../modules/custom-order/state-machine"

type UpdateCustomOrderBody = {
  status?: CustomOrderStatus
  quoted_amount?: number | null
  product_category?: string
  product_category_id?: string | null
  product_id?: string | null
  listing_type?: "custom_request" | "product"
  payment_status?: "pending" | "authorized" | "captured" | "failed"
  metadata?: Record<string, unknown> | null
  cancellation_reason?: string | null
  reason?: string | null
}

const assertExistingProductReferences = async (
  req: AuthenticatedMedusaRequest,
  body: UpdateCustomOrderBody,
  current: {
    artisan_id: string
    product_id?: string | null
    product_category_id?: string | null
    listing_type?: "custom_request" | "product" | null
  }
) => {
  if (body.product_category_id === undefined && body.product_id === undefined) {
    return
  }
  for (const [field, value] of [
    ["product_category_id", body.product_category_id],
    ["product_id", body.product_id],
  ] as const) {
    if (value !== undefined && value !== null &&
      (typeof value !== "string" || !value.trim())) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        `${field} must be a non-empty string`
      )
    }
  }
  const productCategoryId = body.product_category_id === undefined
    ? current.product_category_id
    : typeof body.product_category_id === "string"
      ? body.product_category_id.trim()
      : body.product_category_id
  const productId = body.product_id === undefined
    ? current.product_id
    : typeof body.product_id === "string"
      ? body.product_id.trim()
      : body.product_id
  const listingType = body.listing_type ?? current.listing_type ?? "custom_request"

  const profileService: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  let profile
  try {
    profile = await profileService.retrieveArtisanProfile(current.artisan_id)
  } catch {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "The artisan profile assigned to this order no longer exists"
    )
  }

  await assertCustomOrderProductReferences(req, {
    productId: typeof productId === "string" ? productId : null,
    productCategoryId:
      typeof productCategoryId === "string" ? productCategoryId : null,
    storeId: profile.store_id,
    listingType,
  })
}

const retrieveAuthorizedOrder = async (
  req: AuthenticatedMedusaRequest
) => {
  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const customOrder = await service.retrieveCustomOrderRequest(req.params.id)
  await assertCustomOrderAccess(req, customOrder, {
    allowCustomer: false,
    allowBackoffice: true,
  })
  return { service, customOrder }
}

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { customOrder } = await retrieveAuthorizedOrder(req)
  res.json({ custom_order: customOrder })
}

/**
 * Update an order and its status in one transaction. POST is retained as an
 * alias because the first S1 route contract exposed POST for admin updates.
 */
export const PATCH = async (
  req: AuthenticatedMedusaRequest<UpdateCustomOrderBody>,
  res: MedusaResponse
) => {
  const { service, customOrder: current } = await retrieveAuthorizedOrder(req)
  const body = req.body || {}
  const access = await getBackofficeAccess(req)
  const actor = await assertCustomOrderAccess(req, current, {
    allowCustomer: false,
    allowBackoffice: true,
  })

  if (body.status !== undefined && !isCustomOrderStatus(body.status)) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid custom order status"
    )
  }

  if (body.product_category !== undefined) {
    if (
      typeof body.product_category !== "string" ||
      !body.product_category.trim() ||
      body.product_category.trim().length > 100
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "product_category must be between 1 and 100 characters"
      )
    }
  }

  const quotedAmount = parseNonNegativeAmount(
    body.quoted_amount,
    "quoted_amount",
    { nullable: true, integer: true }
  )

  if (
    body.listing_type !== undefined &&
    body.listing_type !== "custom_request" &&
    body.listing_type !== "product"
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "listing_type must be custom_request or product"
    )
  }
  const effectiveProductId = body.product_id !== undefined
    ? typeof body.product_id === "string"
      ? body.product_id.trim()
      : body.product_id
    : current.product_id
  const effectiveListingType = body.listing_type ?? current.listing_type
  if (effectiveListingType === "product" && !effectiveProductId) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "listing_type=product requires product_id"
    )
  }
  if (body.cancellation_reason !== undefined && body.cancellation_reason !== null) {
    if (
      typeof body.cancellation_reason !== "string" ||
      body.cancellation_reason.trim().length > 1000
    ) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "cancellation_reason must be 1000 characters or fewer"
      )
    }
  }
  if (body.reason !== undefined && body.reason !== null) {
    if (typeof body.reason !== "string" || body.reason.trim().length > 1000) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "reason must be 1000 characters or fewer"
      )
    }
  }

  if (body.payment_status !== undefined && !access.isPlatformAdmin) {
    securityLog(req, "seller attempted to update payment status", {
      order_id: current.id,
      actor_id: access.context.actor_id,
    })
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Only a platform administrator can update payment status"
    )
  }
  if (
    body.payment_status !== undefined &&
    !["pending", "authorized", "captured", "failed"].includes(body.payment_status)
  ) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid payment_status"
    )
  }

  await assertExistingProductReferences(req, body, current)
  const metadata = body.metadata === undefined
    ? undefined
    : validateMetadata(body.metadata)

  const hasChanges = [
    body.status !== undefined && body.status !== current.status,
    body.quoted_amount !== undefined,
    body.product_category !== undefined,
    body.product_category_id !== undefined,
    body.product_id !== undefined,
    body.listing_type !== undefined,
    body.payment_status !== undefined,
    body.metadata !== undefined,
  ].some(Boolean)

  const updated = hasChanges
    ? await service.updateCustomOrderAtomically({
        id: current.id,
        status: body.status,
        quoted_amount: quotedAmount,
        ...(body.product_category !== undefined
          ? { product_category: body.product_category.trim() }
          : {}),
        ...(body.product_category_id !== undefined
          ? {
              product_category_id:
                typeof body.product_category_id === "string"
                  ? body.product_category_id.trim()
                  : body.product_category_id,
            }
          : {}),
        ...(body.product_id !== undefined
          ? {
              product_id:
                typeof body.product_id === "string"
                  ? body.product_id.trim()
                  : body.product_id,
            }
          : {}),
        ...(body.listing_type !== undefined
          ? { listing_type: body.listing_type }
          : {}),
        ...(body.payment_status !== undefined
          ? { payment_status: body.payment_status }
          : {}),
        ...(body.metadata !== undefined ? { metadata } : {}),
        ...(body.cancellation_reason !== undefined
          ? { cancellation_reason: body.cancellation_reason }
          : {}),
        ...(body.reason !== undefined ? { reason: body.reason } : {}),
        actor,
      })
    : current

  res.json({ custom_order: updated })
}

export const POST = PATCH

export const DELETE = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const access = await getBackofficeAccess(req)
  if (!access.isPlatformAdmin) {
    securityLog(req, "artisan attempted to delete a custom order", {
      order_id: req.params.id,
      actor_id: access.context.actor_id,
    })
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Only a platform administrator can delete custom orders"
    )
  }
  const { service, customOrder } = await retrieveAuthorizedOrder(req)
  await service.deleteCustomOrderWithRelations(customOrder.id)
  try {
    await dismissCustomOrderLinks(req.scope, {
      orderId: customOrder.id,
      customerId: customOrder.customer_id,
      artisanId: customOrder.artisan_id,
    })
  } catch {
    // Direct IDs and the service's relation cleanup remain authoritative if
    // the remote link store is unavailable during deletion.
  }
  res.sendStatus(204)
}
