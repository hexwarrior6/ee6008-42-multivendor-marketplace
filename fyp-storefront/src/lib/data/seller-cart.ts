"use server"

import { sdk } from "@lib/config";
import { getAuthHeaders, getCacheOptions, getCacheTag, getSellerCartMapping, removeCartId, setSellerCartMapping } from "./cookies";
import { getRegion } from "./regions";
import { HttpTypes } from "@medusajs/types";
import { revalidateTag } from "next/cache";
import medusaError from "@lib/util/medusa-error";
import { redirect } from "next/navigation"


export async function getOrCreateSellerCart(sellerId: string, countryCode: string) {
    const region = await getRegion(countryCode);

    if (!region) {
        throw new Error("Region not found for the given country code");
    }
    const mapping = await getSellerCartMapping();
    const cartId = mapping[sellerId];
    const headers = { ... (await getAuthHeaders()), }; // Fixed: Added () to function call
    console.log("Seller ID:", sellerId);
    const store = await sdk.client.fetch<HttpTypes.AdminStoreResponse>(`/store/${sellerId}`, {
        method: "GET",
        headers,
    }).then(({ store }) => store)
    .catch(() => { throw new Error("Store not found for the given seller ID") });
    console.log("Store Name:", store.name);
    

    let cart = null;
    if (cartId) {
        const next = { ... (await getCacheOptions("carts")),}

        cart = await sdk.client.fetch<HttpTypes.StoreCartResponse>(`/store/carts/${cartId}`, {
            method: "GET",
            headers,
            next,
            cache: "force-cache",
        }).then(({ cart }: { cart: HttpTypes.StoreCart }) => cart)
      .catch(() => null)
    }

    if (!cart) {
        const cartResp = await sdk.store.cart.create({
            region_id: region.id,
            metadata: {seller_id: sellerId, store_name: store.name}
        }, {}, headers)
        cart = cartResp.cart

        mapping[sellerId] = cart.id;
        await setSellerCartMapping(mapping);

        const cartCacheTag = await getCacheTag("carts");
        revalidateTag(cartCacheTag);
    }

    if (cart && cart?.region_id !== region.id) {
        await sdk.store.cart.update(cart.id, { region_id: region.id }, {}, headers);
        const cartCacheTag = await getCacheTag("carts");
        revalidateTag(cartCacheTag);
    }
    return cart
}

export async function getAllSellerCarts() {
    const mapping = await getSellerCartMapping();
    const cartIds = Object.values(mapping);

    if (cartIds.length === 0) {
        return [];
    }

    const headers = { ... (await getAuthHeaders()), };
    const next = { ... (await getCacheOptions("carts")),}

    const cartPromises = cartIds.map((cartId) =>
        sdk.client.fetch<HttpTypes.StoreCartResponse>(`/store/carts/${cartId}`, {
            method: "GET",
            query: {
                fields: "*items, *region, *items.product, *items.variant, *items.thumbnail, *items.metadata, +items.total, *promotions, +shipping_methods.name"
            },
            headers,
            next,
            cache: "force-cache",
        }).then(({ cart }) => cart)
        .catch(() => null)
    );
    const carts = await Promise.all(cartPromises);
    
    // Filter and return only non-empty carts (don't modify cookies here)
    const nonEmptyCarts = carts.filter((cart) => cart !== null && cart.items && cart.items.length > 0);
    return nonEmptyCarts;
}

// Separate Server Action to clean up empty carts from mapping
export async function cleanupEmptyCarts() {
    "use server"
    
    const mapping = await getSellerCartMapping();
    const cartIds = Object.values(mapping);
    const headers = { ... (await getAuthHeaders()), };

    for (const cartId of cartIds) {
        const cart = await sdk.client.fetch<HttpTypes.StoreCartResponse>(`/store/carts/${cartId}`, {
            method: "GET",
            headers,
        }).then(({ cart }) => cart)
        .catch(() => null);

        if (!cart || !cart.items || cart.items.length === 0) {
            await removeCartId(cartId as string);
        }
    }
}

export async function addItemToSellerCart( productid: string, variantId: string, quantity: number, sellerId: string, countryCode: string) {
    const cart = await getOrCreateSellerCart(sellerId, countryCode);
    const headers = { ... (await getAuthHeaders()), };

    await sdk.store.cart.createLineItem(cart.id, { variant_id: variantId, quantity }, {}, headers)
    .then(async () => {
        const cartCacheTag = await getCacheTag("carts");
        revalidateTag(cartCacheTag);

        const fulfillmentCacheTag = await getCacheTag("fulfillment")
        revalidateTag(fulfillmentCacheTag)
    }).catch(medusaError)
}

export async function updateSellerCartItem(cartId: string, itemId: string, quantity: number) {
    if (!itemId) {
        throw new Error("Item ID is required");
    }
    if (!cartId) {
        throw new Error("Cart ID is required");
    }

    const headers = { ... (await getAuthHeaders()), };

    await sdk.store.cart.updateLineItem(cartId, itemId, { quantity }, {}, headers)
    .then(async () => {
        const cartCacheTag = await getCacheTag("carts");
        revalidateTag(cartCacheTag);

        const fulfillmentCacheTag = await getCacheTag("fulfillment")
        revalidateTag(fulfillmentCacheTag)
    }).catch(medusaError)

    return getAllSellerCarts()
}

export async function deleteSellerCartItem(cartId: string, itemId: string) {
    if (!itemId) {
        throw new Error("Item ID is required");
    }
    if (!cartId) {
        throw new Error("Cart ID is required");
    }

    const headers = { ... (await getAuthHeaders()), };
    await sdk.store.cart.deleteLineItem(cartId, itemId, {}, headers)
    .then(async () => {
        const cartCacheTag = await getCacheTag("carts");
        revalidateTag(cartCacheTag);

        const fulfillmentCacheTag = await getCacheTag("fulfillment")
        revalidateTag(fulfillmentCacheTag)

    }).catch(medusaError)

    return getAllSellerCarts()
}

export async function getTotalItemsCount(): Promise<number> {
  const carts = await getAllSellerCarts()
  return carts.reduce((total, cart) => {
    if (!cart || !cart.items) {
      return total
    }
    return total + cart.items.reduce((sum, item) => sum + item.quantity, 0)
  }, 0)
}

export async function retrieveCart(cartId: string, fields?: string) {
    const id = cartId;
    fields ??= "*items, *region, *items.product, *items.variant, *items.thumbnail, *items.metadata, +items.total, *promotions, +shipping_methods.name"

    if (!id) {
    return null
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const next = {
    ...(await getCacheOptions("carts")),
  }

  return await sdk.client
    .fetch<HttpTypes.StoreCartResponse>(`/store/carts/${id}`, {
      method: "GET",
      query: {
        fields
      },
      headers,
      next,
      cache: "force-cache",
    })
    .then(({ cart }: { cart: HttpTypes.StoreCart }) => cart)
    .catch(() => null)
}

export async function updateCart(cartId: string, data: HttpTypes.StoreUpdateCart) {

  if (!cartId) {
    throw new Error("No existing cart found, please create one before updating")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  return sdk.store.cart
    .update(cartId, data, {}, headers)
    .then(async ({ cart }: { cart: HttpTypes.StoreCart }) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)

      const fulfillmentCacheTag = await getCacheTag("fulfillment")
      revalidateTag(fulfillmentCacheTag)

      return cart
    })
    .catch(medusaError)
}

// TODO: Pass a POJO instead of a form entity here
export async function setAddresses(cartId: string, currentState: unknown, formData: FormData) {
  try {
    if (!formData) {
      throw new Error("No form data found when setting addresses")
    }

    const data = {
      shipping_address: {
        first_name: formData.get("shipping_address.first_name"),
        last_name: formData.get("shipping_address.last_name"),
        address_1: formData.get("shipping_address.address_1"),
        address_2: "",
        company: formData.get("shipping_address.company"),
        postal_code: formData.get("shipping_address.postal_code"),
        city: formData.get("shipping_address.city"),
        country_code: formData.get("shipping_address.country_code"),
        province: formData.get("shipping_address.province"),
        phone: formData.get("shipping_address.phone"),
      },
      email: formData.get("email"),
    } as any

    const sameAsBilling = formData.get("same_as_billing")
    if (sameAsBilling === "on") data.billing_address = data.shipping_address

    if (sameAsBilling !== "on")
      data.billing_address = {
        first_name: formData.get("billing_address.first_name"),
        last_name: formData.get("billing_address.last_name"),
        address_1: formData.get("billing_address.address_1"),
        address_2: "",
        company: formData.get("billing_address.company"),
        postal_code: formData.get("billing_address.postal_code"),
        city: formData.get("billing_address.city"),
        country_code: formData.get("billing_address.country_code"),
        province: formData.get("billing_address.province"),
        phone: formData.get("billing_address.phone"),
      }
    await updateCart(cartId, data)
  } catch (e: any) {
    return e.message
  }

  redirect(
    `/${formData.get("shipping_address.country_code")}/checkout/${cartId}?step=delivery`
  )
}

export async function placeOrder(cartId: string) {
  const id = cartId

  if (!id) {
    throw new Error("No existing cart found when placing an order")
  }

  const headers = {
    ...(await getAuthHeaders()),
  }

  const cartRes = await sdk.store.cart
    .complete(id, {}, headers)
    .then(async (cartRes) => {
      const cartCacheTag = await getCacheTag("carts")
      revalidateTag(cartCacheTag)
      return cartRes
    })
    .catch(medusaError)
  // const cartRes = await sdk.client.fetch<HttpTypes.StoreCompleteCartResponse>(
  //   `/store/carts/${id}/complete-vendor`, {
  //     method: "POST",
  //     headers
  //   })
  //   .then(async (cartRes) => {
  //     const cartCacheTag = await getCacheTag("carts")
  //     revalidateTag(cartCacheTag)
  //     return cartRes
  //   })
  //   .catch(medusaError)

  if (cartRes?.type === "order") {
    const countryCode =
      cartRes.order.shipping_address?.country_code?.toLowerCase()

    const orderCacheTag = await getCacheTag("orders")
    revalidateTag(orderCacheTag)

    await removeCartId(cartId)
    redirect(`/${countryCode}/order/${cartRes?.order.id}/confirmed`)
  }

  return cartRes.cart
}