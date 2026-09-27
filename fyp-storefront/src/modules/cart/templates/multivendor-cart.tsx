import { HttpTypes } from "@medusajs/types"
import Divider from "@modules/common/components/divider"
import EmptyCartMessage from "../components/empty-cart-message"
import SignInPrompt from "../components/sign-in-prompt"
import { Heading } from "@medusajs/ui"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"
import ItemsTemplate from "./items"

const MultiVendorCartTemplate = async ({
  carts,
  customer,
}: {
  carts: HttpTypes.StoreCart[]
  customer: HttpTypes.StoreCustomer | null
}) => {
  // Check if any items exist across all carts
  const hasItems = carts.some(cart => cart.items && cart.items.length > 0)
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).cart

  return (
    <div className="py-12">
      <div className="content-container" data-testid="cart-container">
        {hasItems ? (
          <div className="flex flex-col gap-y-8">
            {!customer && (
              <>
                <SignInPrompt />
                <Divider />
              </>
            )}

            <div className="pb-3 flex items-center">
              <Heading className="text-[2rem] leading-[2.75rem]">{t.title}</Heading>
            </div>

            {/* Map through each seller's cart */}
            {carts.map((cart) => (
              <ItemsTemplate 
                key={cart.id} 
                cart={cart} 
              />
            ))}
          </div>
        ) : (
          <div>
            <EmptyCartMessage />
          </div>
        )}
      </div>
    </div>
  )
}

export default MultiVendorCartTemplate