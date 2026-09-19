import { defineLink } from "@medusajs/framework/utils"
import CustomerModule from "@medusajs/medusa/customer"
import CustomOrderModule from "../modules/custom-order"

/** Associates customer_id with Medusa's Customer module. */
export default defineLink(
  CustomerModule.linkable.customer,
  {
    linkable: CustomOrderModule.linkable.customOrderRequest,
    isList: true,
  }
)
