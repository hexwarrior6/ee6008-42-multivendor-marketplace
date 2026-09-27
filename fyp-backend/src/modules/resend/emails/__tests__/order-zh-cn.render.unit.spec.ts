import React from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { orderPlacedEmailZhCN, orderDeliveredEmailZhCN } from "../order-zh-cn"
import { resolveOrderEmailLocale } from "../../locale"

const baseOrder = {
  id: "order_01TEST",
  display_id: 42,
  currency_code: "cny",
  total: 120,
  item_total: 120,
  tax_total: 0,
  shipping_total: 0,
  items: [
    {
      id: "item_01TEST",
      product_title: "手作陶瓷杯",
      variant_title: "默认规格",
      quantity: 1,
      total: 120,
      thumbnail: null,
    },
  ],
  customer: { first_name: "小明" },
  shipping_address: { first_name: "小明", country_code: "cn" },
} as any

describe("Chinese order email templates", () => {
  it("renders the order-placed email in Simplified Chinese", () => {
    const html = renderToStaticMarkup(
      React.createElement(orderPlacedEmailZhCN, { order: baseOrder })
    )
    expect(html).toContain("我们已收到您的订单")
    expect(html).toContain("手作市集")
    expect(html).toContain("订单号：#42")
    expect(html).toContain('lang="zh-CN"')
  })

  it("renders the order-delivered email in Simplified Chinese", () => {
    const html = renderToStaticMarkup(
      React.createElement(orderDeliveredEmailZhCN, { order: baseOrder })
    )
    expect(html).toContain("您的订单已送达")
    expect(html).toContain("感谢您的支持")
    expect(html).toContain("点击这里为您的商品写评价")
    expect(html).toContain(`/order/${baseOrder.id}/reviews`)
  })

  it("resolves the email locale from customer metadata and shipping country", () => {
    expect(
      resolveOrderEmailLocale({
        customer: { metadata: { locale: "zh-CN" } },
        shipping_address: { country_code: "us" },
      })
    ).toBe("zh-CN")
    expect(
      resolveOrderEmailLocale({
        customer: { metadata: null },
        shipping_address: { country_code: "CN" },
      })
    ).toBe("zh-CN")
    expect(
      resolveOrderEmailLocale({
        customer: { metadata: null },
        shipping_address: { country_code: "us" },
      })
    ).toBe("en")
  })
})
