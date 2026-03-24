import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";

import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { STRIPE_CONNECT_MODULE } from "../../../../../modules/stripe-connect";
import { StoreDTO } from "@medusajs/framework/types";
import storePayoutAccountLink from "../../../../../links/store-payout";
import recalculateOnboardingWorkflow from "../../../../../workflows/recalculate-onboarding-status";
import { PayoutAccountStatus } from "../../../../../modules/stripe-connect/models/payoutAccount";

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
    const logger = req.scope.resolve("logger");
    const stripeConnectModuleService = req.scope.resolve(STRIPE_CONNECT_MODULE);
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const storeId = req.scope.resolve("currentStore") as Pick<StoreDTO,'id'>;
    logger.info(`Store ID in Stripe Connect Success Route: ${storeId.id}`);
    //get stripe account info check if payout enabled
    const { data: payoutAccount } = await query.graph({
      entity: storePayoutAccountLink.entryPoint,
      fields: ["payout_account.*"],
      filters: { "store_id": storeId.id },
    })

    const stripeAccount = await stripeConnectModuleService.retrieveStripeAccount(payoutAccount[0].payout_account.stripe_connect_id);
    // Check payouts_enabled status to see if onboarding is complete

    if (stripeAccount.payouts_enabled) {
      logger.info(`Stripe Payouts are enabled for Store ID: ${storeId.id}`);
      await stripeConnectModuleService.updatePayoutAccounts({
        id: payoutAccount[0].payout_account_id,
        status: PayoutAccountStatus.ACTIVE,
      })
      await recalculateOnboardingWorkflow(req.scope)
      .run({
        input: {
          storeId: storeId.id,
        }
      }).then(() => res.redirect('http://localhost:9000/app'));
    } else {
      logger.warn(`Stripe Payouts are NOT enabled for Store ID: ${storeId.id}`);
      res.redirect('http://localhost:9000/app/onboarding');
    }
};