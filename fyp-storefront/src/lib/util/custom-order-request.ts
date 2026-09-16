export type CustomOrderPayload = {
  artisan_id: string
  title: string
  product_category: string
  description: string
  budget_amount?: number
  currency_code: string
  listing_type: "custom_request"
}

function readRequiredText(
  formData: FormData,
  key: string,
  message: string
): string {
  const value = formData.get(key)
  const text = typeof value === "string" ? value.trim() : ""

  if (!text) {
    throw new Error(message)
  }

  return text
}

function parseBudgetToMinorUnits(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) {
    return undefined
  }

  const normalized = value.trim()

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Budget must be a valid non-negative amount")
  }

  const [whole, decimal = ""] = normalized.split(".")
  const amount = Number(whole) * 100 + Number(decimal.padEnd(2, "0"))

  if (!Number.isSafeInteger(amount) || amount > 2_147_483_647) {
    throw new Error("Budget is too large")
  }

  return amount
}

export function buildCustomOrderPayload(
  formData: FormData
): CustomOrderPayload {
  const artisanId = readRequiredText(
    formData,
    "artisan_id",
    "Artisan profile is required"
  )
  const title = readRequiredText(
    formData,
    "title",
    "Please enter a request title"
  )
  const productCategory = readRequiredText(
    formData,
    "product_category",
    "Please select a product category"
  )
  const description = readRequiredText(
    formData,
    "description",
    "Please describe what you would like made"
  )
  const currencyCode = readRequiredText(
    formData,
    "currency_code",
    "Currency is required"
  ).toLowerCase()
  const budgetAmount = parseBudgetToMinorUnits(formData.get("budget_amount"))

  return {
    artisan_id: artisanId,
    title,
    product_category: productCategory,
    description,
    ...(budgetAmount === undefined ? {} : { budget_amount: budgetAmount }),
    currency_code: currencyCode,
    listing_type: "custom_request",
  }
}
