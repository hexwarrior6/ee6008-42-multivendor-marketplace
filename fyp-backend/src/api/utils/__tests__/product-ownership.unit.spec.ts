import { assertCustomOrderProductReferences } from "../product-ownership"

const request = (productService: Record<string, unknown>, links: unknown[]) =>
  ({
    scope: {
      resolve: (key: string) => {
        if (key === "product") return productService
        if (key === "query") {
          return { graph: jest.fn().mockResolvedValue({ data: links }) }
        }
        return undefined
      },
    },
  } as never)

const product = (overrides: Record<string, unknown> = {}) => ({
  id: "prod-custom",
  status: "published",
  metadata: { custom_order_enabled: true },
  categories: [{ id: "pc-custom" }],
  variants: [{ id: "variant-1" }],
  ...overrides,
})

describe("custom-order product ownership", () => {
  it("accepts a published, enabled product in the artisan store and category", async () => {
    const service = {
      retrieveProductCategory: jest.fn().mockResolvedValue({
        id: "pc-custom",
        is_active: true,
      }),
      retrieveProduct: jest.fn().mockResolvedValue(product()),
    }

    await expect(
      assertCustomOrderProductReferences(
        request(service, [{ product_id: "prod-custom", store_id: "store-1" }]),
        {
          productId: "prod-custom",
          productCategoryId: "pc-custom",
          storeId: "store-1",
          listingType: "product",
        }
      )
    ).resolves.toMatchObject({ product: { id: "prod-custom" } })
  })

  it("rejects a product linked to another store", async () => {
    const service = {
      retrieveProductCategory: jest.fn().mockResolvedValue({
        id: "pc-custom",
        is_active: true,
      }),
      retrieveProduct: jest.fn().mockResolvedValue(product()),
    }

    await expect(
      assertCustomOrderProductReferences(
        request(service, [{ product_id: "prod-custom", store_id: "store-other" }]),
        {
          productId: "prod-custom",
          productCategoryId: "pc-custom",
          storeId: "store-1",
        }
      )
    ).rejects.toThrow("artisan's store")
  })

  it("rejects a product that is not published or available", async () => {
    const service = {
      retrieveProduct: jest.fn().mockResolvedValue(
        product({ status: "draft", variants: [] })
      ),
    }

    await expect(
      assertCustomOrderProductReferences(
        request(service, [{ product_id: "prod-custom", store_id: "store-1" }]),
        { productId: "prod-custom", storeId: "store-1" }
      )
    ).rejects.toThrow("published")
  })

  it("rejects a category mismatch", async () => {
    const service = {
      retrieveProductCategory: jest.fn().mockResolvedValue({
        id: "pc-other",
        is_active: true,
      }),
      retrieveProduct: jest.fn().mockResolvedValue(product()),
    }

    await expect(
      assertCustomOrderProductReferences(
        request(service, [{ product_id: "prod-custom", store_id: "store-1" }]),
        {
          productId: "prod-custom",
          productCategoryId: "pc-other",
          storeId: "store-1",
        }
      )
    ).rejects.toThrow("does not belong")
  })

  it("requires an explicit custom-order marker", async () => {
    const service = {
      retrieveProduct: jest.fn().mockResolvedValue(
        product({ metadata: {} })
      ),
    }

    await expect(
      assertCustomOrderProductReferences(
        request(service, [{ product_id: "prod-custom", store_id: "store-1" }]),
        { productId: "prod-custom", storeId: "store-1" }
      )
    ).rejects.toThrow("not enabled for custom orders")
  })
})
