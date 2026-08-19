import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260105144647 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "onboarding" ("id" text not null, "store_information" boolean not null default false, "locations_shipping" boolean not null default false, "stripe_connect" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "onboarding_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_onboarding_deleted_at" ON "onboarding" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "onboarding" cascade;`);
  }

}
