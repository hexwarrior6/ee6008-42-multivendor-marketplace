import { model } from "@medusajs/framework/utils"
export const Onboarding = model.define("onboarding", {
    id: model.id({ prefix: "sel_onb"}).primaryKey(),
    store_information: model.boolean().default(false),
    locations_shipping: model.boolean().default(false),
    stripe_connect: model.boolean().default(false)
})