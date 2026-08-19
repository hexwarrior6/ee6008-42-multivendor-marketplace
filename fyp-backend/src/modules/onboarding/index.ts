import { Module } from "@medusajs/framework/utils";
import { OnboardingService } from "./service";

export const ONBOARDING_MODULE = "onboarding"
export default Module(ONBOARDING_MODULE, {
    service: OnboardingService,
})