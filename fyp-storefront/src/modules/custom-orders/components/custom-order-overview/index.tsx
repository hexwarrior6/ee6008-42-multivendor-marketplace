import { Button, Heading, Text } from "@medusajs/ui"

import type { CustomOrder } from "@lib/data/custom-orders"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CustomOrderCard from "@modules/custom-orders/components/custom-order-card"

export default function CustomOrderOverview({
  orders,
}: {
  orders: CustomOrder[]
}) {
  if (!orders.length) {
    return (
      <div className="border border-ui-border-base p-8 text-center">
        <Heading level="h2" className="text-lg">
          暂无定制需求
        </Heading>
        <Text className="text-ui-fg-muted mt-2 mb-5">
          访问手艺人主页，开始您的定制项目。
        </Text>
        <LocalizedClientLink href="/store">
          <Button variant="secondary">浏览商品</Button>
        </LocalizedClientLink>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {orders.map((order) => (
        <CustomOrderCard key={order.id} order={order} />
      ))}
    </div>
  )
}
