import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../modules/custom-order"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../modules/artisan-profile"
import { isCustomOrderStatus } from "../../../modules/custom-order/state-machine"
import type { CustomOrderRequestBody } from "../../contracts"
import {
  requireCustomerContext,
  securityLog,
} from "../../utils/authz"
import {
  normalizePagination,
  parseCurrencyCode,
  parseNonNegativeAmount,
  validateMetadata,
} from "../../utils/validation"
import {
  dismissCustomOrderLinks,
  linkCustomOrder,
} from "../../utils/module-links"
import { assertCustomOrderProductReferences } from "../../utils/product-ownership"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const customer = requireCustomerContext(req)
  const { status } = req.query
  if (status !== undefined && !isCustomOrderStatus(String(status))) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Invalid custom order status"
    )
  }

  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  const { limit, offset } = normalizePagination(req.query)

  const [customOrders, count] = await service.listAndCountCustomOrderRequests(
    {
      customer_id: customer.actor_id,
      ...(status ? { status: String(status) } : {}),
    },
    { take: limit, skip: offset, order: { created_at: "DESC" } }
  )

  res.json({
    custom_orders: customOrders,
    count,
    limit,
    offset,
    has_more: offset + customOrders.length < count,
  })
}

export const POST = async (
  req: AuthenticatedMedusaRequest<CustomOrderRequestBody>,
  res: MedusaResponse
) => {
  const customer = requireCustomerContext(req)
  const body = req.body || ({} as CustomOrderRequestBody)
  const artisanId = typeof body.artisan_id === "string"
    ? body.artisan_id.trim()
    : ""
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const description =
    typeof body.description === "string" ? body.description.trim() : ""
  const category =
    typeof body.product_category === "string"
      ? body.product_category.trim()
      : "custom"
  const currencyCode = parseCurrencyCode(body.currency_code)

  if (!artisanId || !title || !description) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "artisan_id, title and description are required"
    )
  }
  if (title.length > 200 || description.length > 5000) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "title must be 200 characters or fewer and description 5000 characters or fewer"
    )
  }
  if (!category || category.length > 100) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "product_category must be between 1 and 100 characters"
    )
  }
  const budgetAmount = parseNonNegativeAmount(body.budget_amount, "budget_amount", {
    nullable: true,
    integer: true,
  })
  const metadata = validateMetadata(body.metadata)

  const artisanProfileService: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  let profile
  try {
    profile = await artisanProfileService.retrieveArtisanProfile(artisanId)
  } catch {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Artisan profile not found")
  }
  if (profile.verification_status !== "approved") {
    throw new MedusaError(
      MedusaError.Types.NOT_ALLOWED,
      "Orders can only be assigned to an approved artisan profile"
    )
  }

  if (body.product_category_id !== undefined && body.product_category_id !== null) {
    if (typeof body.product_category_id !== "string" || !body.product_category_id.trim()) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "product_category_id must be a non-empty string"
      )
    }
  }
  if (body.product_id !== undefined && body.product_id !== null) {
    if (typeof body.product_id !== "string" || !body.product_id.trim()) {
      throw new MedusaError(
        MedusaError.Types.INVALID_DATA,
        "product_id must be a non-empty string"
      )
    }
  }

  const listingType = body.listing_type ?? "custom_request"
  if (listingType === "product" && !body.product_id) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "listing_type=product requires product_id"
    )
  }
  if (listingType !== "custom_request" && listingType !== "product") {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "listing_type must be custom_request or product"
    )
  }

  await assertCustomOrderProductReferences(req, {
    productId: typeof body.product_id === "string" ? body.product_id : null,
    productCategoryId:
      typeof body.product_category_id === "string"
        ? body.product_category_id
        : null,
    storeId: profile.store_id,
    listingType,
  })

  const service: CustomOrderService = req.scope.resolve(CUSTOM_ORDER_MODULE)
  // customer_id from the request body is intentionally ignored. The only
  // accepted owner is the authenticated customer actor.
  if (body.customer_id && body.customer_id !== customer.actor_id) {
    securityLog(req, "ignored client supplied customer_id", {
      customer_id: body.customer_id,
      actor_id: customer.actor_id,
    })
  }
  const customOrder = await service.createCustomOrderWithHistory({
    artisan_id: artisanId,
    customer_id: customer.actor_id,
    title,
    product_category: category,
    product_category_id: typeof body.product_category_id === "string"
      ? body.product_category_id.trim()
      : null,
    product_id: typeof body.product_id === "string" ? body.product_id.trim() : null,
    listing_type: listingType,
    description,
    budget_amount: budgetAmount ?? null,
    currency_code: currencyCode,
    metadata: metadata ?? null,
    actor: { actor_type: "customer", actor_id: customer.actor_id },
  })

  try {
    await linkCustomOrder(req.scope, {
      orderId: customOrder.id,
      customerId: customer.actor_id,
      artisanId: artisanId,
    })
  } catch (error) {
    // Do not return a successful order while its module links are missing.
    // Compensate the newly-created aggregate so a retry cannot leave a
    // partially linked order behind.
    securityLog(req, "custom order link creation failed", {
      order_id: customOrder.id,
      error: error instanceof Error ? error.message : String(error),
    })
    try {
      await dismissCustomOrderLinks(req.scope, {
        orderId: customOrder.id,
        customerId: customer.actor_id,
        artisanId,
      })
    } catch (dismissError) {
      securityLog(req, "custom order link compensation failed", {
        order_id: customOrder.id,
        error:
          dismissError instanceof Error
            ? dismissError.message
            : String(dismissError),
      })
    }
    try {
      await service.deleteCustomOrderWithRelations(customOrder.id)
    } catch (compensationError) {
      securityLog(req, "custom order link compensation failed", {
        order_id: customOrder.id,
        error:
          compensationError instanceof Error
            ? compensationError.message
            : String(compensationError),
      })
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Custom order creation could not be completed consistently"
      )
    }
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Custom order could not be linked to its customer and artisan"
    )
  }

  res.status(201).json({ custom_order: customOrder })
}
