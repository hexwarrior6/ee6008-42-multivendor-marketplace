import { logger } from "@medusajs/framework"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { ShippingOptionDTO } from "@medusajs/framework/types"

type StepInput = {
    shipping_options: ShippingOptionDTO[],
    cart_id: string,
}

export const filterSellerShippingOptionsStep = createStep(
    "filter-seller-shipping-options-step",
    async (input: StepInput, { container }) => {
        const query = container.resolve("query")
        
        // Get cart with store information
        const { data: carts } = await query.graph({
            entity: "cart",
            fields: ["id", "items.*", "items.product.*"],
            filters: {
                id: input.cart_id,
            },
        })
        
        const cart = carts[0]
        if (!cart?.items?.length) {
            return new StepResponse([])
        }
        
        // Get product ID from cart items to identify store
        const productId = cart.items[0]?.product_id
        logger.info(`Product ID from cart item: ${productId}`)
        
        if (!productId) {
            return new StepResponse([])
        }

        const { data: products } = await query.graph({
            entity: "product_store",
            fields: ["id", "store_id"],
            filters: {
                product_id: productId,
            },
        })
        logger.info(`Product store link data: ${JSON.stringify(products[0])}`)
        
        // Query store-shipping profile link to get shipping profile ID
        const { data: storeLinks } = await query.graph({
            entity: "shipping_profile_store", 
            fields: ["store_id", "shipping_profile_id"],
            filters: {
                store_id: products[0]?.store_id,
            },
        })
        logger.info(`Store shipping profile link data: ${JSON.stringify(storeLinks[0])}`)

        const shippingProfileId = storeLinks[0]?.shipping_profile_id
        
        if (!shippingProfileId) {
            return new StepResponse([])
        }
        
        // Filter shipping options by shipping profile
        const filteredOptions = input.shipping_options.filter(option => 
            option.shipping_profile_id === shippingProfileId
        )
        
        return new StepResponse(filteredOptions)
    }
)