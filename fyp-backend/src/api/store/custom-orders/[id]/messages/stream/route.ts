import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http";
import {
  CUSTOM_ORDER_MODULE,
  type CustomOrderService,
} from "../../../../../../modules/custom-order";
import {
  assertCustomOrderAccess,
  requireCustomerContext,
} from "../../../../../utils/authz";
import { streamCustomOrderMessages } from "../../../../../utils/custom-order-message-stream";

export const GET = async (
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse
) => {
  requireCustomerContext(req);
  const service = req.scope.resolve(CUSTOM_ORDER_MODULE) as CustomOrderService;
  const order = await service.retrieveCustomOrderRequest(req.params.id);
  await assertCustomOrderAccess(req, order, { allowBackoffice: false });
  await streamCustomOrderMessages(req, res, service, order.id);
};
