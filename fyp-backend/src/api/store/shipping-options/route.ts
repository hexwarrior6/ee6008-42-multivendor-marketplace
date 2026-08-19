import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import listSellerShippingOptionsForCartWorkflow from "../../../workflows/list-seller-shipping-options-for-cart";

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
 
    const { cart_id, is_return } = req.filterableFields as {
        cart_id: string;
        is_return?: boolean;
    }

    const { result: shipping_options } = await listSellerShippingOptionsForCartWorkflow.run({
        input: { cart_id, is_return: !!is_return},
        container: req.scope,
    });
  

  res.json({shipping_options})
};