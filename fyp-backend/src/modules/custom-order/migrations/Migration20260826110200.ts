import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * Keep dependant records tied to an order at the database boundary. The
 * constraints are NOT VALID so an older installation containing an orphaned
 * row can still boot; every new insert/update is checked, and the service
 * continues to remove dependants before deleting an order.
 */
export class Migration20260826110200 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `do $$ begin alter table if exists "custom_order_message" add constraint "custom_order_message_custom_order_id_foreign" foreign key ("custom_order_id") references "custom_order_request" ("id") on update cascade on delete cascade not valid; exception when duplicate_object then null; end $$;`
    )
    this.addSql(
      `do $$ begin alter table if exists "custom_order_status_history" add constraint "custom_order_status_history_custom_order_id_foreign" foreign key ("custom_order_id") references "custom_order_request" ("id") on update cascade on delete cascade not valid; exception when duplicate_object then null; end $$;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "custom_order_status_history" drop constraint if exists "custom_order_status_history_custom_order_id_foreign";`
    )
    this.addSql(
      `alter table if exists "custom_order_message" drop constraint if exists "custom_order_message_custom_order_id_foreign";`
    )
  }
}
