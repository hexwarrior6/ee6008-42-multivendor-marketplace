import OrderModule from "@medusajs/medusa/order";
import { defineLink } from "@medusajs/framework/utils"
import stripeConnect from "../modules/stripe-connect";


export default defineLink(
    OrderModule.linkable.order,
    {
        linkable: stripeConnect.linkable.payout,
        isList: true
    }
)