import onboarding from "../modules/onboarding";
import StoreModule from "@medusajs/medusa/store";
import { defineLink } from "@medusajs/framework/utils";

export default defineLink(
    {
        linkable: StoreModule.linkable.store,
    },
    {
        linkable: onboarding.linkable.onboarding,
    }
)