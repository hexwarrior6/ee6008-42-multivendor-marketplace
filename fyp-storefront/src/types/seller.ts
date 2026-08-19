import { FeaturedProduct } from "./global"
export type SellerProps = {
  id: string
  name: string
  handle: string
  description: string
  photo: string
  tax_id: string
  created_at: string
  reviews?: any[]
  products?: FeaturedProduct[]
  email?: string
}