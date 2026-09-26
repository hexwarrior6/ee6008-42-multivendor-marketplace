"use client"

import { createContext, useContext, type ReactNode } from "react"

import {
  getStorefrontDictionary,
  type StorefrontDictionary,
  type StorefrontLocale,
} from "./storefront"

type StorefrontI18n = {
  locale: StorefrontLocale
  t: StorefrontDictionary
}

const StorefrontLocaleContext = createContext<StorefrontI18n | null>(null)

type StorefrontLocaleProviderProps = {
  children: ReactNode
  locale: StorefrontLocale
}

export function StorefrontLocaleProvider({
  children,
  locale,
}: StorefrontLocaleProviderProps) {
  return (
    <StorefrontLocaleContext.Provider
      value={{ locale, t: getStorefrontDictionary(locale) }}
    >
      {children}
    </StorefrontLocaleContext.Provider>
  )
}

export function useStorefrontI18n(): StorefrontI18n {
  const context = useContext(StorefrontLocaleContext)

  if (!context) {
    throw new Error(
      "useStorefrontI18n must be used within StorefrontLocaleProvider"
    )
  }

  return context
}
