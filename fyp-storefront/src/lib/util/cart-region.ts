type CartRegion = { id: string; currency_code: string }

export function needsCartRegionUpdate(
  cart: { region_id?: string | null; currency_code: string },
  region: CartRegion
) {
  return cart.region_id !== region.id ||
    cart.currency_code.toLowerCase() !== region.currency_code.toLowerCase()
}
