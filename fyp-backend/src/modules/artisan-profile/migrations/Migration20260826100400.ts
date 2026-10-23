import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * The public artisan directory always filters by approval status. Keep that
 * lookup efficient without changing the profile API contract.
 */
export class Migration20260826100400 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `create index if not exists "IDX_artisan_profile_verification_status" on "artisan_profile" ("verification_status") where deleted_at is null;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `drop index if exists "IDX_artisan_profile_verification_status";`
    )
  }
}
