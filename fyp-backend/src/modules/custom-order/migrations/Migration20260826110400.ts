import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** Keep money fields in the integer smallest-unit representation used by the API. */
export class Migration20260826110400 extends Migration {
  override async up(): Promise<void> {
    this.addSql(
      `do $$ begin
        if to_regclass('public.custom_order_request') is not null and exists (
          select 1 from "custom_order_request"
          where ("budget_amount" is not null and ("budget_amount" <> trunc("budget_amount") or "budget_amount" < -2147483648 or "budget_amount" > 2147483647))
             or ("quoted_amount" is not null and ("quoted_amount" <> trunc("quoted_amount") or "quoted_amount" < -2147483648 or "quoted_amount" > 2147483647))
        ) then
          raise exception 'custom order amounts contain fractional or out-of-range values';
        end if;
      end $$;`
    )
    this.addSql(
      `alter table if exists "custom_order_request" alter column "budget_amount" type integer using "budget_amount"::integer;`
    )
    this.addSql(
      `alter table if exists "custom_order_request" alter column "quoted_amount" type integer using "quoted_amount"::integer;`
    )
  }

  override async down(): Promise<void> {
    this.addSql(
      `alter table if exists "custom_order_request" alter column "quoted_amount" type numeric using "quoted_amount"::numeric;`
    )
    this.addSql(
      `alter table if exists "custom_order_request" alter column "budget_amount" type numeric using "budget_amount"::numeric;`
    )
  }
}
