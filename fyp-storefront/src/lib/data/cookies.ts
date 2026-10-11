import "server-only"
import { cookies as nextCookies } from "next/headers"
type SellerCartMapping = Record<string, string>

const sanitizeSellerCartMapping = (value: unknown): SellerCartMapping => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([storeId, cartId]) =>
    storeId.length > 0 && !["__proto__", "constructor", "prototype"].includes(storeId) &&
    typeof cartId === "string" && /^cart_[A-Za-z0-9_-]+$/.test(cartId)
  ))
}

export const getSellerCartMapping = async (): Promise<SellerCartMapping> => {
  const cookies = await nextCookies()
  const mapping = cookies.get("_medusa_seller_cart_mapping")?.value

  try {
    return mapping ? sanitizeSellerCartMapping(JSON.parse(mapping)) : {}
  } catch {
    // Ignore damaged client cookies without changing cookies during server rendering.
    return {}
  }
}

export const setSellerCartMapping = async (mapping: SellerCartMapping) => {
  const cookies = await nextCookies()
  cookies.set("_medusa_seller_cart_mapping", JSON.stringify(sanitizeSellerCartMapping(mapping)), {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
}

export const removeSellerCartMapping = async () => {
  const cookies = await nextCookies()
  cookies.set("_medusa_seller_cart_mapping", "", {
    maxAge: -1,
  })
}

export const getAuthHeaders = async (): Promise<
  { authorization: string } | {}
> => {
  try {
    const cookies = await nextCookies()
    const token = cookies.get("_medusa_jwt")?.value

    if (!token) {
      return {}
    }

    return { authorization: `Bearer ${token}` }
  } catch {
    return {}
  }
}

export const getCacheTag = async (tag: string): Promise<string> => {
  try {
    const cookies = await nextCookies()
    const cacheId = cookies.get("_medusa_cache_id")?.value

    if (!cacheId) {
      return ""
    }

    return `${tag}-${cacheId}`
  } catch (error) {
    return ""
  }
}

export const getCacheOptions = async (
  tag: string
): Promise<{ tags: string[] } | {}> => {
  if (typeof window !== "undefined") {
    return {}
  }

  const cacheTag = await getCacheTag(tag)

  if (!cacheTag) {
    return {}
  }

  return { tags: [`${cacheTag}`] }
}

export const setAuthToken = async (token: string) => {
  const cookies = await nextCookies()
  cookies.set("_medusa_jwt", token, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
}

export const removeAuthToken = async () => {
  const cookies = await nextCookies()
  cookies.set("_medusa_jwt", "", {
    maxAge: -1,
  })
}

export const getCartId = async () => {
  const cookies = await nextCookies()
  return cookies.get("_medusa_cart_id")?.value
}

export const setCartId = async (cartId: string) => {
  const cookies = await nextCookies()
  cookies.set("_medusa_cart_id", cartId, {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
}

export const removeCartId = async (cartId: string) => {
  const cookies = await nextCookies()
  const storeMapping = await getSellerCartMapping();
  const newMapping = Object.fromEntries(
    Object.entries(storeMapping).filter(([storeId, mappedCartId]) => mappedCartId !== cartId)
  )
  console.log("New mapping:", newMapping);

  cookies.set("_medusa_seller_cart_mapping", JSON.stringify(newMapping), {
    maxAge: 60 * 60 * 24 * 7,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  })
}

export const removeAllCartId = async () => {
  const cookies = await nextCookies()
  cookies.set("_medusa_seller_cart_mapping", "", {
    maxAge: -1,
  })
}
