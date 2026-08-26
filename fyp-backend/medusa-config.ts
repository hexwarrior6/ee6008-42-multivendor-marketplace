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
    // Local development: Resend email notifications are temporarily disabled
    // because no RESEND_API_KEY has been provided. Re-enable before testing email.
    // Local development: Stripe payments are disabled because this project
    // will use WeChat Pay. Stripe Connect remains registered only because
    // existing database links depend on it; its API calls are disabled unless
    // STRIPE_API_KEY is configured.
    fileModule,
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
