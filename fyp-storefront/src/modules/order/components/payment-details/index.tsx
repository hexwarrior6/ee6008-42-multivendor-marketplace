"use client"

import { Container, Heading, Text } from "@medusajs/ui"

import { isStripeLike, isWeChatPay, paymentInfoMap } from "@lib/constants"
import { useStorefrontI18n } from "@lib/i18n/storefront-context"
import Divider from "@modules/common/components/divider"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

type PaymentDetailsProps = {
  order: HttpTypes.StoreOrder
}

const PaymentDetails = ({ order }: PaymentDetailsProps) => {
  const { locale, t } = useStorefrontI18n()
  const payment = order.payment_collections?.[0].payments?.[0]
  const paymentTitle = payment
    ? isWeChatPay(payment.provider_id)
      ? t.checkout.wechatPay
      : isStripeLike(payment.provider_id)
      ? t.checkout.creditCard
      : t.checkout.manualPayment
    : ""

  return (
    <div>
      <Heading level="h2" className="flex flex-row text-3xl-regular my-6">
        {t.order.payment}
      </Heading>
      <div>
        {payment && (
          <div className="flex items-start gap-x-1 w-full">
            <div className="flex flex-col w-1/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                {t.order.paymentMethod}
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method"
              >
                {paymentTitle}
              </Text>
            </div>
            <div className="flex flex-col w-2/3">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                {t.order.paymentDetails}
              </Text>
              <div className="flex gap-2 txt-medium text-ui-fg-subtle items-center">
                <Container className="flex items-center h-7 w-fit p-2 bg-ui-button-neutral-hover">
                  {paymentInfoMap[payment.provider_id].icon}
                </Container>
                <Text data-testid="payment-amount">
                  {isStripeLike(payment.provider_id) && payment.data?.card_last4
                    ? `**** **** **** ${payment.data.card_last4}`
                    : `${convertToLocale({
                        amount: payment.amount,
                        currency_code: order.currency_code,
                      })}, ${t.order.paidAt}: ${new Date(
                        payment.created_at ?? ""
                      ).toLocaleString(locale)}`}
                </Text>
              </div>
            </div>
          </div>
        )}
      </div>

      <Divider className="mt-8" />
    </div>
  )
}

export default PaymentDetails
