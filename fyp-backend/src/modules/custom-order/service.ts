import { MedusaService } from "@medusajs/framework/utils"
import {
  CustomOrderMessage,
  CustomOrderRequest,
} from "./models/custom-order-request"

export class CustomOrderService extends MedusaService({
  CustomOrderRequest,
  CustomOrderMessage,
}) {}
