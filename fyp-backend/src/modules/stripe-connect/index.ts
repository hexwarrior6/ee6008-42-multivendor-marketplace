import { Module } from "@medusajs/framework/utils";
import { StripeConnectModuleService } from "./service";

export const STRIPE_CONNECT_MODULE = "stripe_connect"
export default Module(STRIPE_CONNECT_MODULE, {
    service: StripeConnectModuleService,
})