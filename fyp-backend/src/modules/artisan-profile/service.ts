import type { Context } from "@medusajs/framework/types"
import {
  InjectTransactionManager,
  MedusaContext,
  MedusaError,
  MedusaService,
} from "@medusajs/framework/utils"
import { ArtisanProfile } from "./models/artisan-profile"

export type ArtisanProfileMutation = {
  id: string
  expectedVersion?: number
  data: Record<string, unknown>
}

export class ArtisanProfileService extends MedusaService({
  ArtisanProfile,
}) {
  /**
   * Update a profile with an optimistic version check. Media is currently
   * stored as JSON for compatibility, so the conditional selector prevents
   * concurrent read/append/write requests from losing one another's media.
   */
  @InjectTransactionManager()
  async updateArtisanProfileAtomically(
    input: ArtisanProfileMutation,
    @MedusaContext() sharedContext?: Context
  ) {
    const current = await this.retrieveArtisanProfile(
      input.id,
      undefined,
      sharedContext
    )
    const currentVersion = Number(current.version ?? 0)
    if (
      input.expectedVersion !== undefined &&
      input.expectedVersion !== currentVersion
    ) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "The artisan profile was updated by another request. Please retry."
      )
    }

    const updated = await this.updateArtisanProfiles(
      {
        selector: { id: current.id, version: currentVersion },
        data: {
          ...input.data,
          version: currentVersion + 1,
        },
      },
      sharedContext
    )
    const result = Array.isArray(updated) ? updated[0] : updated
    if (!result) {
      throw new MedusaError(
        MedusaError.Types.CONFLICT,
        "The artisan profile was updated by another request. Please retry."
      )
    }
    return result
  }
}
