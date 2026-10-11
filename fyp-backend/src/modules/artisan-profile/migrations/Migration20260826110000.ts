import { Migration } from "@medusajs/framework/mikro-orm/migrations"

export class Migration20260826110000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "artisan_profile" add column if not exists "artisan_user_id" text null;`
    )
    this.addSql(
      `create index if not exists "IDX_artisan_profile_artisan_user_id" on "artisan_profile" ("artisan_user_id") where deleted_at is null;`
    )
    this.addSql(
      `create unique index if not exists "IDX_artisan_profile_artisan_user_id_unique" on "artisan_profile" ("artisan_user_id") where deleted_at is null and "artisan_user_id" is not null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(`drop index if exists "IDX_artisan_profile_artisan_user_id_unique";`)
    this.addSql(`drop index if exists "IDX_artisan_profile_artisan_user_id";`)
    this.addSql(
      `alter table if exists "artisan_profile" drop column if exists "artisan_user_id";`
    )
  }
}
