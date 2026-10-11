import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../../../modules/artisan-profile"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../../../modules/custom-order"
import { assertCustomOrderAccess } from "../../../../utils/authz"
import {
  artisanTalkJsId,
  customerTalkJsId,
  prepareTalkJsSession,
} from "../../../../utils/talkjs"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const customOrderService: CustomOrderService = req.scope.resolve(
    CUSTOM_ORDER_MODULE
  )
  const artisanService: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const customerService = req.scope.resolve(Modules.CUSTOMER)
  const order = await customOrderService.retrieveCustomOrderRequest(req.params.id)
  await assertCustomOrderAccess(req, order, {
    allowCustomer: false,
    allowBackoffice: true,
  })
  if (!order.customer_id) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "This custom order is not linked to a customer"
    )
  }
  const customerIdValue = order.customer_id

  const [profile, customer, [messages]] = await Promise.all([
    artisanService.retrieveArtisanProfile(order.artisan_id),
    customerService.retrieveCustomer(customerIdValue),
    customOrderService.listAndCountCustomOrderMessages(
      { custom_order_id: order.id },
      { take: 10000, skip: 0, order: { created_at: "ASC" } }
    ),
  ])
  const customerId = customerTalkJsId(customerIdValue)
  const artisanId = artisanTalkJsId(profile.id)
  const customerName =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    customer.email ||
    "Buyer"

  const session = await prepareTalkJsSession({
    orderId: order.id,
    orderTitle: order.title,
    currentUserId: artisanId,
    customer: {
      id: customerId,
      name: customerName,
      ...(customer.email ? { email: [customer.email] } : {}),
      custom: { platform_role: "buyer" },
    },
    artisan: {
      id: artisanId,
      name: profile.display_name,
      ...(profile.avatar_url ? { photoUrl: profile.avatar_url } : {}),
      custom: { platform_role: "artisan" },
    },
    messages,
  })

  res.json({ talkjs: session })
}
