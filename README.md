<div align="center">
  <h1>BridgeCart</h1>
  <p>Multi-vendor marketplace for handmade goods — independent artisans, custom orders, WeChat Pay and personalized recommendations.</p>
  <p>NTU EE6008 · Group 42 · Medusa v2 + Next.js + Python</p>
  <p><a href="https://fyp-storefront-development.up.railway.app">Live Storefront</a> · <a href="https://fyp-backend-development.up.railway.app/app">Admin Panel</a> · <a href="https://recommendation-api-development.up.railway.app/docs">Recommendation API</a> · <a href="README_zh-hans.md">简体中文</a></p>
</div>

![BridgeCart storefront catalog](docs/images/storefront-catalog.png)

BridgeCart is a multi-vendor e-commerce platform for independent artisans: buyers browse, order, pay and chat with sellers; sellers join after an approval workflow and manage their artisan profiles and products; platform administrators review applications and monitor marketplace-wide analytics. Built on [Medusa v2](https://docs.medusajs.com) + Next.js, with a personalized recommendation service trained offline in Python.

## Features

- **Multi-vendor marketplace** — seller onboarding review → artisan profiles → product listings → per-store product pages; carts are grouped per store with per-store checkout
- **Custom orders** — buyer requests → seller quotes → online confirmation and payment, with full status tracking (inquiry / quoted / confirmed / in production / shipped)
- **Buyer–seller chat** — in-order messaging powered by TalkJS
- **WeChat Pay** — sandbox/mock integration (no real charges), switchable to Stripe card payments
- **Bilingual storefront** — one-click 中文 / EN switching, region-based pricing (CNY)
- **Personalized recommendations** — SVD model trained on real purchase data → `recommendations.json` export → live FastAPI service, surfaced as "You may also like"
- **Seller analytics dashboards** — sales, custom-order funnel and review sentiment (`/app/analytics`)

## Live Demo

All services are hosted on Railway (PostgreSQL · Redis · MinIO).

| Service | URL |
| --- | --- |
| Storefront (portal) | https://fyp-storefront-development.up.railway.app |
| Admin panel | https://fyp-backend-development.up.railway.app/app |
| Recommendation API | https://recommendation-api-development.up.railway.app · [Swagger](https://recommendation-api-development.up.railway.app/docs) |

> Only the China region is configured on the live store, so visitors are redirected to `/cn` with CNY pricing. Demo admin credentials are provided with the course submission, not published in this public repository.

## Tech Stack

| Module | Technologies | Role |
| --- | --- | --- |
| `fyp-backend/` | Medusa v2 (2.13) · TypeScript · PostgreSQL · Redis · MinIO | Product/order/payment/chat/analytics APIs, custom multi-vendor modules |
| `fyp-storefront/` | Next.js 15 · React 19 · Tailwind CSS | Storefront: browsing, cart, checkout, i18n, recommendations |
| `recommendation-engine/` | Python ≥ 3.9 · NumPy · FastAPI | Purchase-data training (SVD), artifact export, live recommendation API |

## Repository Layout

```
ee6008-42-multivendor-marketplace/
├── fyp-backend/             # Medusa v2 backend: APIs, multi-vendor modules, payments, chat, analytics
│   └── docs/                # Backend docs (architecture, seller analytics, performance tests)
├── fyp-storefront/          # Next.js storefront: pages, i18n, data layer and caching
│   └── docs/                # Storefront docs (recommendations, bilingual integration design)
├── recommendation-engine/   # Python pipeline: training, export, FastAPI service
│   └── docs/                # Engine docs (ARCHITECTURE, DEPLOYMENT, SENTIMENT)
├── docs/                    # Cross-module docs: integration specs, weekly reports, QA reports
└── .github/workflows/       # CI: branch-name check, backend tests, type checks, training pipeline
```

## Running Locally

Prerequisites: Node.js ≥ 20, pnpm, PostgreSQL (Redis and MinIO optional — fall back to local modules in `medusa-config.ts`).

```bash
# Backend — http://localhost:9000
cd fyp-backend
pnpm install
cp .env.template .env
pnpm medusa db:migrate
npx medusa user --email admin@test.com --password supersecret
pnpm dev

# Storefront — http://localhost:8000 (second terminal)
cd fyp-storefront
pnpm install
pnpm dev

# Recommendation engine (optional)
cd recommendation-engine
pip install -r requirements.txt
python scripts/run_checks.py
```

## More Documentation

- [`docs/`](docs/) — cross-module integration specs, weekly reports and QA reports (see the [Week 11 system-integration & E2E acceptance report](docs/week11-e2e-integration-and-qa-report.md))
- [`fyp-backend/docs/`](fyp-backend/docs/) — backend architecture and module details
- [`fyp-storefront/docs/`](fyp-storefront/docs/) — storefront data layer and bilingual integration design
- [`recommendation-engine/docs/`](recommendation-engine/docs/) — recommendation pipeline architecture and deployment
- [`AGENTS.md`](AGENTS.md) — repo conventions (branch naming, PR granularity, verification commands)

<div align="center">

NTU EE6008 Final Year Project · Group 42 · 2026

</div>
