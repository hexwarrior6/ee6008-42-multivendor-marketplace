import { AuthenticatedMedusaRequest, container, MedusaResponse } from "@medusajs/framework";
import { Modules } from "@medusajs/framework/utils";


export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
    const id = req.params.id;
    const store = await container.resolve(Modules.STORE).retrieveStore(id);
    return res.status(200).json({ store });
}