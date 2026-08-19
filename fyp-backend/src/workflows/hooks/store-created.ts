import { createStoreWorkflow } from "@techlabi/medusa-marketplace-plugin/workflows/create-store/index";
import createOnboardingFromStoreWorkflow from "../create-onboarding-from-store";
import createStripeConnectAccountWorkflow from "../create-stripe-connect-from-store";
import type { CreateOnboardingFromStoreWorkflowInput } from "../create-onboarding-from-store";

createStoreWorkflow.hooks.storeCreated(
    async ({ storeId }, { container } ) => {
        const workflow = createOnboardingFromStoreWorkflow(container)

        await workflow.run({
           input: {
                storeId,
           } as CreateOnboardingFromStoreWorkflowInput,
        });

        const stripeConnectWorkflow = createStripeConnectAccountWorkflow(container)

        stripeConnectWorkflow.run({
            input: {
                storeId,
            },
        });
    },
);