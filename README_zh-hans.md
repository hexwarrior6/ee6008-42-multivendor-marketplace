<div align="center">
  <h1>BridgeCart</h1>
  <p>面向独立手艺人的多商户电商平台 —— 商家入驻、定制订单、微信支付与个性化推荐。</p>
  <p>NTU EE6008 · Group 42 · Medusa v2 + Next.js + Python</p>
  <p><a href="https://fyp-storefront-development.up.railway.app">商城前台</a> · <a href="https://fyp-backend-development.up.railway.app/app">管理后台</a> · <a href="https://recommendation-api-development.up.railway.app/docs">推荐服务</a></p>
  <p>🌐 <a href="README.md">English</a></p>
</div>

![BridgeCart 商城前台 — 商品目录](docs/images/storefront-catalog.png)

BridgeCart（手作市集）是一个面向独立手艺人的多商户电商平台：买家可以浏览、下单、支付并与卖家沟通；商家经平台审核入驻后管理自己的工匠档案与商品；平台管理员负责入驻审核与全平台数据看板。项目基于 [Medusa v2](https://docs.medusajs.com) + Next.js 构建，并配有一套由 Python 离线训练的个性化推荐服务。

## ✨ 功能特性

- **多商户商城** — 商家入驻审核 → 工匠档案管理 → 商品上架 → 独立店铺页，购物车按店铺归集、支持单店结算
- **定制订单** — 买家提交定制需求 → 商家报价 → 在线确认与支付，全流程状态跟踪（询价 / 已报价 / 已确认 / 生产中 / 已发货）
- **买卖家聊天** — 基于 TalkJS 的订单内即时沟通
- **微信支付** — 沙箱/模拟模式集成（测试无真实扣款），可切换 Stripe 信用卡支付
- **中英双语店面** — 全站中文 / EN 一键切换，价格按区域（CNY）展示
- **个性化推荐** — 基于真实购买数据的 SVD 模型，离线训练 → 导出 `recommendations.json` → FastAPI 线上服务，前台「猜你喜欢」展示
- **卖家分析看板** — 销量、定制订单漏斗与评论情感分析（`/app/analytics`）

## 🌐 线上演示

全部服务部署在 Railway（PostgreSQL · Redis · MinIO）。

| 服务 | 链接 |
| --- | --- |
| 商城前台（Portal） | https://fyp-storefront-development.up.railway.app |
| 管理后台（Admin） | https://fyp-backend-development.up.railway.app/app |
| 推荐服务（Recommendation API） | https://recommendation-api-development.up.railway.app · [Swagger 文档](https://recommendation-api-development.up.railway.app/docs) |

> 线上商店仅配置了中国区域，访问会自动跳转 `/cn` 并以 CNY 计价。管理后台演示账号随课程提交材料单独提供，不在公开仓库中展示。

## 🧱 技术栈

| 模块 | 技术 | 说明 |
| --- | --- | --- |
| `fyp-backend/` | Medusa v2 (2.13) · TypeScript · PostgreSQL · Redis · MinIO | 商品/订单/支付/聊天/分析 API，多商户自定义模块 |
| `fyp-storefront/` | Next.js 15 · React 19 · Tailwind CSS | 店面前台：浏览、购物车、结算、双语、推荐展示 |
| `recommendation-engine/` | Python ≥ 3.9 · NumPy · FastAPI | 购买数据训练（SVD）、产物导出、线上推荐 API |

## 📁 仓库结构

```
ee6008-42-multivendor-marketplace/
├── fyp-backend/             # Medusa v2 后端：API、多商户模块、支付、聊天、分析
│   └── docs/                # 后端模块文档（架构图、卖家分析、性能测试等）
├── fyp-storefront/          # Next.js 店面前台：页面、i18n、缓存与数据层
│   └── docs/                # 前台文档（推荐接入、双语集成设计等）
├── recommendation-engine/   # Python 推荐管道：训练、导出、FastAPI 服务
│   └── docs/                # 引擎文档（ARCHITECTURE、DEPLOYMENT、SENTIMENT）
├── docs/                    # 跨模块文档：集成规格、周报、QA 报告
└── .github/workflows/       # CI：分支命名校验、后端测试、类型检查、训练管道
```

## 🚀 本地运行

环境要求：Node.js ≥ 20、pnpm、PostgreSQL（Redis 与 MinIO 可选，可在 `medusa-config.ts` 中降级为本地模块）。

```bash
# 1) 后端 Backend（http://localhost:9000）
cd fyp-backend
pnpm install
cp .env.template .env          # 按需填入数据库连接
pnpm medusa db:migrate
npx medusa user --email admin@test.com --password supersecret
pnpm dev

# 2) 店面前台 Storefront（http://localhost:8000，新终端）
cd fyp-storefront
pnpm install
pnpm dev

# 3) 推荐引擎 Recommendation engine（可选）
cd recommendation-engine
pip install -r requirements.txt
python scripts/run_checks.py   # 检查入口，退出码 0 为通过
```

## 📚 更多文档

- [`docs/`](docs/) — 跨模块集成规格、周报与 QA 报告（如 [week11 系统集成与 E2E 验收报告](docs/week11-e2e-integration-and-qa-report.md)）
- [`fyp-backend/docs/`](fyp-backend/docs/) — 后端架构与模块细节
- [`fyp-storefront/docs/`](fyp-storefront/docs/) — 前台数据层与双语集成设计
- [`recommendation-engine/docs/`](recommendation-engine/docs/) — 推荐管道架构与部署
- [`AGENTS.md`](AGENTS.md) — 仓库协作约定（分支命名、PR 粒度、验证命令）

<div align="center">

NTU EE6008 合作项目 · Group 42 · 2026

</div>
