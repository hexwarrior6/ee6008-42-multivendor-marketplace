type PriceItem = {
  total?: number | null
  original_total?: number | null
  unit_price: number
  quantity: number
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value)

export function getLineItemPrices(item: PriceItem) {
  const quantity = finite(item.quantity) && item.quantity > 0 ? item.quantity : 0
  const baseUnitPrice = finite(item.unit_price) ? item.unit_price : 0
  const currentPrice = finite(item.total) ? item.total : baseUnitPrice * quantity
  // Missing original totals do not imply a discount.
  const originalPrice = finite(item.original_total) ? item.original_total : currentPrice
  const hasReducedPrice = originalPrice > 0 && currentPrice < originalPrice
  return {
    currentPrice,
    originalPrice,
    hasReducedPrice,
    unitPrice: quantity > 0 ? currentPrice / quantity : baseUnitPrice,
    originalUnitPrice: quantity > 0 ? originalPrice / quantity : baseUnitPrice,
    percentageDiff: hasReducedPrice
      ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
      : 0,
  }
}
