type ShippingOption = {
  id: string
  price_type: string
  amount?: number | null
  insufficient_inventory?: boolean
}

export function getShippingAmount(option: ShippingOption, prices: Record<string, number>) {
  const amount = option.price_type === "calculated" ? prices[option.id] : option.amount
  return typeof amount === "number" && Number.isFinite(amount) && amount >= 0 ? amount : undefined
}

export function isShippingUnavailable(option: ShippingOption, prices: Record<string, number>, loading: boolean) {
  return !!option.insufficient_inventory ||
    (option.price_type === "calculated" && loading) ||
    getShippingAmount(option, prices) === undefined
}

export async function resolveShippingPrices(
  options: ShippingOption[],
  cartId: string,
  calculate: (id: string, cartId: string) => Promise<{ amount?: number | null } | null>
) {
  const calculated = options.filter(option => option.price_type === "calculated")
  const results = await Promise.allSettled(calculated.map(option => calculate(option.id, cartId)))
  const prices: Record<string, number> = {}
  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return
    const amount = result.value?.amount
    if (typeof amount === "number" && Number.isFinite(amount) && amount >= 0) {
      prices[calculated[index].id] = amount
    }
  })
  return prices
}
