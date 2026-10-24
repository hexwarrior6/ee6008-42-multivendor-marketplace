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

本节是对所有成员与 agent 的硬性约束：**新建分支或 PR 之前先对照本节自查，
不符合就不要建**——同一任务续用已有分支，不要多开；分支命名由 CI
（`check-branch-name.yml`）强制校验，违规 PR 无法通过检查。

- 分支一律基于 `origin/development` 新建，PR 回 `development`，合并后删除分支。
- **永不直接 push `main`**（GitHub 受保护，合并被 workflow 限制）；`development`
  也统一走 PR，保持可审查历史——包括纯文档改动。任何人都不得绕过 PR 直接
  push `development`。
- Commit message 用约定式前缀：`feat(scope): ...`、`fix(scope): ...`、`docs: ...`。
  scope 用**功能名**（如 `recommendation-engine`、`storefront`、`backend`），
  不用成员代号（S1–S5）——成员归属由 git 记录，不进命名。
- 提交前跑所在目录的验证命令（见下），不过不提交。

### 分支命名（统一格式，agent 必须严格执行）

- 格式固定为 `<type>/<英文短主题>`：全小写 kebab-case，`type` 与 commit 前缀一致，
  取 `feat` / `fix` / `docs` / `chore` / `perf` / `ci` / `data` 之一。
  必须匹配：`^(feat|fix|docs|chore|perf|ci|data)/[a-z0-9-]+$`
  - ✅ `feat/seller-analytics-dashboard`、`fix/analytics-sales-populate`、
    `docs/agent-git-norms`
  - ❌ `codex/seller-analytics-dashboard`（工具名）、`S5-perf-test`（代号+下划线）、
    `perf/analytics-load-tests-20261025`（日期后缀）
- 主题写功能内容，不带成员代号、工具名、日期或随机后缀；描述同一任务的新提交
  直接推到已有分支，**不要另开平行分支**。
- 一个任务一个分支，用完即删：合并或放弃后立即删除远端与本地分支，不跨周堆积。

### PR 粒度（小团队扁平规则，不要按大项目操作）

- **默认一个任务一个 PR**——按「任务」切，不按「人」切：可以一人独做，也可以
  两人共建一个 PR（都提交到同一分支，commit 里用 `Co-authored-by` 标注协作，
  review 时把相关 owner 都 @ 到）。
- 一个 PR 装一个完整任务，或一组**紧密相关**、能一起测试、一起回滚的改动
  （如某层的功能 + 它的文档 + 它的配置）。紧密相关的多个功能应**合并成一个
  PR**，审和测都更省事。
- **不要一个 commit 开一个 PR**，也不要把互不相关的改动塞进同一个 PR。
- 改动落在**别人负责的目录**时，在 PR 描述里 @ 对应 owner 请其审查即可，不必
  为此单独开 PR；只有两种情况才拆出独立小 PR：
  1. 需要**抢先合并**解锁他人（如修复阻塞全组验收的 bug）；
  2. 对应 owner 明确要求单独小 PR，或风险/回滚需求与主 PR 明显不同。
- PR 标题与 commit 同款约定式前缀；描述写清「改了什么 + 怎么验证」，让 reviewer
  能照着测。合并后删除分支。

## CI/CD

- GitHub Actions 只认**仓库根目录**的 `.github/workflows/`；子目录里的 `.github/`
  副本不会被执行（如 `recommendation-engine/.github/` 仅作参考）。
- 现有 workflow：`restrict-main-merge.yml`（合并限制：仅 development 可合入
  main）；`check-branch-name.yml`（校验回 development 的 PR 分支命名，规则见上节）；
  `backend-ci.yml`（后端
  类型检查 + 单测 + HTTP 集成测试 + 构建）；`recommendation-engine.yml` 与
  `storefront-typecheck.yml`（PR 质检门，按路径触发）；`recommendation-training.yml`
  （手动触发：连平台库训练并导出 `recommendations.json` 产物）。推荐引擎的检查入口是
  `recommendation-engine/scripts/run_checks.py`，由 S5 维护。

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
