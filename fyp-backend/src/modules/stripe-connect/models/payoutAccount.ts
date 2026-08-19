import { model } from "@medusajs/framework/utils"
import { Payout } from "./payout";

export enum PayoutAccountStatus {
    ACTIVE = "active",
    INACTIVE = "inactive",
    PENDING = "pending",
}
export const PayoutAccount = model.define("payout_account", {
    id: model.id().primaryKey(),
    stripe_connect_id: model.text(),
    status: model.enum(PayoutAccountStatus).default(PayoutAccountStatus.PENDING),
    payouts: model.hasMany(() => Payout)
})