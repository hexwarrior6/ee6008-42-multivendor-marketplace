import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { Modules } from "@medusajs/framework/utils"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../../../../modules/artisan-profile"
import {
  CUSTOM_ORDER_MODULE,
  CustomOrderService,
} from "../../../../../modules/custom-order"
import {
  assertCustomOrderAccess,
  requireCustomerContext,
} from "../../../../utils/authz"
import {
  artisanTalkJsId,
  customerTalkJsId,
  prepareTalkJsSession,
} from "../../../../utils/talkjs"

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const auth = requireCustomerContext(req)
  const customOrderService: CustomOrderService = req.scope.resolve(
    CUSTOM_ORDER_MODULE
  )
  const artisanService: ArtisanProfileService = req.scope.resolve(
    ARTISAN_PROFILE_MODULE
  )
  const customerService = req.scope.resolve(Modules.CUSTOMER)
  const order = await customOrderService.retrieveCustomOrderRequest(req.params.id)
  await assertCustomOrderAccess(req, order, { allowBackoffice: false })

  const [profile, customer, [messages]] = await Promise.all([
    artisanService.retrieveArtisanProfile(order.artisan_id),
    customerService.retrieveCustomer(auth.actor_id),
    customOrderService.listAndCountCustomOrderMessages(
      { custom_order_id: order.id },
      { take: 10000, skip: 0, order: { created_at: "ASC" } }
    ),
  ])
  const customerId = customerTalkJsId(auth.actor_id)
  const artisanId = artisanTalkJsId(profile.id)
  const customerName =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ") ||
    customer.email ||
    "Buyer"

  const session = await prepareTalkJsSession({
    orderId: order.id,
    orderTitle: order.title,
    currentUserId: customerId,
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
