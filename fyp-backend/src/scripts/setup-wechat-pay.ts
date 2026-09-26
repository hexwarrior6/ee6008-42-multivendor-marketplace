import type { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  createRegionsWorkflow,
  createTaxRegionsWorkflow,
  updateRegionsWorkflow,
  updateStoresStep,
} from "@medusajs/medusa/core-flows";
import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk";

const WECHAT_PROVIDER_ID = "pp_wechat_wechat";

const updateStoreCurrencies = createWorkflow(
  "setup-wechat-pay-store-currencies",
  (input: {
    store_id: string;
    supported_currencies: { currency_code: string; is_default?: boolean }[];
  }) => {
    const normalizedInput = transform({ input }, (data) => ({
      selector: { id: data.input.store_id },
      update: {
        supported_currencies: data.input.supported_currencies.map(
          (currency) => ({
            currency_code: currency.currency_code,
            is_default: currency.is_default ?? false,
          })
        ),
      },
    }));
    const stores = updateStoresStep(normalizedInput);
    return new WorkflowResponse(stores);
  }
);

export default async function setupWeChatPay({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const query = container.resolve(ContainerRegistrationKeys.QUERY);
  const storeService = container.resolve(Modules.STORE);
  const taxService = container.resolve(Modules.TAX);

  const providers = await query.graph({
    entity: "payment_provider",
    fields: ["id"],
    filters: { id: WECHAT_PROVIDER_ID },
  });
  if (!providers.data.length) {
    throw new Error(
      `${WECHAT_PROVIDER_ID} is not registered. Enable WeChat Pay and restart/migrate the backend first.`
    );
  }

  const [store] = await storeService.listStores(
    {},
    { relations: ["supported_currencies"] }
  );
  if (!store) throw new Error("No Medusa store was found");

  const currencies = (store.supported_currencies || []).map((currency) => ({
    currency_code: currency.currency_code,
    is_default: currency.is_default,
  }));
  if (!currencies.some((currency) => currency.currency_code === "cny")) {
    currencies.push({ currency_code: "cny", is_default: false });
    await updateStoreCurrencies(container).run({
      input: { store_id: store.id, supported_currencies: currencies },
    });
    logger.info("Added CNY to the store's supported currencies");
  }

  const regions = await query.graph({
    entity: "region",
    fields: [
      "id",
      "name",
      "currency_code",
      "countries.iso_2",
      "payment_providers.id",
    ],
  });
  const chinaRegion = regions.data.find(
    (region: any) =>
      region.currency_code === "cny" ||
      region.countries?.some((country: any) => country.iso_2 === "cn")
  ) as any;

  if (chinaRegion) {
    const providerIds = Array.from(
      new Set([
        ...(chinaRegion.payment_providers || []).map(
          (provider: any) => provider.id
        ),
        WECHAT_PROVIDER_ID,
      ])
    ) as string[];
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: chinaRegion.id },
        update: {
          name: chinaRegion.name || "中国",
          currency_code: "cny",
          countries: ["cn"],
          payment_providers: providerIds,
        },
      },
    });
    logger.info(`Updated China region ${chinaRegion.id}`);
  } else {
    const result = await createRegionsWorkflow(container).run({
      input: {
        regions: [
          {
            name: "中国",
            currency_code: "cny",
            countries: ["cn"],
            payment_providers: [WECHAT_PROVIDER_ID, "pp_system_default"],
          },
        ],
      },
    });
    logger.info(`Created China/CNY region ${result.result[0].id}`);
  }

  const taxRegions = await taxService.listTaxRegions({ country_code: "cn" });
  if (!taxRegions.length) {
    await createTaxRegionsWorkflow(container).run({
      input: [{ country_code: "cn", provider_id: "tp_system" }],
    });
    logger.info("Created China tax region");
  }

  logger.info("WeChat Pay region setup is complete");
}
