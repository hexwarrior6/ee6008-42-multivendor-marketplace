import repeat from "@lib/util/repeat"
import { HttpTypes } from "@medusajs/types"
import { Button, Heading, Table } from "@medusajs/ui"

import Item from "@modules/cart/components/item"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SkeletonLineItem from "@modules/skeletons/components/skeleton-line-item"

type ItemsTemplateProps = {
  cart?: HttpTypes.StoreCart
}

function getCheckoutStep(cart: HttpTypes.StoreCart) {
  if (!cart?.shipping_address?.address_1 || !cart.email) {
    return "address"
  } else if (cart?.shipping_methods?.length === 0) {
    return "delivery"
  } else {
    return "payment"
  }
}

const ItemsTemplate = ({ cart }: ItemsTemplateProps) => {
  if (!cart) {
    return null
  }

  const items = cart?.items
  const step = getCheckoutStep(cart)

  let sellerName = "Seller"

  if(cart?.metadata?.store_name) {
    if (typeof cart.metadata.store_name === 'string') {
      sellerName = cart.metadata.store_name
    } else if (cart.metadata.store_name && typeof cart.metadata.store_name === 'object') {
      // Try to get string representation if it's an object
      sellerName = String(JSON.stringify(cart.metadata.store_name))
    }
  }
  return (
    <div>
      <div className="pb-3 flex items-center">
        {/* <Heading className="text-[2rem] leading-[2.75rem]">Cart</Heading> */}
        <Heading className="text-xl mb-4">{sellerName}</Heading>
      </div>
      <Table>
        <Table.Header className="border-t-0">
          <Table.Row className="text-ui-fg-subtle txt-medium-plus">
            <Table.HeaderCell className="!pl-0">Item</Table.HeaderCell>
            <Table.HeaderCell></Table.HeaderCell>
            <Table.HeaderCell>Quantity</Table.HeaderCell>
            <Table.HeaderCell className="hidden small:table-cell">
              Price
            </Table.HeaderCell>
            <Table.HeaderCell className="!pr-0 text-right">
              Total
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items
            ? items
                .sort((a, b) => {
                  return (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
                })
                .map((item) => {
                  return (
                    <Item
                      cartId={cart.id}
                      key={item.id}
                      item={item}
                      currencyCode={cart?.currency_code}
                    />
                  )
                })
            : repeat(5).map((i) => {
                return <SkeletonLineItem key={i} />
              })}
        </Table.Body>
      </Table>

      <div className="mt-6">
        <LocalizedClientLink href={`/checkout/${cart.id}?step=` + step}>
          <Button size="large" className="w-full">Checkout from {sellerName}</Button>
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default ItemsTemplate
