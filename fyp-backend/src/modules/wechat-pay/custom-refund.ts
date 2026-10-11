import { MedusaError } from "@medusajs/framework/utils"
import {
  WeChatApiError,
  type WeChatPayClient,
  type WeChatRefund,
} from "./client"

export type FullRefundExpectation = {
  reference: string
  outTradeNo: string
  transactionId: string
  sessionId: string
  minorAmount: number
  appId: string
  merchantId: string
}

export function assertFullRefundReceipt(
  receipt: WeChatRefund,
  expected: Pick<
    FullRefundExpectation,
    "reference" | "outTradeNo" | "transactionId" | "minorAmount"
  >
) {
  if (
    !receipt ||
    typeof receipt.refund_id !== "string" ||
    !receipt.refund_id ||
    receipt.out_refund_no !== expected.reference ||
    receipt.out_trade_no !== expected.outTradeNo ||
    receipt.transaction_id !== expected.transactionId ||
    receipt.amount?.total !== expected.minorAmount ||
    receipt.amount?.refund !== expected.minorAmount ||
    receipt.amount?.currency !== "CNY" ||
    !["SUCCESS", "PROCESSING", "CLOSED", "ABNORMAL"].includes(receipt.status)
  ) {
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Refund receipt does not match the verified full payment"
    )
  }
  if (["CLOSED", "ABNORMAL"].includes(receipt.status))
    throw new MedusaError(
      MedusaError.Types.CONFLICT,
      "Refund requires administrator review; automatic resubmission refused"
    )
}

/** Query before submission. Ambiguous failures NEVER permit a new reference. */
export async function resolveFullRefund(
  client: Pick<WeChatPayClient, "queryRefund" | "queryOrder" | "refund">,
  expected: FullRefundExpectation,
  reason: string
) {
  let receipt: WeChatRefund
  try {
    receipt = await client.queryRefund(expected.reference)
  } catch (error) {
    if (
      !(error instanceof WeChatApiError) ||
      error.providerCode !== "RESOURCE_NOT_EXISTS" ||
      error.httpStatus !== 404
    )
      throw error
    const order = await client.queryOrder(expected.outTradeNo)
    if (
      order.trade_state !== "SUCCESS" ||
      order.appid !== expected.appId ||
      order.mchid !== expected.merchantId ||
      order.out_trade_no !== expected.outTradeNo ||
      order.transaction_id !== expected.transactionId ||
      order.attach !== expected.sessionId ||
      order.amount?.total !== expected.minorAmount ||
      order.amount?.currency !== "CNY"
    ) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "Original provider payment must be verified before submitting a refund"
      )
    }
    receipt = await client.refund({
      out_trade_no: expected.outTradeNo,
      out_refund_no: expected.reference,
      reason: Array.from(reason).slice(0, 80).join(""),
      amount: {
        total: expected.minorAmount,
        refund: expected.minorAmount,
        currency: "CNY",
      },
    })
  }
  assertFullRefundReceipt(receipt, expected)
  return receipt
}
