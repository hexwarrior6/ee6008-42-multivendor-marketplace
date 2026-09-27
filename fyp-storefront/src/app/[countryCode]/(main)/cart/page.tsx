import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import { getAllSellerCarts } from "@lib/data/seller-cart"
import CartTemplate from "@modules/cart/templates"
import MultiVendorCartTemplate from "@modules/cart/templates/multivendor-cart"
import { Metadata } from "next"
import { notFound } from "next/navigation"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).cart

  return {
    title: t.emptyTitle,
    description: t.metadataDescription,
  }
}

export default async function Cart() {
  // const cart = await retrieveCart().catch((error) => {
  //   console.error(error)
  //   return notFound()
  // })

  // getAllSellerCarts already filters out empty carts
  // Cookie cleanup happens in Server Actions (deleteLineItem, checkout, etc.)
  const carts = await getAllSellerCarts();

  const customer = await retrieveCustomer()

  // return <CartTemplate cart={cart} customer={customer} />
  //@ts-ignore
  return <MultiVendorCartTemplate carts={carts} customer={customer}/>
}
