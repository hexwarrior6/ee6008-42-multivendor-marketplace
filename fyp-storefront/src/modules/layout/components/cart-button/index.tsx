import { retrieveCart } from "@lib/data/cart"
import CartDropdown from "../cart-dropdown"
import { getAllSellerCarts } from "@lib/data/seller-cart"

export default async function CartButton() {
  const carts = await getAllSellerCarts()

  if (!carts || carts.length === 0 ) {
    return null
  }

  return <CartDropdown carts={carts} />
}
