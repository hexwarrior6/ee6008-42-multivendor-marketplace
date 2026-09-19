import { Module } from "@medusajs/framework/utils"
import { CustomOrderService } from "./service"

export const CUSTOM_ORDER_MODULE = "custom_order"
export { CustomOrderService }
export type {
  CustomOrderMutation,
  CreateCustomOrderInput,
} from "./service"

export default Module(CUSTOM_ORDER_MODULE, {
  service: CustomOrderService,
})
