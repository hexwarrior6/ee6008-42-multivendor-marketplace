import type { Link } from "@medusajs/framework/modules-sdk"
import {
  ContainerRegistrationKeys,
  Modules,
} from "@medusajs/framework/utils"
import { ARTISAN_PROFILE_MODULE } from "../../modules/artisan-profile"
import { CUSTOM_ORDER_MODULE } from "../../modules/custom-order"

type LinkScope = {
  resolve: (key: string) => unknown
}

const getLink = (scope: LinkScope) =>
  scope.resolve(ContainerRegistrationKeys.LINK) as Link

/** Create the store ↔ artisan-profile relation when a profile is created. */
export const linkProfileToStore = async (
  scope: LinkScope,
  storeId: string,
  profileId: string
) => {
  await getLink(scope).create({
    [Modules.STORE]: { store_id: storeId },
    [ARTISAN_PROFILE_MODULE]: { artisan_profile_id: profileId },
  })
}

/** Create both customer ↔ order and artisan ↔ order relations. */
export const linkCustomOrder = async (
  scope: LinkScope,
  input: { orderId: string; customerId: string; artisanId: string }
) => {
  const link = getLink(scope)
  await Promise.all([
    link.create({
      [ARTISAN_PROFILE_MODULE]: { artisan_profile_id: input.artisanId },
      [CUSTOM_ORDER_MODULE]: { custom_order_request_id: input.orderId },
    }),
    link.create({
      [Modules.CUSTOMER]: { customer_id: input.customerId },
      [CUSTOM_ORDER_MODULE]: { custom_order_request_id: input.orderId },
    }),
  ])
}

export const dismissProfileStoreLink = async (
  scope: LinkScope,
  storeId: string,
  profileId: string
) => {
  await getLink(scope).dismiss({
    [Modules.STORE]: { store_id: storeId },
    [ARTISAN_PROFILE_MODULE]: { artisan_profile_id: profileId },
  })
}

export const dismissCustomOrderLinks = async (
  scope: LinkScope,
  input: { orderId: string; customerId?: string | null; artisanId: string }
) => {
  const link = getLink(scope)
  const dismissals = [
    link.dismiss({
      [ARTISAN_PROFILE_MODULE]: { artisan_profile_id: input.artisanId },
      [CUSTOM_ORDER_MODULE]: { custom_order_request_id: input.orderId },
    }),
  ]
  if (input.customerId) {
    dismissals.push(
      link.dismiss({
        [Modules.CUSTOMER]: { customer_id: input.customerId },
        [CUSTOM_ORDER_MODULE]: { custom_order_request_id: input.orderId },
      })
    )
  }
  await Promise.all(dismissals)
}
