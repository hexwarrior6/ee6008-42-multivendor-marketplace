import { CheckCircleSolid } from "@medusajs/icons"
import { clx, Text } from "@medusajs/ui"

import {
  getCustomOrderTimeline,
  type CustomOrderStatus,
} from "@lib/util/custom-order-status"

type CustomOrderStatusTimelineProps = {
  status: CustomOrderStatus
}

export default function CustomOrderStatusTimeline({
  status,
}: CustomOrderStatusTimelineProps) {
  const steps = getCustomOrderTimeline(status)

  if (status === "cancelled") {
    return (
      <div className="border border-ui-border-error bg-ui-bg-subtle px-4 py-3">
        <Text className="font-medium text-ui-fg-error">Order cancelled</Text>
      </div>
    )
  }

  return (
    <ol
      className="grid grid-cols-1 small:grid-cols-5 gap-4"
      aria-label="Custom order progress"
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
              {step.label}
            </Text>
            {step.state === "current" && (
              <Text size="xsmall" className="text-ui-fg-interactive">
                Current status
              </Text>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
