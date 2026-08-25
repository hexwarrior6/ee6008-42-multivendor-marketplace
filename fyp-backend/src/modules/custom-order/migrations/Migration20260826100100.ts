import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260826100100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`create table if not exists "custom_order_message" ("id" text not null, "custom_order_id" text not null, "sender_type" text check ("sender_type" in ('customer', 'artisan', 'admin')) not null, "sender_id" text null, "message" text not null, "attachments" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "custom_order_message_pkey" primary key ("id"));`)
    this.addSql(`create index if not exists "IDX_custom_order_message_order_id" on "custom_order_message" ("custom_order_id", "created_at") where deleted_at is null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "custom_order_message" cascade;`)
  }
}
