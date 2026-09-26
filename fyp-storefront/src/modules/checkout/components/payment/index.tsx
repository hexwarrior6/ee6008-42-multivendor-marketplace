"use client"

import { isStripeLike, isWeChatPay, paymentInfoMap } from "@lib/constants"
import { initiatePaymentSession } from "@lib/data/cart"
import { RadioGroup } from "@headlessui/react"
import { CheckCircleSolid, CreditCard } from "@medusajs/icons"
import { Button, Container, Heading, Text, clx } from "@medusajs/ui"
import ErrorMessage from "@modules/checkout/components/error-message"
import PaymentContainer from "@modules/checkout/components/payment-container"
import WeChatQrCode from "@modules/checkout/components/wechat-qr-code"
import Divider from "@modules/common/components/divider"
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js"
import type { StripePaymentElementChangeEvent } from "@stripe/stripe-js"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react"
import { StripeContext } from "../payment-wrapper/stripe-wrapper"

type StripeSubmit = () => Promise<string | null>

const StripePaymentFields = ({
  setComplete,
  submitRef,
}: {
  setComplete: (complete: boolean) => void
  submitRef: MutableRefObject<StripeSubmit | null>
}) => {
  const stripe = useStripe()
  const elements = useElements()

  useEffect(() => {
    submitRef.current = async () => {
      if (!stripe || !elements) return "银行卡支付尚未准备好，请稍后重试。"
      const result = await elements.submit()
      return result.error?.message || null
    }
    return () => {
      submitRef.current = null
    }
  }, [elements, stripe, submitRef])

  return (
    <div className="mt-4">
      <PaymentElement
        onChange={(event: StripePaymentElementChangeEvent) =>
          setComplete(event.complete)
        }
        options={{ layout: "accordion" }}
      />
    </div>
  )
}

const Payment = ({
  cart,
  availablePaymentMethods,
}: {
  cart: any
  availablePaymentMethods: any[]
}) => {
  const activeSession = cart.payment_collection?.payment_sessions?.find(
    (session: any) => ["pending", "requires_more"].includes(session.status)
  )
  const activeProviderId = activeSession?.provider_id as string | undefined
  const stripeReady = useContext(StripeContext)
  const stripeSubmitRef = useRef<StripeSubmit | null>(null)

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stripeComplete, setStripeComplete] = useState(false)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(
    activeProviderId || ""
  )

  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const isOpen = searchParams.get("step") === "payment"

  const providerIds = useMemo(
    () => availablePaymentMethods?.map((method) => method.id) || [],
    [availablePaymentMethods]
  )

  useEffect(() => {
    if (activeProviderId) {
      setSelectedPaymentMethod(activeProviderId)
    }
  }, [activeProviderId])

  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams)
      params.set(name, value)
      return params.toString()
    },
    [searchParams]
  )

  const setPaymentMethod = async (providerId: string) => {
    setError(null)
    setIsLoading(true)
    setSelectedPaymentMethod(providerId)
    setStripeComplete(false)
    try {
      await initiatePaymentSession(cart, { provider_id: providerId })
      router.refresh()
    } catch (err: any) {
      setError(err.message || "无法初始化支付方式，请重试。")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!activeSession && isOpen && providerIds.length === 1) {
      setPaymentMethod(providerIds[0])
    }
    // Provider list and active session are the only values that should trigger auto-init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProviderId, isOpen, providerIds.join(",")])

  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)
    try {
      if (!activeSession || activeProviderId !== selectedPaymentMethod) {
        setError("请先选择并初始化支付方式。")
        return
      }
      if (isStripeLike(selectedPaymentMethod)) {
        const stripeError = await stripeSubmitRef.current?.()
        if (stripeError || !stripeSubmitRef.current) {
          setError(stripeError || "银行卡支付尚未准备好，请稍后重试。")
          return
        }
      }
      router.push(pathname + "?" + createQueryString("step", "review"), {
        scroll: false,
      })
    } catch (err: any) {
      setError(err.message || "支付方式验证失败。")
    } finally {
      setIsLoading(false)
    }
  }

  const handleEdit = () => {
    router.push(pathname + "?" + createQueryString("step", "payment"), {
      scroll: false,
    })
  }

  const paidByGiftcard =
    cart?.gift_cards && cart.gift_cards.length > 0 && cart.total === 0
  const hasShipping = (cart?.shipping_methods?.length || 0) > 0
  const paymentReady = (activeSession && hasShipping) || paidByGiftcard
  const codeUrl = activeSession?.data?.code_url as string | undefined
  const isMock = activeSession?.data?.mock === true
  const continueDisabled =
    isLoading ||
    (!paidByGiftcard && !activeSession) ||
    (isStripeLike(selectedPaymentMethod) && (!stripeComplete || !stripeReady))

  return (
    <div className="bg-white">
      <div className="mb-6 flex flex-row items-center justify-between">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row items-baseline gap-x-2 text-3xl-regular",
            {
              "pointer-events-none select-none opacity-50":
                !isOpen && !paymentReady,
            }
          )}
        >
          支付方式
          {!isOpen && paymentReady && <CheckCircleSolid />}
        </Heading>
        {!isOpen && paymentReady && (
          <Text>
            <button
              onClick={handleEdit}
              className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
              data-testid="edit-payment-button"
            >
              修改
            </button>
          </Text>
        )}
      </div>

      <div className={isOpen ? "block" : "hidden"}>
        {!paidByGiftcard && providerIds.length > 0 && (
          <RadioGroup value={selectedPaymentMethod} onChange={setPaymentMethod}>
            {providerIds.map((providerId) => (
              <PaymentContainer
                key={providerId}
                paymentProviderId={providerId}
                selectedPaymentOptionId={selectedPaymentMethod}
                paymentInfoMap={paymentInfoMap}
                disabled={isLoading}
              >
                {providerId === selectedPaymentMethod &&
                  isStripeLike(providerId) &&
                  stripeReady &&
                  activeProviderId === providerId && (
                    <StripePaymentFields
                      setComplete={(complete) => {
                        setStripeComplete(complete)
                        if (complete) setError(null)
                      }}
                      submitRef={stripeSubmitRef}
                    />
                  )}

                {providerId === selectedPaymentMethod &&
                  isWeChatPay(providerId) &&
                  activeProviderId === providerId &&
                  codeUrl && (
                    <div className="mt-4 flex flex-col items-center gap-3 rounded-lg bg-ui-bg-subtle p-5">
                      <WeChatQrCode value={codeUrl} />
                      <Text className="text-center text-ui-fg-subtle">
                        请使用微信“扫一扫”完成支付，然后进入订单确认。
                      </Text>
                      {isMock && (
                        <Text className="rounded-full bg-yellow-100 px-3 py-1 text-xs text-yellow-800">
                          本地模拟模式：不会产生真实扣款
                        </Text>
                      )}
                    </div>
                  )}
              </PaymentContainer>
            ))}
          </RadioGroup>
        )}

        {!paidByGiftcard && providerIds.length === 0 && (
          <Text className="text-ui-fg-error">
            当前区域没有可用支付方式，请检查后台区域配置。
          </Text>
        )}

        {paidByGiftcard && <Text>礼品卡已支付全部金额。</Text>}
        <ErrorMessage
          error={error}
          data-testid="payment-method-error-message"
        />
        <Button
          size="large"
          className="mt-6"
          onClick={handleSubmit}
          isLoading={isLoading}
          disabled={continueDisabled}
          data-testid="submit-payment-button"
        >
          继续确认订单
        </Button>
      </div>

      <div className={isOpen ? "hidden" : "block"}>
        {paymentReady && activeSession ? (
          <div className="flex w-full items-start gap-x-1">
            <div className="flex w-1/3 flex-col">
              <Text className="mb-1 txt-medium-plus text-ui-fg-base">
                支付方式
              </Text>
              <Text
                className="txt-medium text-ui-fg-subtle"
                data-testid="payment-method-summary"
              >
                {paymentInfoMap[activeProviderId || ""]?.title ||
                  activeProviderId}
              </Text>
            </div>
            <div className="flex w-1/3 flex-col">
              <Text className="mb-1 txt-medium-plus text-ui-fg-base">
                支付详情
              </Text>
              <div className="flex items-center gap-2 txt-medium text-ui-fg-subtle">
                <Container className="flex h-7 w-fit items-center bg-ui-button-neutral-hover p-2">
                  {paymentInfoMap[activeProviderId || ""]?.icon || (
                    <CreditCard />
                  )}
                </Container>
                <Text>
                  {isWeChatPay(activeProviderId)
                    ? "扫码支付"
                    : "将在下一步完成"}
                </Text>
              </div>
            </div>
          </div>
        ) : paidByGiftcard ? (
          <Text>礼品卡</Text>
        ) : null}
      </div>
      <Divider className="mt-8" />
    </div>
  )
}

export default Payment
