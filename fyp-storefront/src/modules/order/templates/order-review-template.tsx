import { Heading } from "@medusajs/ui"
import { cookies as nextCookies } from "next/headers"

import Help from "@modules/order/components/help"
import OnboardingCta from "@modules/order/components/onboarding-cta"
import { Text } from "@medusajs/ui"
import { HttpTypes } from "@medusajs/types"
import { getProductReviews } from "@lib/data/products"
import { ProductReviewsComponent } from "@modules/products/components/product-reviews"

type OrderReviewTemplateProps = {
  order: HttpTypes.StoreOrder
}

export default async function OrderReviewTemplate({
  order
}: OrderReviewTemplateProps) {
  const cookies = await nextCookies()

  const isOnboarding = cookies.get("_medusa_onboarding")?.value === "true"
  const fulfilledItems = order.items || [];
  const uniqueItems: { [key: string]: any } = {};
  const { product_reviews } = await getProductReviews({ order_id: order?.id})
  
  for (const item of fulfilledItems) {
    uniqueItems[item.product_id as string] = item
  }

  return (
    <div className="py-6 min-h-[calc(100vh-64px)]">
      <div className="content-container flex flex-col justify-center items-center gap-y-10 max-w-4xl h-full w-full">
        {isOnboarding && <OnboardingCta orderId={order.id} />}
        <div
          className="flex flex-col gap-4 max-w-4xl h-full bg-white w-full py-10"
          data-testid="order-review-container"
        >
          <Heading
            level="h1"
            className="flex flex-col gap-y-3 text-ui-fg-base text-3xl mb-4"
          >
            <span>We hope you enjoyed your order!</span>
          </Heading>
          <div>
            <Text className="mt-2">
              Order date:{" "}
              <span data-testid="order-date">
                {new Date(order.created_at).toDateString()}
              </span>
            </Text>
            <Text className="mt-2 text-ui-fg-interactive">
              Order number: <span data-testid="order-id">{order.display_id}</span>
            </Text>
          </div>
          <Heading level="h2" className="flex flex-row text-3xl-regular">
            Reviews
          </Heading>
          <ul role="list" className="mt-4 divide-y divide-gray-200 text-ui-fg-base">
              {Object.values(uniqueItems).map((item) => {
                const review = product_reviews ? product_reviews.find((review) => review.product_id === item.variant.product.id) : undefined;
                return (
                  <li key={item.id} className="flex py-4">
                    <ProductReviewsComponent orderId={order.id} lineItem={item} productReview={review} />
                  </li>
                )
              })}
          </ul>
          {/* <Items order={order} />
          <CartTotals totals={order} />
          <ShippingDetails order={order} />
          <PaymentDetails order={order} /> */}
          <Help />
        </div>
      </div>
    </div>
  )
}
