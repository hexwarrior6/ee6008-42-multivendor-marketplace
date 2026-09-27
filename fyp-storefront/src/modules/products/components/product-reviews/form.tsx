"use client"

import { FC, useState } from "react"
import { StoreOrderLineItem } from "@medusajs/types"
import { StoreProductReview } from "@lambdacurry/medusa-plugins-sdk"
import { Button, Input, Label, Textarea, toast, Toaster } from "@medusajs/ui"
import { addProductReview } from "@lib/data/products"
import { useStorefrontI18n } from "@lib/i18n/storefront-context"
import { Star, StarSolid } from "@medusajs/icons"


export interface ProductReviewFormProps {
  redirect?: string
  onSuccess?: () => void
  setEditing: (value: boolean) => void
  productReview?: StoreProductReview
  requestId?: string
  lineItem: StoreOrderLineItem
  orderId: string
}


export const ProductReviewForm: FC<ProductReviewFormProps> = ({
  lineItem,
  productReview,
  requestId,
  orderId,
  setEditing,
}) => {
const [isLoading, setIsLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [content, setContent] = useState(productReview?.content || "")
  const [rating, setRating] = useState(productReview?.rating || 0)
  const { t } = useStorefrontI18n()
  const tc = t.catalog

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    if (!content || !rating) {
      toast.error(tc.reviewErrorTitle, {
        description: tc.reviewFillRequired,
      })
      return
    }
    e.preventDefault()
    setIsLoading(true)
    addProductReview({
      reviews: [{
        order_id: orderId,
        order_line_item_id: lineItem.id,
        content: content,
        rating: rating,
        images: []
      }]
    }).then(() => {
      setShowForm(false)
      setContent("")
      setRating(0)
      toast.success(tc.reviewSuccessTitle, {
        description: tc.reviewSuccessBody,
      })
    }).catch(() => {
      toast.error(tc.reviewErrorTitle, {
        description: tc.reviewSubmitError,
      })
    }).finally(() => {
      setIsLoading(false)
    })
  }

  return (
  <div className="w-full">
    {!showForm && (
      <div className="flex justify-start">
        <Button variant="secondary" onClick={() => setShowForm(true)}>{tc.reviewAdd}</Button>
      </div>
    )}
    {showForm && (
      <div className="flex flex-col gap-y-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-y-4">
          <div className="flex flex-col gap-y-2">
            <Label className="txt-medium-plus text-ui-fg-base">{tc.reviewLabel}</Label>
            <Textarea
              name="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={tc.reviewPlaceholder}
              className="min-h-[120px]"
            />
          </div>
          <div className="flex flex-col gap-y-2">
            <Label className="txt-medium-plus text-ui-fg-base">{tc.ratingLabel}</Label>
            <div className="flex gap-x-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <Button 
                  key={index} 
                  variant="transparent" 
                  onClick={(e) => {
                    e.preventDefault()
                    setRating(index + 1)
                  }} 
                  className="p-0"
                >
                  {rating >= index + 1 ? <StarSolid className="text-ui-tag-orange-icon" /> : <Star />}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex gap-x-2 pt-2">
            <Button 
              type="button" 
              variant="secondary" 
              onClick={() => setShowForm(false)}
            >
              {tc.cancel}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              variant="primary"
            >
              {isLoading ? tc.reviewSubmitting : tc.reviewSubmit}
            </Button>
          </div>
        </form>
      </div>
    )}
    <Toaster />
  </div>
)

}