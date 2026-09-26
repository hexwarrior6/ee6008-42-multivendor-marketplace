import { loadEnv, defineConfig } from '@medusajs/framework/utils'
import { resolve } from 'path'

loadEnv(process.env.NODE_ENV || 'development', process.cwd())

const minioConfigured = process.env.MINIO_ENABLED === "true" && [
  process.env.MINIO_PUBLIC_ENDPOINT,
  process.env.MINIO_ACCESS_KEY,
  process.env.MINIO_SECRET_KEY,
].every(Boolean)

const fileProvider = minioConfigured
  ? {
      resolve: "./src/modules/minio-file",
      id: "minio",
      options: {
        endPoint: process.env.MINIO_PUBLIC_ENDPOINT,
        accessKey: process.env.MINIO_ACCESS_KEY,
        secretKey: process.env.MINIO_SECRET_KEY,
        bucket: process.env.MINIO_BUCKET,
      },
    }
  : {
      resolve: "@medusajs/medusa/file-local",
      id: "local",
      options: {
        upload_dir: resolve(process.cwd(), "static", "uploads"),
        private_upload_dir: resolve(process.cwd(), "static", "private"),
      },
    }

const fileModule = {
  resolve: "@medusajs/file",
  options: {
    providers: [fileProvider],
  },
}

const hasResendConfig = Boolean(
  process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL
)
const hasStripeConfig = Boolean(process.env.STRIPE_API_KEY)
const hasWeChatPayConfig =
  process.env.WECHAT_PAY_ENABLED === "true" ||
  process.env.WECHAT_PAY_SANDBOX === "true"

const paymentProviders = [
  ...(hasStripeConfig
    ? [
        {
          resolve: "@medusajs/medusa/payment-stripe",
          id: "stripe",
          options: {
            apiKey: process.env.STRIPE_API_KEY,
            automatic_payment_methods: true,
            capture: true,
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
          },
        },
      ]
    : []),
  ...(hasWeChatPayConfig
    ? [
        {
          resolve: "./src/modules/wechat-pay",
          id: "wechat",
          options: {
            WECHAT_PAY_MODE: process.env.WECHAT_PAY_MODE,
            WECHAT_PAY_SANDBOX: process.env.WECHAT_PAY_SANDBOX,
            WECHAT_PAY_APP_ID: process.env.WECHAT_PAY_APP_ID,
            WECHAT_PAY_MCH_ID: process.env.WECHAT_PAY_MCH_ID,
            WECHAT_PAY_API_V3_KEY: process.env.WECHAT_PAY_API_V3_KEY,
            WECHAT_PAY_MCH_SERIAL_NO: process.env.WECHAT_PAY_MCH_SERIAL_NO,
            WECHAT_PAY_PRIVATE_KEY: process.env.WECHAT_PAY_PRIVATE_KEY,
            WECHAT_PAY_NOTIFY_URL: process.env.WECHAT_PAY_NOTIFY_URL,
            WECHAT_PAY_PUBLIC_KEY_ID: process.env.WECHAT_PAY_PUBLIC_KEY_ID,
            WECHAT_PAY_PUBLIC_KEY: process.env.WECHAT_PAY_PUBLIC_KEY,
            WECHAT_PAY_API_BASE_URL: process.env.WECHAT_PAY_API_BASE_URL,
          },
        },
      ]
    : []),
]

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL,
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
    fileModule,
    ...(hasResendConfig
      ? [{
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
    }]
      : []),
    ...(paymentProviders.length
      ? [
          {
            resolve: "@medusajs/medusa/payment",
            options: {
              providers: paymentProviders,
            },
          },
        ]
      : []),
    {
      resolve: "./src/modules/stripe-connect",
      options: {
        apiKey: process.env.STRIPE_API_KEY
      }
    },
    {
      resolve: "./src/modules/onboarding",
    },
    {
      resolve: "./src/modules/artisan-profile",
    },
    {
      resolve: "./src/modules/custom-order",
    },
  ]
})
