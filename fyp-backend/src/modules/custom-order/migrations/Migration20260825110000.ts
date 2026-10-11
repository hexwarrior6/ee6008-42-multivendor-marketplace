import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260825110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "custom_order_request" ("id" text not null, "artisan_id" text not null, "customer_id" text null, "title" text not null, "description" text not null, "budget_amount" numeric null, "quoted_amount" numeric null, "currency_code" text not null default 'cny', "status" text check ("status" in ('request', 'quote', 'confirmed', 'produced', 'delivered', 'cancelled')) not null default 'request', "metadata" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "custom_order_request_pkey" primary key ("id"));`)
    this.addSql(`create index if not exists "IDX_custom_order_request_artisan_id" on "custom_order_request" ("artisan_id") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_custom_order_request_customer_id" on "custom_order_request" ("customer_id") where deleted_at is null;`)
    this.addSql(`create index if not exists "IDX_custom_order_request_status" on "custom_order_request" ("status") where deleted_at is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "custom_order_request" cascade;`)
  }
}
