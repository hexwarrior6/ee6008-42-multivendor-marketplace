"use client"

import FilterRadioGroup from "@modules/common/components/filter-radio-group"
import { useStorefrontI18n } from "@lib/i18n/storefront-context"

export type SortOptions = "price_asc" | "price_desc" | "created_at"

type SortProductsProps = {
  sortBy: SortOptions
  setQueryParams: (name: string, value: SortOptions) => void
  "data-testid"?: string
}

const SortProducts = ({
  "data-testid": dataTestId,
  sortBy,
  setQueryParams,
}: SortProductsProps) => {
  const { t } = useStorefrontI18n()
  const sortOptions = [
    { value: "created_at", label: t.catalog.latestArrivals },
    { value: "price_asc", label: t.catalog.priceLowHigh },
    { value: "price_desc", label: t.catalog.priceHighLow },
  ]

  const handleChange = (value: SortOptions) => {
    setQueryParams("sortBy", value)
  }

  return (
    <FilterRadioGroup
      title={t.catalog.sortBy}
      items={sortOptions}
      value={sortBy}
      handleChange={handleChange}
      data-testid={dataTestId}
    />
  )
}

export default SortProducts
