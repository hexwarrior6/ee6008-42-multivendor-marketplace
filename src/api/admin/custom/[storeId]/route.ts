import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";
import storePayoutAccountLink from "../../../../links/store-payout";
import { z } from "@medusajs/framework/zod";

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
) {
  // const store = req.scope.resolve("currentStore");
  const storeId = req.params.storeId;
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: stores } = await query.graph({
          entity: storePayoutAccountLink.entryPoint,
          fields: ["payout_account.*"],
          filters: {
              store_id: storeId,
          }
    })

  // const { data: store } = await query.graph({
  //             entity: "store",
  //             fields: ["*"],
  //             filters: { "id": storeId },
  //         })
          
  //         const validation = z.object({
  //             name: z.string().min(1),
  //             default_sales_channel_id: z.string(),
  //             default_region_id: z.string(),
  //             default_location_id: z.string(),
  //         }).safeParse(store[0])
          
  // res.status(200).json({ 
  //   store: store[0],
  //   store_information: validation.success,
  //   validation_errors: validation.success ? null : validation.error.issues
  // });
  res.status(200).json({ store: stores[0].payout_account });
}
