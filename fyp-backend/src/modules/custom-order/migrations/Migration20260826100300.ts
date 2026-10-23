import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Keep the category filter used by the admin order list index-backed as the
 * number of bespoke requests grows.
 */
export class Migration20260826100300 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create index if not exists "IDX_custom_order_request_product_category" on "custom_order_request" ("product_category") where deleted_at is null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_custom_order_request_product_category";`
    )
  }
}
