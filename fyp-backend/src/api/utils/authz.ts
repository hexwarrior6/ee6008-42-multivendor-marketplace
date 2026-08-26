import type {
  AuthContext,
  MedusaRequest,
} from "@medusajs/framework/http"
import {
  ContainerRegistrationKeys,
  MedusaError,
  Modules,
} from "@medusajs/framework/utils"
import {
  ARTISAN_PROFILE_MODULE,
  ArtisanProfileService,
} from "../../modules/artisan-profile"

type RequestWithOptionalAuth = MedusaRequest & {
  auth_context?: AuthContext
}

type BackofficeUser = {
  metadata?: Record<string, unknown> | null
  roles?: string[] | null
}

export type BackofficeAccess = {
  context: AuthContext
  isPlatformAdmin: boolean
  storeIds: string[]
}

export type CustomOrderActor = {
  actor_type: "customer" | "artisan" | "admin"
  actor_id: string
}

const ADMIN_ROLE_NAMES = new Set([
  "admin",
  "superadmin",
  "super_admin",
  "role_super_admin",
  "platform_admin",
  "platform-admin",
])

const unauthorized = (message = "Authentication is required") =>
  new MedusaError(MedusaError.Types.UNAUTHORIZED, message)

const forbidden = (message = "You do not have permission to access this resource") =>
  new MedusaError(MedusaError.Types.NOT_ALLOWED, message)

export const requireAuthContext = (req: RequestWithOptionalAuth): AuthContext => {
  if (!req.auth_context?.actor_id) {
    throw unauthorized()
  }

  return req.auth_context
}

export const requireCustomerContext = (
  req: RequestWithOptionalAuth
): AuthContext => {
  const context = requireAuthContext(req)
  if (context.actor_type !== "customer") {
    throw forbidden("A customer account is required for this operation")
  }

  return context
}

const extractRoleNames = (context: AuthContext, user?: BackofficeUser) => {
  // `app_metadata` is copied from the signed Medusa JWT and is the only JWT
  // metadata that the auth middleware treats as an authorization source.
  // `user_metadata` is profile data and may be supplied by the account owner,
  // so trusting an `is_admin` flag there would re-introduce a privilege
  // escalation. Persisted `user.roles` is retained as a server-managed role
  // source; the custom metadata escape hatch is limited to the explicit
  // `is_super_admin` marker used by this project.
  const metadata = [context.app_metadata]
  const values: string[] = []

  for (const source of metadata) {
    if (!source) {
      continue
    }

    for (const key of [
      "role",
      "roles",
      "user_role",
      "is_admin",
      "is_super_admin",
    ]) {
      const value = source[key]
      if (Array.isArray(value)) {
        values.push(...value.filter((item): item is string => typeof item === "string"))
      } else if (typeof value === "string") {
        values.push(value)
      } else if (
        value === true &&
        (key === "is_admin" || key === "is_super_admin")
      ) {
        values.push("admin")
      }
    }
  }

  if (user?.roles) {
    values.push(...user.roles)
  }

  if (user?.metadata?.is_super_admin === true) {
    values.push("admin")
  }

  return values.map((value) => value.trim().toLowerCase())
}

/**
 * Resolve the stores linked to a back-office user. The marketplace plugin
 * creates the `user_store` link, so the result is the source of truth for
 * seller isolation rather than a client supplied query parameter.
 */
export const getOwnedStoreIds = async (
  req: RequestWithOptionalAuth,
  userId = requireAuthContext(req).actor_id
): Promise<string[]> => {
  try {
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const { data } = await query.graph({
      entity: "user_store",
      fields: ["store_id", "store.id"],
      filters: { user_id: userId },
    })

    return [...new Set(
      ((data || []) as Array<{
        store_id?: string | null
        store?: { id?: string | null } | null
      }>)
        .map((entry) => entry.store_id || entry.store?.id)
        .filter((id): id is string => Boolean(id))
    )]
  } catch (error) {
    // A failed ownership lookup must never be interpreted as "no stores".
    // Treating it as an empty result would upgrade an unlinked seller to a
    // platform administrator in the caller below.
    securityLog(req, "store ownership lookup failed", {
      actor_id: userId,
      error: error instanceof Error ? error.message : String(error),
    })
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "Store ownership could not be verified"
    )
  }
}

const retrieveUser = async (
  req: RequestWithOptionalAuth,
  context: AuthContext
): Promise<BackofficeUser> => {
  const userModule = req.scope.resolve(Modules.USER)
  return (await userModule.retrieveUser(context.actor_id)) as BackofficeUser
}

export const getBackofficeAccess = async (
  req: RequestWithOptionalAuth
): Promise<BackofficeAccess> => {
  const context = requireAuthContext(req)
  if (context.actor_type !== "user" && context.actor_type !== "api-key") {
    throw forbidden("A back-office account is required for this operation")
  }

  if (context.actor_type === "api-key") {
    return { context, isPlatformAdmin: true, storeIds: [] }
  }

  const [user, storeIds] = await Promise.all([
    retrieveUser(req, context),
    getOwnedStoreIds(req, context.actor_id),
  ])
  const roles = extractRoleNames(context, user)
  const explicitlyAdmin = roles.some((role) => ADMIN_ROLE_NAMES.has(role))
  if (!explicitlyAdmin && !storeIds.length) {
    securityLog(req, "back-office user has no trusted role or store", {
      actor_id: context.actor_id,
    })
    throw forbidden(
      "A trusted platform administrator role or an owned store is required"
    )
  }

  // A user is a platform administrator only when an explicit trusted role or
  // the marketplace's is_super_admin metadata is present. Store ownership is
  // never used as an administrator fallback.
  const isPlatformAdmin = explicitlyAdmin

  return { context, isPlatformAdmin, storeIds }
}

export const requirePlatformAdmin = async (
  req: RequestWithOptionalAuth
) => {
  const access = await getBackofficeAccess(req)
  if (!access.isPlatformAdmin) {
    throw forbidden("Only a platform administrator can perform this operation")
  }

  return access
}

export const requireStoreOwnership = async (
  req: RequestWithOptionalAuth,
  storeId: string
) => {
  const access = await getBackofficeAccess(req)
  if (!access.isPlatformAdmin && !access.storeIds.includes(storeId)) {
    throw forbidden("This resource does not belong to your store")
  }

  return access
}

const getProfileForOrder = async (
  req: RequestWithOptionalAuth,
  artisanId: string
) => {
  try {
    const service: ArtisanProfileService = req.scope.resolve(
      ARTISAN_PROFILE_MODULE
    )
    return await service.retrieveArtisanProfile(artisanId)
  } catch {
    return undefined
  }
}

/**
 * Check whether the current actor may access a custom order. Storefront
 * customers are matched by customer_id; sellers are matched by the store of
 * the assigned artisan profile (or by an explicit artisan_user_id link).
 */
export const assertCustomOrderAccess = async (
  req: RequestWithOptionalAuth,
  order: {
    customer_id?: string | null
    artisan_id: string
  },
  options: { allowCustomer?: boolean; allowBackoffice?: boolean } = {}
): Promise<CustomOrderActor> => {
  const context = requireAuthContext(req)
  const allowCustomer = options.allowCustomer ?? true
  const allowBackoffice = options.allowBackoffice ?? true

  if (context.actor_type === "customer") {
    if (!allowCustomer || order.customer_id !== context.actor_id) {
      throw forbidden("You can only access your own custom orders")
    }
    return { actor_type: "customer", actor_id: context.actor_id }
  }

  if (!allowBackoffice) {
    throw forbidden()
  }

  const access = await getBackofficeAccess(req)
  if (access.isPlatformAdmin) {
    return { actor_type: "admin", actor_id: context.actor_id }
  }

  const profile = await getProfileForOrder(req, order.artisan_id)
  const assignedToUser = profile?.artisan_user_id === context.actor_id
  // Once a profile has an explicit artisan user, another seller in the same
  // store must not be able to read or mutate that artisan's orders. Legacy
  // profiles without the link fall back to the store boundary.
  const assignedToStore = Boolean(
    profile &&
      !profile.artisan_user_id &&
      access.storeIds.includes(profile.store_id)
  )

  if (!assignedToUser && !assignedToStore) {
    throw forbidden("This custom order is not assigned to your store")
  }

  return { actor_type: "artisan", actor_id: context.actor_id }
}

export const getAccessibleArtisanIds = async (
  req: RequestWithOptionalAuth,
  storeIds: string[]
): Promise<string[]> => {
  if (!storeIds.length) {
    return []
  }

  const service: ArtisanProfileService = req.scope.resolve(ARTISAN_PROFILE_MODULE)
  const actorId = requireAuthContext(req).actor_id
  const profiles = await service.listArtisanProfiles(
    { store_id: storeIds },
    { take: 1000 }
  )
  return profiles
    .filter((profile) => !profile.artisan_user_id || profile.artisan_user_id === actorId)
    .map((profile) => profile.id)
}

/** Check both store ownership and explicit artisan assignment. */
export const requireArtisanProfileAccess = async (
  req: RequestWithOptionalAuth,
  profile: { store_id: string; artisan_user_id?: string | null }
) => {
  const access = await requireStoreOwnership(req, profile.store_id)
  if (
    !access.isPlatformAdmin &&
    profile.artisan_user_id &&
    profile.artisan_user_id !== access.context.actor_id
  ) {
    throw forbidden("This artisan profile is assigned to another user")
  }
  return access
}

export const securityLog = (
  req: RequestWithOptionalAuth,
  message: string,
  details: Record<string, unknown> = {}
) => {
  try {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
    logger.warn(`[security] ${message} ${JSON.stringify(details)}`)
  } catch {
    // Logging must never turn a denied request into a 500 response.
  }
}
