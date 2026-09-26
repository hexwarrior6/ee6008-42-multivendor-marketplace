import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import { BigNumberValue, CustomerDTO, OrderDTO } from "@medusajs/framework/types"

type LocalizedOrder = OrderDTO & { customer: CustomerDTO }

type OrderEmailProps = { order: LocalizedOrder }

function formatPrice(value: BigNumberValue, currency: string) {
  const amount = typeof value === "number" ? value : Number(value?.toString() || 0)
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "narrowSymbol",
  }).format(amount)
}

function OrderSummary({ order }: OrderEmailProps) {
  return (
    <Container className="px-6">
      <Heading className="mb-4 text-xl font-semibold text-gray-800">订单明细</Heading>
      <Text className="text-sm text-gray-500">订单号：#{order.display_id}</Text>
      {order.items?.map((item) => (
        <Section key={item.id} className="border-b border-gray-200 py-3">
          <Text className="m-0 font-semibold text-gray-800">{item.product_title}</Text>
          <Text className="m-0 text-sm text-gray-600">
            {item.variant_title} × {item.quantity}
          </Text>
          <Text className="mt-1 font-semibold text-gray-800">
            {formatPrice(item.total, order.currency_code)}
          </Text>
        </Section>
      ))}
      <Text className="text-right text-lg font-bold text-gray-900">
        合计：{formatPrice(order.total, order.currency_code)}
      </Text>
    </Container>
  )
}

function ChineseOrderEmail({ order, delivered }: OrderEmailProps & { delivered: boolean }) {
  const name = order.customer?.first_name || order.shipping_address?.first_name || "顾客"
  const title = delivered ? "您的订单已送达" : "我们已收到您的订单"

  return (
    <Html lang="zh-CN">
      <Head />
      <Preview>{title}</Preview>
      <Body className="mx-auto my-10 max-w-2xl bg-white font-sans">
        <Section className="bg-[#27272a] px-6 py-4 text-white">
          <Text className="m-0 text-lg font-semibold">手作市集</Text>
        </Section>
        <Container className="p-6">
          <Heading className="text-center text-2xl font-bold text-gray-800">{title}</Heading>
          <Text className="text-gray-600">
            {name}，您好！{delivered ? "感谢您的支持，欢迎再次选购。" : "我们正在处理订单，发货后会及时通知您。"}
          </Text>
        </Container>
        <OrderSummary order={order} />
        <Section className="mt-8 bg-gray-50 p-6">
          <Text className="text-center text-sm text-gray-500">
            如有疑问，请回复本邮件并注明订单编号 #{order.display_id}。
          </Text>
        </Section>
      </Body>
    </Html>
  )
}

export const orderPlacedEmailZhCN = (props: OrderEmailProps) => (
  <ChineseOrderEmail {...props} delivered={false} />
)

export const orderDeliveredEmailZhCN = (props: OrderEmailProps) => (
  <ChineseOrderEmail {...props} delivered />
)
