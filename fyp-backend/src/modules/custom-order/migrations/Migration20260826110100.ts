import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260826110100 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create table if not exists "custom_order_status_history" ("id" text not null, "custom_order_id" text not null, "from_status" text null check ("from_status" is null or "from_status" in ('request', 'quote', 'confirmed', 'produced', 'delivered', 'cancelled')), "to_status" text check ("to_status" in ('request', 'quote', 'confirmed', 'produced', 'delivered', 'cancelled')) not null, "actor_type" text check ("actor_type" in ('customer', 'artisan', 'admin', 'system')) not null, "actor_id" text null, "reason" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "custom_order_status_history_pkey" primary key ("id"));`
    )
    this.addSql(
      `create index if not exists "IDX_custom_order_status_history_order_created" on "custom_order_status_history" ("custom_order_id", "created_at") where deleted_at is null;`
    )
    this.addSql(
      `create index if not exists "IDX_custom_order_status_history_actor" on "custom_order_status_history" ("actor_type", "actor_id") where deleted_at is null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "custom_order_status_history" cascade;`)
  }
}
