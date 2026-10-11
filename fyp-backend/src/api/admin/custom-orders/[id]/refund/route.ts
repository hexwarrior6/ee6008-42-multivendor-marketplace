import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import {
  adminRefundOrder,
  refundCustomOrder,
  refundSummary,
} from "../../../../utils/custom-order-refunds"
export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const { order } = await adminRefundOrder(req)
  res.json({ refund: refundSummary(order) })
}
export const POST = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  const result = await refundCustomOrder(req)
  res.status(result.refund?.status === "completed" ? 200 : 202).json(result)
}
