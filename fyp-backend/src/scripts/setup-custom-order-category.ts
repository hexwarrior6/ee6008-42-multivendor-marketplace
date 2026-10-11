import type { ExecArgs, IProductModuleService } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"

export const CUSTOM_ORDER_CATEGORY_HANDLE = "custom-order"

/** Safe to re-run; never re-seeds products, users, stores or payment settings. */
export async function ensureCustomOrderCategory(
  service: IProductModuleService
) {
  const find = () =>
    service.listProductCategories(
      {
        $or: [
          { handle: CUSTOM_ORDER_CATEGORY_HANDLE },
          { name: "Custom Order" },
        ],
      },
      {
        take: 3,
        select: [
          "id",
          "name",
          "handle",
          "is_active",
          "is_internal",
          "metadata",
        ],
      }
    )
  let categories = await find()
  if (!categories.length) {
    try {
      const category = await service.createProductCategories({
        name: "Custom Order",
        handle: CUSTOM_ORDER_CATEGORY_HANDLE,
        is_active: true,
        is_internal: false,
        metadata: { custom_order_enabled: true },
      })
      return { category, created: true }
    } catch (error) {
      // Another setup process may have won the unique-handle race.
      categories = await find()
      if (!categories.length) throw error
    }
  }
  if (categories.length !== 1) {
    throw new Error(
      "Multiple custom-order categories found; an administrator must resolve the ambiguity"
    )
  }
  const category = categories[0]
  // Do not overwrite existing metadata or silently publish an internal category.
  // Existing categories are reported, not rewritten by this initialization tool.
  return { category, created: false }
}

export default async function setupCustomOrderCategory({
  container,
}: ExecArgs) {
  const result = await ensureCustomOrderCategory(
    container.resolve(Modules.PRODUCT)
  )
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  logger.info(
    `定制订单分类${result.created ? "已创建" : "已存在"}：${result.category.id}`
  )
  if (
    !result.category.is_active ||
    result.category.is_internal ||
    result.category.metadata?.custom_order_enabled !== true
  ) {
    logger.warn(
      "现有分类的可见性或定制标记需要管理员核查；脚本未自动覆盖这些设置"
    )
  }
}
