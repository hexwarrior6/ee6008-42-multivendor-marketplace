import { MedusaService } from "@medusajs/framework/utils"
import { CustomOrderRequest } from "./models/custom-order-request"

export class CustomOrderService extends MedusaService({
  CustomOrderRequest,
}) {}
