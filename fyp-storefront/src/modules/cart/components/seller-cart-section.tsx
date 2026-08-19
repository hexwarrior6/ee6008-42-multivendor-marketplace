import { sdk } from "@lib/config"
import { HttpTypes } from "@medusajs/types"
import { Button, Heading, Table } from "@medusajs/ui"
import Item from "@modules/cart/components/item"
import CartTotals from "@modules/common/components/cart-totals"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

const SellerCartSection = ({
  cart,
}: {
  cart: HttpTypes.StoreCart
}) => {
  const items = cart?.items || []
  const seller_id = cart.metadata?.seller_id
  console.log("Seller ID:", seller_id);
  
  // Use the store_name from metadata if it exists and is a string, otherwise default to "Seller"
  let sellerName = "Seller"
  
  if (cart.metadata?.store_name) {
    if (typeof cart.metadata.store_name === 'string') {
      sellerName = cart.metadata.store_name
    } else if (cart.metadata.store_name && typeof cart.metadata.store_name === 'object') {
      // Try to get string representation if it's an object
      sellerName = String(JSON.stringify(cart.metadata.store_name))
    }
  }
  
  if (items.length === 0) {
    return null
  }

  return (
    <div className="bg-white p-6 mb-6 rounded-lg shadow-sm">
      <Heading className="text-xl mb-4">{sellerName}</Heading>
      
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
            })}
        </Table.Body>
      </Table>
      
      <div className="mt-6">
        <CartTotals totals={cart} />
      </div>
      
      <div className="mt-6">
        <LocalizedClientLink href={`/checkout/${cart.id}`}>
          <Button size="large" className="w-full">
            Checkout from {sellerName}
          </Button>
        </LocalizedClientLink>
      </div>
    </div>
  )
}

export default SellerCartSection