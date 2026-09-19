import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260826100200 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "custom_order_request" add column if not exists "product_category" text not null default 'custom';`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "custom_order_request" drop column if exists "product_category";`
    )
  }
}
