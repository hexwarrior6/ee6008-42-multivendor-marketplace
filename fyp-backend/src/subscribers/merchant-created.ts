import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { MerchantWorkflowEvents } from "@techlabi/medusa-marketplace-plugin/workflows/create-store/index";
import { STRIPE_CONNECT_MODULE } from "../modules/stripe-connect";
import { StripeConnectModuleService } from "../modules/stripe-connect/service";
import { OnboardingService } from "../modules/onboarding/service";
import { UserDTO } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import { ONBOARDING_MODULE } from "../modules/onboarding";

export default async function merchantCreatedHandler({
    event: { data },
    container,
}: SubscriberArgs<UserDTO>) {
    // const logger = container.resolve("logger")
    // const link = container.resolve(ContainerRegistrationKeys.LINK)
    // const onboardingModule = container.resolve<OnboardingService>(ONBOARDING_MODULE);
    // const stripeConnectService = container.resolve<StripeConnectModuleService>(STRIPE_CONNECT_MODULE);
    // // console.log("data in merchant created subscriber", data);
    // const query = container.resolve(ContainerRegistrationKeys.QUERY)
    // const userId = data.id;

    // const { data: stores } = await query.graph({
    //     entity:"user_store",
    //     fields: ["store.*"],
    //     filters: { user_id: userId },
    // });
    // console.log(`stores for user ${userId}` , stores[0].store?.id);
    // const storeId = stores[0].store?.id;

    //Create onboarding record for the new merchant
    // try {
    //     const onboardActivity = logger.activity("Creating onboarding record for new merchant");
    //     const onboarding = await onboardingModule.createOnboardings({})
    //     logger.progress(onboardActivity, 'Creating link between store and onboarding record');
    //     await link.create({
    //         [Modules.STORE]: { store_id: storeId },
    //         [ONBOARDING_MODULE]: { onboarding_id: onboarding.id },
    //     })
    //     logger.success(onboardActivity, "Onboarding record created for new merchant")
    // } catch (error) {
    //     await link.dismiss({
    //         [Modules.STORE]: { store_id: storeId },
    //         [ONBOARDING_MODULE]: { onboarding_id: onboarding.id },
    //     })
    // }
    


    // const stripeConnectActivity = logger.activity("Creating Stripe Connected Account for Merchant");

}

export const config: SubscriberConfig = {
    event: MerchantWorkflowEvents.CREATED,
}