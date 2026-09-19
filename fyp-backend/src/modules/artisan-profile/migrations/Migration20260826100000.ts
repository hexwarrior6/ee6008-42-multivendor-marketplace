import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260826100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`alter table if exists "artisan_profile" add column if not exists "inspiration" text null;`)
    this.addSql(`alter table if exists "artisan_profile" add column if not exists "creative_process" text null;`)
    this.addSql(`alter table if exists "artisan_profile" add column if not exists "media" jsonb null;`)
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "artisan_profile" drop column if exists "media";`)
    this.addSql(`alter table if exists "artisan_profile" drop column if exists "creative_process";`)
    this.addSql(`alter table if exists "artisan_profile" drop column if exists "inspiration";`)
  }
}
