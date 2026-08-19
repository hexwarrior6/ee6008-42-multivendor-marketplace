import type { AuthenticatedMedusaRequest,  MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import recalculateOnboardingWorkflow from "../../../workflows/recalculate-onboarding-status";

export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const userModuleService = req.scope.resolve(Modules.USER)
  const logger = req.scope.resolve("logger")
  const query = req.scope.resolve("query")
  
  const user = await userModuleService.retrieveUser(req.auth_context.actor_id)

  const { data: store } = await query.graph({
    entity: "user_store",
    fields: ["store.*"],
    filters: { "user_id": user.id },
  })

  const { result } = await recalculateOnboardingWorkflow.run({
    input: { storeId: store[0].store?.id },
    container: req.scope,
  })

  res.status(201).json({ result });
};