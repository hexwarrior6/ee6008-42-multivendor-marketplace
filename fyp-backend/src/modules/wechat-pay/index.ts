import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import WeChatPayProviderService from "./service";

export default ModuleProvider(Modules.PAYMENT, {
  services: [WeChatPayProviderService],
});
