# AGENTS.md — 仓库级协作约定（monorepo 唯一一份）

> 本文件是整个多商户市场仓库（EE6008 毕业项目）**唯一**的 agent 约定文件，
> 对所有子目录生效，不按子目录拆分。环境搭建见 [readme.txt](readme.txt)。

## 仓库结构

| 目录 | 内容 | Owner |
| --- | --- | --- |
| `fyp-backend/` | Medusa v2 (TypeScript) 后端：API、订单、支付、聊天 | S1 / S3 |
| `fyp-storefront/` | Next.js 店面：浏览、购物车、结算、多语言 | S2 |
| `recommendation-engine/` | Python 推荐训练管道（离线批处理） | S4，CI 接入由 S5 负责 |

五人小组（S1–S5）共用此仓库；改动不属于自己的目录前，先在群里对齐。

## Git 规则

- 分支一律基于 `origin/development` 新建，PR 回 `development`，合并后删除分支。
- **永不直接 push `main`**（GitHub 受保护，合并被 workflow 限制）；`development`
  也统一走 PR，保持可审查历史——包括纯文档改动。
- Commit message 用约定式前缀：`feat(scope): ...`、`fix(scope): ...`、
  `refactor(s4): ...`、`docs: ...`。
- 提交前跑所在目录的验证命令（见下），不过不提交。

## CI/CD

- GitHub Actions 只认**仓库根目录**的 `.github/workflows/`；子目录里的 `.github/`
  副本不会被执行（如 `recommendation-engine/.github/` 仅作参考）。
- 现有 workflow：`restrict-main-merge.yml`（合并限制）。
- 规划中：推荐引擎检查接入（入口 `recommendation-engine/scripts/run_checks.py`，S5 维护）。

## 语言惯例

代码、标识符、注释用英文；面向人的文档（README、docs/*.md）用中文。

## 改完必须验证（按目录）

| 目录 | 命令 | 备注 |
| --- | --- | --- |
| `fyp-backend/` | `pnpm test:unit`、`npx tsc --noEmit` | 集成测试（`test:integration:*`）需云端 DB 环境变量 `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` |
| `fyp-storefront/` | `npx tsc --noEmit` | 对照 25 错误基线；`next build` 需后端在运行；`next lint` 当前不可用 |
| `recommendation-engine/` | `python scripts/run_checks.py` | 退出码必须为 0 |

## 各目录关键约束

### fyp-backend（Medusa v2）

- 遵循 Medusa v2 模块/服务结构；数据库变更走 migration，不手工改库。

### fyp-storefront（Next.js）

- 数据层注意缓存陷阱：.forceCache / 缓存配置不当会让本地化与价格显示失效。

### recommendation-engine（Python）

- **数据只读**：仅用平台自身数据训练，业务表只允许 SELECT，绝不写库、不新增数据采集。
- **导出契约冻结**：`RecommendationItem`（`product_id` / `title` / `handle` /
  `thumbnail` / `score` / `reason`）与顶层 `by_user` / `by_product` / `fallback`
  是 S1 后端 `GET /store/recommendations` 的依赖，改前必须与 S1 对齐。
- **双数据库兼容**：DB 代码必须同时在 PostgreSQL 和 SQLite 上可用；表/列经自省 +
  角色同义词解析（`database.py`），禁止硬编码表名；SQL 标识符经 `quote_table()`；
  PG enum 先 `CAST(... AS TEXT)`。
- **核心依赖只有 numpy**：新增第三方依赖需在 `requirements.txt` 对应分组注明用途；
  可选依赖（psycopg2、lightfm）缺失时提示并跳过，不得静默崩溃。
- **模型可互换**：新模型实现统一接口（`fit(rows, n_users, n_items)`，见
  `docs/ARCHITECTURE.md` §5），放入 `models/`；测试用标准库 `unittest`。
- 订单行两种布局都要保住：Medusa v2 两跳（`order ← order_item → order_line_item`）
  与单表（模拟库），`fetch_purchases` 自动判别。
- `simulated_marketplace.db` 故意入库（组员开箱即用）；`artifacts/`、`.env` 不入库。
- Python ≥ 3.9；随机逻辑一律接受 seed 并透传 CLI `--seed`。

更多实现细节见各目录的 README 与 docs/。
