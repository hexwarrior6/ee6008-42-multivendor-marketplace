import { Metadata } from "next"

import LoginTemplate from "@modules/account/templates/login-template"
import { getStorefrontDictionary } from "@lib/i18n/storefront"
import { getStorefrontLocale } from "@lib/i18n/storefront-server"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getStorefrontLocale()
  const t = getStorefrontDictionary(locale).account

  return {
    title: t.loginTitle,
    description: t.loginDescription,
  }
}

export default function Login() {
  return <LoginTemplate />
}
