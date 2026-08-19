import { InjectManager, InjectTransactionManager, MedusaContext, MedusaError, MedusaService } from "@medusajs/framework/utils";
import { Logger } from "@medusajs/medusa";
import { Context } from "@medusajs/framework/types";
import Stripe from "stripe";
import { PayoutAccount } from "./models/payoutAccount";
import { Payout } from "./models/payout";
import { PayoutReversal } from "./models/payout-reversal";
import { getAmountFromSmallestUnit } from "./util/money";

type ModuleOptions = {
    apiKey: string
    //serverUrl: string
}
type InjectedDependencies = {
    logger: Logger
}

export type CreateTransferDTO = {
    payout_account_id: string
    stripe_connect_id: string
    amount: number
    currency_code: string

}

type CreatePayoutDTO = {
  currency_code: string
  amount: number
  payout_account_id: string,
  data: Record<string, unknown>
}

export class StripeConnectModuleService extends MedusaService({
  PayoutAccount,
  Payout,
  PayoutReversal,
}) {
    protected readonly logger: Logger
    protected readonly stripe_: Stripe
    protected readonly serverUrl: string = "localhost:9000"

    constructor({ logger }: InjectedDependencies, options: ModuleOptions) {
      super(...arguments);
      this.logger = logger;
      this.stripe_ = new Stripe(options.apiKey)
      // this.serverUrl = options.serverUrl;
    }

    // Handle creation of payout account record in DB
    @InjectTransactionManager()
    protected async createRecord_(
      data: string,
      @MedusaContext() sharedContext?: Context
    ) {
      const payoutAccount = await this.createPayoutAccounts({stripe_connect_id: data}, sharedContext)
      return payoutAccount
    }

    @InjectTransactionManager()
    protected async createPayoutRecord_(
      data: CreatePayoutDTO,
      @MedusaContext() sharedContext?: Context
    ) {
      const payoutAccount = await this.createPayouts({
        currency_code: data.currency_code,
        amount: getAmountFromSmallestUnit(data.amount, data.currency_code),
        payout_account_id: data.payout_account_id,
        data: data.data
      }, sharedContext)
      return payoutAccount
    }

    //Stripe API call to create a connected account
    //Express Account -> PayoutAccount record in DB
    @InjectManager()
    async createStripeAccount(
      storeId: string,
      storeName: string,
      @MedusaContext() sharedContext?: Context) {
        try {
          const account = await this.stripe_.accounts.create({
          type: 'express',
          country: 'SG',
          business_type: 'individual',
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });

        this.logger.info(`Created Stripe Connect account: ${account.id} for store ID: ${storeId}`);

        // Create payout account record in DB
        const accountRecord = await this.createRecord_(account.id, sharedContext);
        this.logger.info(`Created payout account record in DB for Stripe Connect account: ${account.id}`);
        return accountRecord;

        } catch (error) {
          this.logger.error(`Error creating Stripe Connect account for store ID: ${storeId} - ${error.message}`);
          throw new MedusaError(MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR, `Failed to create Stripe Connect account: ${error.message}`);
        }

      }

      async retrieveStripeAccount(stripeAccountId: string): Promise<Stripe.Response<Stripe.Account>> {
        try {
          const account = await this.stripe_.accounts.retrieve(stripeAccountId);
          return account;
        } catch (error) {
          this.logger.error(`Error retrieving Stripe Account with ID: ${stripeAccountId} - ${error.message}`);
          throw new MedusaError(MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR, `Failed to retrieve Stripe Account: ${error.message}`);
        }
      }

      async createAccountLink(
        stripeAccountId: string,
        @MedusaContext() sharedContext?: Context
      ): Promise<Stripe.Response<Stripe.AccountLink>> {
        try {
          const accountLink = await this.stripe_.accountLinks.create({
            account: stripeAccountId,
            refresh_url: `${process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"}/app`,
            return_url: `${process.env.MEDUSA_BACKEND_URL || "http://localhost:9000"}/admin/stripe-connect/account-link/return`,
            type: 'account_onboarding',
          });
          
          return accountLink;
        } catch (error) {
          this.logger.error(`Error creating Stripe Account Link for account ID: ${stripeAccountId} - ${error.message}`);
          throw new MedusaError(MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR, `Failed to create Stripe Account Link: ${error.message}`);
        }
      }

      async getStripeFees(paymentIntentId: string) {
        try {
          const paymentIntent = await this.stripe_.paymentIntents.retrieve(paymentIntentId, {
            expand: ['latest_charge.balance_transaction'],
          });

          const charge = paymentIntent.latest_charge as Stripe.Charge;
          const balanceTransaction = charge.balance_transaction as Stripe.BalanceTransaction;

          return {
            fee: balanceTransaction.fee,
            currency: balanceTransaction.currency
          }
          
        } catch (error) {
          this.logger.error(`Error retrieving Stripe fees for Payment Intent ID: ${paymentIntentId} - ${error.message}`);
          throw new MedusaError(MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR, `Failed to retrieve Stripe fees: ${error.message}`);
        }
      }

      async createTransfer(
        input: CreateTransferDTO,
        @MedusaContext() sharedContext?: Context
      ) {
        try {
          const transfer = await this.stripe_.transfers.create({
          amount: input.amount,
          currency: input.currency_code,
          destination: input.stripe_connect_id,
        });
        //Create DB record
        //Later on change order db record create outside in workflow then actual transfer happen during scheduled job
        const record = await this.createPayoutRecord_({
          currency_code: input.currency_code,
          amount: input.amount,
          payout_account_id: input.payout_account_id,
          data: { ...transfer }
        }, sharedContext);

        return record;
        } catch (error) {
          this.logger.error(`Error creating Stripe Transfer: ${error.message}`);
          throw new MedusaError(MedusaError.Types.PAYMENT_AUTHORIZATION_ERROR, `Failed to create Stripe Transfer: ${error.message}`);
        }
      }

    //Medusa AI recommendation
    /*
    @InjectManager()
async createPayoutAccount(
  dto: CreatePayoutAccountDTO,
  @MedusaContext() sharedContext?: Context<EntityManager>
) {
  // Step 1: create DB record in a transaction
  const payout = await this.createPayoutAccountDb_(dto, sharedContext)

  try {
    // Step 2: call external provider (outside the DB transaction)
    const { data, id: referenceId } = await this.provider_.createPayoutAccount({
      context: dto.context,
      account_id: payout.id,
    })

    // Step 3: update DB with provider data (this can itself be another transactional method if needed)
    await this.updatePayoutAccounts(
      {
        id: payout.id,
        data,
        reference_id: referenceId,
      },
      sharedContext
    )

    const updated = await this.retrievePayoutAccount(
      payout.id,
      undefined,
      sharedContext
    )

    return updated
  } catch (error) {
    // optional: clean up DB record
    await this.deletePayoutAccounts(payout.id, sharedContext)
    throw error
  }
}
    */

    //Retrieves a Stripe Connect account by store ID
    // async retrieveStripeAccount(storeId: string): Promise<Stripe.Response<Stripe.Account>> {
    //     try {
    //         const store = await this.storeModuleService.retrieveStore(storeId)
    //         if (!store) {
    //             throw new MedusaError(MedusaError.Types.NOT_FOUND, `Store with ID ${storeId} not found`);
    //         }

    //     } catch (error) {
            
    //     }
    // }
}