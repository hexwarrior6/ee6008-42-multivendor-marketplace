"use client"

import Back from "@modules/common/icons/back"
import FastDelivery from "@modules/common/icons/fast-delivery"
import Refresh from "@modules/common/icons/refresh"

import Accordion from "./accordion"
import { StoreProductWithStore } from "types/global"
import Link from "next/link"

type ProductTabsProps = {
  product: StoreProductWithStore
  countryCode: string
  artisanProfileId: string | null
}

const ProductTabs = ({
  product,
  countryCode,
  artisanProfileId,
}: ProductTabsProps) => {
  const tabs = [
    {
      label: "商品信息",
      component: <ProductInfoTab product={product} />,
    },
    {
      label: "配送与退换货",
      component: <ShippingInfoTab />,
    },
    {
      label: "店铺信息",
      component: (
        <StoreInfoTab
          product={product}
          countryCode={countryCode}
          artisanProfileId={artisanProfileId}
        />
      ),
    },
  ]

  return (
    <div className="w-full">
      <Accordion type="multiple">
        {tabs.map((tab, i) => (
          <Accordion.Item
            key={i}
            title={tab.label}
            headingSize="medium"
            value={tab.label}
          >
            {tab.component}
          </Accordion.Item>
        ))}
      </Accordion>
    </div>
  )
}

const ProductInfoTab = ({ product }: Pick<ProductTabsProps, "product">) => {
  return (
    <div className="text-small-regular py-8">
      <div className="grid grid-cols-2 gap-x-8">
        <div className="flex flex-col gap-y-4">
          <div>
            <span className="font-semibold">材质</span>
            <p>{product.material ? product.material : "-"}</p>
          </div>
          <div>
            <span className="font-semibold">原产地</span>
            <p>{product.origin_country ? product.origin_country : "-"}</p>
          </div>
          <div>
            <span className="font-semibold">类型</span>
            <p>{product.type ? product.type.value : "-"}</p>
          </div>
        </div>
        <div className="flex flex-col gap-y-4">
          <div>
            <span className="font-semibold">重量</span>
            <p>{product.weight ? `${product.weight} g` : "-"}</p>
          </div>
          <div>
            <span className="font-semibold">尺寸</span>
            <p>
              {product.length && product.width && product.height
                ? `${product.length}L x ${product.width}W x ${product.height}H`
                : "-"}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const ShippingInfoTab = () => {
  return (
    <div className="text-small-regular py-8">
      <div className="grid grid-cols-1 gap-y-8">
        <div className="flex items-start gap-x-2">
          <FastDelivery />
          <div>
            <span className="font-semibold">快速配送</span>
            <p className="max-w-sm">
              商品将在 3–5 个工作日内送达取货点或您的家中。
            </p>
          </div>
        </div>
        <div className="flex items-start gap-x-2">
          <Refresh />
          <div>
            <span className="font-semibold">简单换货</span>
            <p className="max-w-sm">
              如果商品不合适，无需担心，我们会为您更换新品。
            </p>
          </div>
        </div>
        <div className="flex items-start gap-x-2">
          <Back />
          <div>
            <span className="font-semibold">轻松退货</span>
            <p className="max-w-sm">
              退回商品即可获得退款，我们会尽力让退货流程简单顺利。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

const StoreInfoTab = ({
  product,
  countryCode,
  artisanProfileId,
}: ProductTabsProps) => {
  const store = product.store

  return (
    <div className="text-small-regular py-8">
      <div className="grid grid-cols-1 gap-y-4">
        <div>
          <span className="font-semibold">店铺名称</span>
          <p>{store?.name || "手作市集"}</p>
        </div>
        {artisanProfileId && (
          <Link
            href={`/${countryCode}/artisans/${artisanProfileId}`}
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover underline underline-offset-4"
          >
            查看手艺人主页
          </Link>
        )}
      </div>
    </div>
  )
}

export default ProductTabs
