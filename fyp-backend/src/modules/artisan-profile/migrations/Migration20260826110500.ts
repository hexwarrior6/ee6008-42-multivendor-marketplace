import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Add optimistic concurrency state for JSON media updates. */
export class Migration20260826110500 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `alter table if exists "artisan_profile" add column if not exists "version" integer not null default 0;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "artisan_profile" drop column if exists "version";`
    )
  }
}
