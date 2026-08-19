fyp-backend - MedusaJS backend
fyp-storefront - Next.JS storefront

Prerequisites:
Install pnpm, PostgreSQL, MedusaJS and Node.JS
Redis MinIO recommended for deployment build
Redis, MinIO (AWS S3 File storage) can be disabled in medusa-config.ts to fallback to default developmental module.

Installation:
Install dependencies with pnpm install
Migrate data model links with pnpm medusa db:migrate
Start medusa server in development with pnpm dev
Create first admin user with
curl -X POST http://localhost:9000/stores/super -d '{ "email":"admin@test.com", "password": "supersecret"}' -H 'Content-Type: application/json' -H 'Authorization: supersecret'
