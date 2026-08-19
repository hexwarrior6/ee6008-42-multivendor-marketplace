import { defineLink } from "@medusajs/framework/utils";
import StoreModule from "@medusajs/medusa/store";
import StripeConnectModule from "../modules/stripe-connect"

export default defineLink(
    StoreModule.linkable.store,
    StripeConnectModule.linkable.payoutAccount
)