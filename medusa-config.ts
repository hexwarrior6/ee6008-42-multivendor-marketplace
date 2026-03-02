import { loadEnv, defineConfig } from '@medusajs/framework/utils'
import { resolve } from 'path'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    http: {
      storeCors: process.env.STORE_CORS!,
      adminCors: process.env.ADMIN_CORS!,
      authCors: process.env.AUTH_CORS!,
      jwtSecret: process.env.JWT_SECRET || "supersecret",
      cookieSecret: process.env.COOKIE_SECRET || "supersecret",
    }
  },
  plugins: [
    {
      resolve: "@techlabi/medusa-marketplace-plugin",
      options: {}
    },
    {
      resolve: "@lambdacurry/medusa-product-reviews",
      options: {}
    }
  ],
  modules: [
    {
      resolve: "@medusajs/medusa/notification",
      options: {
        providers: [
          {
            resolve: "./src/modules/resend",
            id: "resend",
            options: {
              channels: ["email"],
              api_key: process.env.RESEND_API_KEY,
              from: process.env.RESEND_FROM_EMAIL
            }
          }
        ]
      }
    },
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/payment-stripe",
            id: "stripe",
            options: {
              apiKey: process.env.STRIPE_API_KEY,
              automatic_payment_methods: true,
              capture: true,
              webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
            }
          }
        ]
      }
    },
    {
      resolve: "./src/modules/stripe-connect",
      options: {
        apiKey: process.env.STRIPE_API_KEY
      }
    },
    {
      resolve: "./src/modules/onboarding",
    }
  ]
})
