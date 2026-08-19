
import { StoreProductReviewStats } from "@lambdacurry/medusa-plugins-sdk/dist/esm/types/product-review-stats"
import { StoreProductReview } from "@lambdacurry/medusa-plugins-sdk/dist/esm/types/product-reviews"
import { FC } from "react"
import { StarRating } from "./starRating"
import { Text } from "@medusajs/ui"


export interface ProductReviewSectionProps {
    product_reviews: StoreProductReview[],
    product_review_stats: StoreProductReviewStats[]
}

function Review({ review }: { review: StoreProductReview }) {
  return (
    <div className="flex flex-col gap-y-2 text-base-regular text-ui-fg-base">
      <div className="flex gap-x-2 items-center justify-between">
        {review.name && <strong>{review.name}</strong>}
        <div className="flex gap-x-1">
          <StarRating value={review.rating} readOnly />
        </div>
      </div>
        <Text className="text-ui-fg-subtle text-xs">{new Date(review.created_at).toLocaleDateString()}</Text>
      <div>{review.content}</div>
    </div>
  )
}

export const ProductReviewSection: FC<ProductReviewSectionProps> =  ({ product_reviews, product_review_stats }) => {
    
    return (
        <div className="product-page-constraint">
            <div className="flex flex-col items-center text-center mb-16">
                <span className="text-base-regular text-gray-600 mb-6">
                    Product Reviews
                </span>
                <p className="text-2xl-regular text-ui-fg-base max-w-lg"> See what our customers are saying about this product</p>
                <div className="flex gap-x-2 justify-center items-center">
                    <div className="flex gap-x-2">
                        <StarRating value={product_review_stats[0]?.average_rating ?? 0} readOnly />
                        <span>Based on {product_review_stats[0]?.review_count ?? 0} reviews</span>
                    </div>
                </div>
                <span className="pt-4"></span>
                <div className="grid grid-cols-1 small:grid-cols-2 gap-x-6 gap-y-8 justify-items-stretch">
                {product_reviews.map((review) => (
                    <Review key={review.id} review={review} />
                ))}
            </div>
            </div>
        </div>
    )
}