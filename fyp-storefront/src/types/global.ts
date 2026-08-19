import { HttpTypes, StorePrice } from "@medusajs/types"

export type FeaturedProduct = {
  id: string
  title: string
  handle: string
  thumbnail?: string
}

export type VariantPrice = {
  calculated_price_number: number
  calculated_price: string
  original_price_number: number
  original_price: string
  currency_code: string
  price_type: string
  percentage_diff: string
}

export type StoreFreeShippingPrice = StorePrice & {
  target_reached: boolean
  target_remaining: number
  remaining_percentage: number
}

export type StoreProductWithStore = HttpTypes.StoreProduct & {
  store: {
    id: string
    name: string
    // Add other store fields as needed
  }
}

export type ProductReview = {
  id: string
  product_id?: string
  order_id?: string
  order_line_item_id?: string
  name?: string           // Changed from first_name/last_name
  email?: string
  rating: number
  content?: string
  status: 'approved' | 'pending' | 'flagged'
  images?: { id: string; url: string }[]
  response?: {           // Changed structure
    id: string
    content: string
    created_at: string
    updated_at: string
  }
  created_at: string
  updated_at: string
}

export type ProductReviewStats = {
  id: string
  product_id: string
  average_rating: number | null
  review_count: number
  rating_count_1: number
  rating_count_2: number
  rating_count_3: number
  rating_count_4: number
  rating_count_5: number
}