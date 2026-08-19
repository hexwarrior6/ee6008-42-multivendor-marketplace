import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20260107121543 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "payout_account" add column if not exists "status" text check ("status" in ('active', 'inactive', 'pending')) not null default 'pending';`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "payout_account" drop column if exists "status";`);
  }

}
