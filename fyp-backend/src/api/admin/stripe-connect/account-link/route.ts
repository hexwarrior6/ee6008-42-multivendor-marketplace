import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import storePayoutAccountLink from "../../../../links/store-payout";
import { STRIPE_CONNECT_MODULE } from "../../../../modules/stripe-connect";


export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  
    const userModuleService = req.scope.resolve(Modules.USER)
    const logger = req.scope.resolve("logger")
    const query = req.scope.resolve("query")
    const stripeConnectModuleService = req.scope.resolve(STRIPE_CONNECT_MODULE)
      
    const user = await userModuleService.retrieveUser(req.auth_context.actor_id)
    
    const { data: store } = await query.graph({
        entity: "user_store",
        fields: ["store.*"],
        filters: { "user_id": user.id },
    })

    const { data: stripeConnectAccount } = await query.graph({
        entity: storePayoutAccountLink.entryPoint,
        fields: ["payout_account.*"],
        filters: { "store_id": store[0].store?.id },
    })
    const stripeConnectAccountId = stripeConnectAccount[0]?.payout_account?.stripe_connect_id;
    logger.info(`Retrieved stripeConnectAccount: ${stripeConnectAccountId}`);

    const url = await stripeConnectModuleService.createAccountLink(stripeConnectAccountId);

  res.status(201).json(url);
};