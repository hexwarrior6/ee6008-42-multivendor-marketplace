import type { MedusaRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"

type ProductCategory = {
  id: string
  is_active?: boolean
  metadata?: Record<string, unknown> | null
}

type Product = {
  id: string
  status?: string
  metadata?: Record<string, unknown> | null
  categories?: Array<{ id?: string | null }> | null
  variants?: Array<{ id?: string | null }> | null
}

type ProductStoreLink = {
  product_id?: string | null
  store_id?: string | null
  store?: { id?: string | null } | null
}

export type CustomOrderProductReferenceInput = {
  productId?: string | null
  productCategoryId?: string | null
  storeId: string
  listingType?: "custom_request" | "product" | null
}

const invalid = (message: string) =>
  new MedusaError(MedusaError.Types.INVALID_DATA, message)

const notFound = (message: string) =>
  new MedusaError(MedusaError.Types.NOT_FOUND, message)

const notAllowed = (message: string) =>
  new MedusaError(MedusaError.Types.NOT_ALLOWED, message)

/**
 * Validate every product reference used by a custom order.
 *
 * Product IDs are module-local and do not carry marketplace ownership by
 * themselves.  The product_store link, product status, category relation and
 * explicit custom-order marker are therefore all checked before the order is
 * persisted.  This helper is shared by storefront creation and back-office
 * updates so an update cannot bypass the creation boundary.
 */
export const assertCustomOrderProductReferences = async (
  req: MedusaRequest,
  input: CustomOrderProductReferenceInput
) => {
  const productId = input.productId?.trim() || null
  const productCategoryId = input.productCategoryId?.trim() || null
  const listingType = input.listingType ?? "custom_request"

  if (listingType === "product" && !productId) {
    throw invalid("listing_type=product requires product_id")
  }
  if (!productId && !productCategoryId) {
    return { product: undefined, category: undefined }
  }
  if (!input.storeId?.trim()) {
    throw invalid("An artisan store is required when referencing a product")
  }

  const productService = req.scope.resolve(Modules.PRODUCT) as {
    retrieveProductCategory: (
      id: string,
      config?: { relations?: string[] }
    ) => Promise<ProductCategory>
    retrieveProduct: (
      id: string,
      config?: { relations?: string[] }
    ) => Promise<Product>
  }

  let category: ProductCategory | undefined
  if (productCategoryId) {
    try {
      category = await productService.retrieveProductCategory(productCategoryId)
    } catch {
      throw notFound(
        "product_category_id does not reference an existing product category"
      )
    }
    if (category.is_active === false) {
      throw notAllowed("The selected product category is not active")
    }
  }

  let product: Product | undefined
  if (productId) {
    try {
      product = await productService.retrieveProduct(productId, {
        relations: ["categories", "variants"],
      })
    } catch {
      throw notFound("product_id does not reference an existing product")
    }

    if (product.status !== "published") {
      throw notAllowed("Only published products can be used for custom orders")
    }
    if (!product.variants?.length) {
      throw notAllowed("Only available products with variants can be used for custom orders")
    }

    const categoryAllowsCustomOrder =
      category?.metadata?.custom_order_enabled === true
    const productAllowsCustomOrder =
      product.metadata?.custom_order_enabled === true
    if (!productAllowsCustomOrder && !categoryAllowsCustomOrder) {
      throw notAllowed(
        "This product is not enabled for custom orders; set metadata.custom_order_enabled=true"
      )
    }

    if (productCategoryId) {
      const belongsToCategory = (product.categories ?? []).some(
        (item) => item.id === productCategoryId
      )
      if (!belongsToCategory) {
        throw notAllowed("The product does not belong to product_category_id")
      }
    }

    let productStores: ProductStoreLink[]
    try {
      const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
      const result = await query.graph({
        entity: "product_store",
        fields: ["product_id", "store_id", "store.id"],
        filters: { product_id: productId },
      })
      productStores = (result?.data ?? []) as ProductStoreLink[]
    } catch {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "Product store ownership could not be verified"
      )
    }

    const belongsToStore = productStores.some(
      (link) =>
        (link.store_id || link.store?.id) === input.storeId.trim()
    )
    if (!belongsToStore) {
      throw notAllowed(
        "The product does not belong to the artisan's store"
      )
    }
  }

  return { product, category }
}
