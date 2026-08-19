import { StoreOrderLineItem } from "@medusajs/types"
import Link from 'next/link'
import { StarRating } from "./starRating"
import { IconButton, Text } from "@medusajs/ui"
import PencilIcon from '@heroicons/react/24/outline/PencilIcon'
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export interface ProductReviewsViewProps {
    lineItem: StoreOrderLineItem,
    rating?: number,
    content?: string,
    galleryImages?: undefined
    setEditing?: (value: boolean) => void,
}

export const ProductReviewsView: React.FC<ProductReviewsViewProps> = ({ lineItem, rating, content, galleryImages, setEditing }) => {

    return (
        <div className="flex flex-col gap-y-4 w-full">
            <div className="flex flex-col gap-y-2">
                <div className="flex items-center justify-between">
                    <LocalizedClientLink
                        href={`/products/${lineItem.variant?.product?.handle}`}
                        className="text-ui-fg-base hover:text-ui-fg-subtle txt-medium-plus"
                    >
                        {lineItem.product_title}
                    </LocalizedClientLink>
                    {typeof setEditing === 'function' && (
                        <IconButton onClick={() => setEditing(true)}>
                            <PencilIcon className="h-5 w-5" />
                        </IconButton>
                    )}
                </div>
                <Text className="txt-medium text-ui-fg-subtle">{lineItem.variant?.title}</Text>
                <div className="flex items-center gap-2">
                    <StarRating value={rating ?? 0} readOnly />
                </div>
            </div>
            {content && (
                <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-4">
                    <Text className="txt-medium text-ui-fg-base whitespace-pre-line">{content}</Text>
                </div>
            )}
        </div>
    )
}