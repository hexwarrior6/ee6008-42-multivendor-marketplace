import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * The migration name is globally unique because Medusa installations share
 * one `mikro_orm_migrations` table across modules.  This also repairs
 * installations where the old custom-order migration was skipped because it
 * collided with artisan-profile's migration of the same name.
 */
export class Migration20260826110300 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "custom_order_request" add column if not exists "product_category_id" text null;`
    )
    this.addSql(
      `alter table if exists "custom_order_request" add column if not exists "product_id" text null;`
    )
    this.addSql(
      `alter table if exists "custom_order_request" add column if not exists "listing_type" text not null default 'custom_request';`
    )
    this.addSql(
      `alter table if exists "custom_order_request" add column if not exists "payment_status" text not null default 'pending';`
    )
    this.addSql(
      `alter table if exists "custom_order_request" add column if not exists "delivered_at" timestamptz null;`
    )
    this.addSql(
      `alter table if exists "custom_order_request" add column if not exists "cancelled_at" timestamptz null;`
    )
    this.addSql(
      `alter table if exists "custom_order_request" add column if not exists "cancelled_by" text null;`
    )
    this.addSql(
      `alter table if exists "custom_order_request" add column if not exists "cancellation_reason" text null;`
    )
    this.addSql(
      `alter table if exists "custom_order_request" add column if not exists "version" integer not null default 0;`
    )
    this.addSql(
      `do $$ begin alter table if exists "custom_order_request" add constraint "custom_order_request_listing_type_check" check ("listing_type" in ('custom_request', 'product')); exception when duplicate_object then null; end $$;`
    )
    this.addSql(
      `do $$ begin alter table if exists "custom_order_request" add constraint "custom_order_request_payment_status_check" check ("payment_status" in ('pending', 'authorized', 'captured', 'failed')); exception when duplicate_object then null; end $$;`
    )
    this.addSql(
      `do $$ begin alter table if exists "custom_order_request" add constraint "custom_order_request_amounts_non_negative_check" check (("budget_amount" is null or "budget_amount" >= 0) and ("quoted_amount" is null or "quoted_amount" >= 0)); exception when duplicate_object then null; end $$;`
    )
    this.addSql(
      `create index if not exists "IDX_custom_order_request_artisan_status" on "custom_order_request" ("artisan_id", "status") where deleted_at is null;`
    )
    this.addSql(
      `create index if not exists "IDX_custom_order_request_customer_status" on "custom_order_request" ("customer_id", "status") where deleted_at is null;`
    )
    this.addSql(
      `create index if not exists "IDX_custom_order_request_product_category_id" on "custom_order_request" ("product_category_id") where deleted_at is null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_custom_order_request_product_category_id";`
    )
    this.addSql(
      `drop index if exists "IDX_custom_order_request_customer_status";`
    )
    this.addSql(
      `drop index if exists "IDX_custom_order_request_artisan_status";`
    )
    this.addSql(
      `alter table if exists "custom_order_request" drop constraint if exists "custom_order_request_payment_status_check";`
    )
    this.addSql(
      `alter table if exists "custom_order_request" drop constraint if exists "custom_order_request_amounts_non_negative_check";`
    )
    this.addSql(
      `alter table if exists "custom_order_request" drop constraint if exists "custom_order_request_listing_type_check";`
    )
    for (const column of [
      "version",
      "cancellation_reason",
      "cancelled_by",
      "cancelled_at",
      "delivered_at",
      "payment_status",
      "listing_type",
      "product_id",
      "product_category_id",
    ]) {
      this.addSql(
        `alter table if exists "custom_order_request" drop column if exists "${column}";`
      )
    }
  }
}
