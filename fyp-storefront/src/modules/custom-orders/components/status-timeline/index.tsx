import { CheckCircleSolid } from "@medusajs/icons"
import { clx, Text } from "@medusajs/ui"

import {
  getCustomOrderTimeline,
  type CustomOrderStatus,
} from "@lib/util/custom-order-status"
import {
  getStorefrontDictionary,
  type StorefrontLocale,
} from "@lib/i18n/storefront"

type CustomOrderStatusTimelineProps = {
  status: CustomOrderStatus
  locale: StorefrontLocale
}

export default function CustomOrderStatusTimeline({
  status,
  locale,
}: CustomOrderStatusTimelineProps) {
  const steps = getCustomOrderTimeline(status)
  const t = getStorefrontDictionary(locale).customOrder

  if (status === "cancelled") {
    return (
      <div className="border border-ui-border-error bg-ui-bg-subtle px-4 py-3">
        <Text className="font-medium text-ui-fg-error">{t.cancelled}</Text>
      </div>
    )
  }

  return (
    <ol
      className="grid grid-cols-1 small:grid-cols-5 gap-4"
      aria-label={t.orderProgress}
    >
      {steps.map((step, index) => (
        <li
          key={step.status}
          className="relative flex small:flex-col items-center small:items-start gap-3"
        >
          {index > 0 && (
            <span
              aria-hidden="true"
              className={clx(
                "hidden small:block absolute h-px top-4 right-1/2 left-[-50%]",
                step.state === "upcoming"
                  ? "bg-ui-border-base"
                  : "bg-ui-fg-interactive"
              )}
            />
          )}
          <span
            className={clx(
              "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-ui-bg-base",
              step.state === "upcoming"
                ? "border-ui-border-base text-ui-fg-muted"
                : "border-ui-border-interactive text-ui-fg-interactive"
            )}
          >
            {step.state === "complete" ? (
              <CheckCircleSolid className="h-5 w-5" />
            ) : (
              <span className="text-xs font-medium">{index + 1}</span>
            )}
          </span>
          <div>
            <Text
              className={clx("font-medium", {
                "text-ui-fg-muted": step.state === "upcoming",
              })}
            >
              {t.status[step.status]}
            </Text>
            {step.state === "current" && (
              <Text size="xsmall" className="text-ui-fg-interactive">
                {t.currentStatus}
              </Text>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
