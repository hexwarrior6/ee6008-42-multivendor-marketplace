import { retrieveCustomer } from "@lib/data/customer"
import { Toaster } from "@medusajs/ui"
import AccountLayout from "@modules/account/templates/account-layout"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

export default async function AccountPageLayout({
  dashboard,
  login,
}: {
  dashboard?: React.ReactNode
  login?: React.ReactNode
}) {
  const [customer, locale] = await Promise.all([
    retrieveCustomer().catch(() => null),
    getStorefrontLocale(),
  ])

  return (
    <AccountLayout customer={customer} locale={locale}>
      {customer ? dashboard : login}
      <Toaster />
    </AccountLayout>
  )
}
