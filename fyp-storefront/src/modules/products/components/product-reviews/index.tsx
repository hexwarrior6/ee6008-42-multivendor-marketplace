"use client"

import { StoreProductReview } from "@lambdacurry/medusa-plugins-sdk";
import { StoreOrderLineItem } from "@medusajs/types";
import { FC, useState } from "react";
import { ProductReviewsView } from "./view";
import { ProductReviewForm } from "./form";
import PlaceholderImage from "@modules/common/icons/placeholder-image";

export interface ProductReviewsProps {
    lineItem?: StoreOrderLineItem,
    productReview?: StoreProductReview,
    requestId?: string,
    orderId?: string,
}

export const ProductReviewsComponent: FC<ProductReviewsProps> = ({ lineItem, productReview, requestId, orderId }) => {
    if (!lineItem) return null;

    const [editing, setEditing] = useState<boolean>(!productReview);

    return(
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
            <div className="col-span-1">
                {lineItem.thumbnail ? (
                    <img src={lineItem.thumbnail} alt="Product thumbnail" className="h-24 w-24 flex-none rounded-md bg-ui-bg-subtle object-cover object-center" />
                ): (
                    <div className="h-24 w-24 flex items-center justify-center rounded-md bg-ui-bg-subtle">
                        <PlaceholderImage size={48}/>
                    </div>
                )}
            </div>
            <div className="col-span-1 sm:col-span-4 flex flex-auto flex-col">
                {!editing && productReview ? (
                    <ProductReviewsView
                        lineItem={lineItem}
                        rating={productReview?.rating}
                        content={productReview?.content}
                        // galleryImages={
                        //     productReview?.images ? productReview?.images.map((image) => ({
                        //         url: image.url,
                        //         alt: "Customer's review image",
                        //         name: "Customer's review image"
                        //     }))
                        //     : undefined
                        // }
                        galleryImages={undefined}
                        setEditing={setEditing}
                        />
                ) : (
                    <ProductReviewForm
                        lineItem={lineItem}
                        productReview={productReview}
                        requestId={requestId}
                        orderId={orderId!}
                        setEditing={setEditing}
                        />

                )}
            </div>
        </div>
    )
}