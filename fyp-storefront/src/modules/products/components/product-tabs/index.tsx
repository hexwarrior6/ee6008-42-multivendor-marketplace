"use client"

import Back from "@modules/common/icons/back"
import FastDelivery from "@modules/common/icons/fast-delivery"
import Refresh from "@modules/common/icons/refresh"

import Accordion from "./accordion"
import { StoreProductWithStore } from "types/global"
import Link from "next/link"
import { useStorefrontI18n } from "@lib/i18n/storefront-context"

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
  const { t } = useStorefrontI18n()
  const tabs = [
    {
      label: t.catalog.productInformation,
      component: <ProductInfoTab product={product} />,
    },
    {
      label: t.catalog.shippingReturns,
      component: <ShippingInfoTab />,
    },
    {
      label: t.catalog.storeInformation,
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
  const { t } = useStorefrontI18n()

  return (
    <div className="text-small-regular py-8">
      <div className="grid grid-cols-2 gap-x-8">
        <div className="flex flex-col gap-y-4">
          <div>
            <span className="font-semibold">{t.catalog.material}</span>
            <p>{product.material ? product.material : "-"}</p>
          </div>
          <div>
            <span className="font-semibold">{t.catalog.originCountry}</span>
            <p>{product.origin_country ? product.origin_country : "-"}</p>
          </div>
          <div>
            <span className="font-semibold">{t.catalog.type}</span>
            <p>{product.type ? product.type.value : "-"}</p>
          </div>
        </div>
        <div className="flex flex-col gap-y-4">
          <div>
            <span className="font-semibold">{t.catalog.weight}</span>
            <p>{product.weight ? `${product.weight} g` : "-"}</p>
          </div>
          <div>
            <span className="font-semibold">{t.catalog.dimensions}</span>
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
  const { t } = useStorefrontI18n()

  return (
    <div className="text-small-regular py-8">
      <div className="grid grid-cols-1 gap-y-8">
        <div className="flex items-start gap-x-2">
          <FastDelivery />
          <div>
            <span className="font-semibold">{t.catalog.fastDelivery}</span>
            <p className="max-w-sm">{t.catalog.fastDeliveryBody}</p>
          </div>
        </div>
        <div className="flex items-start gap-x-2">
          <Refresh />
          <div>
            <span className="font-semibold">{t.catalog.easyExchanges}</span>
            <p className="max-w-sm">{t.catalog.easyExchangesBody}</p>
          </div>
        </div>
        <div className="flex items-start gap-x-2">
          <Back />
          <div>
            <span className="font-semibold">{t.catalog.easyReturns}</span>
            <p className="max-w-sm">{t.catalog.easyReturnsBody}</p>
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
  const { t } = useStorefrontI18n()

  return (
    <div className="text-small-regular py-8">
      <div className="grid grid-cols-1 gap-y-4">
        <div>
          <span className="font-semibold">{t.catalog.storeName}</span>
          <p>{store?.name || t.catalog.storeFallback}</p>
        </div>
        {artisanProfileId && (
          <Link
            href={`/${countryCode}/artisans/${artisanProfileId}`}
            className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover underline underline-offset-4"
          >
            {t.catalog.viewArtisanProfile}
          </Link>
        )}
      </div>
    </div>
  )
}

export default ProductTabs
