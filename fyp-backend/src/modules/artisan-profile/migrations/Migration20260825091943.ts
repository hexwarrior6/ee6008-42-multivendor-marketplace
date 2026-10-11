import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260825091943 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "artisan_profile" drop constraint if exists "artisan_profile_store_id_unique";`);
    this.addSql(`create table if not exists "artisan_profile" ("id" text not null, "store_id" text not null, "display_name" text not null, "bio" text null, "avatar_url" text null, "location" text null, "specialties" jsonb null, "verification_status" text check ("verification_status" in ('draft', 'pending', 'approved', 'rejected')) not null default 'draft', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "artisan_profile_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_artisan_profile_store_id_unique" ON "artisan_profile" ("store_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_artisan_profile_deleted_at" ON "artisan_profile" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "artisan_profile" cascade;`);
  }

}
