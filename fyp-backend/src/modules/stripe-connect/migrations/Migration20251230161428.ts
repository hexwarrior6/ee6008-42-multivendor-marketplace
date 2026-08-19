import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20251230161428 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "payout_account" ("id" text not null, "stripe_connect_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "payout_account_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payout_account_deleted_at" ON "payout_account" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "payout_account" cascade;`);
  }

}
