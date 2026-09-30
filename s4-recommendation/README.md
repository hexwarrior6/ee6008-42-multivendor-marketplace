# S4 — AI 推荐引擎（Python 服务）

负责设计、训练并对外提供**商品推荐**模型。代码独立于 Medusa（TypeScript）后端运行，
通过 `DATABASE_URL` 直连数据源（支持 **PostgreSQL**，也支持 **SQLite 单文件库**用于本地/
CI 模拟），读取平台自身的订单与商品元数据来训练，无新增数据采集（符合项目约束）；
训练完成后把推荐结果导出为对接后端 `RecommendationItem` 契约的 JSON，供 S1 的
`GET /store/recommendations` 接入。

> 📖 详细架构与实现说明见 **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**。
> 核心流程只依赖 **numpy**；LightFM 是可选对比模型；数据库可选 Postgres / SQLite。

## 1. 目录结构

```
s4-recommendation/
├─ pyproject.toml                 # 包定义（src 布局，可 pip install -e .）
├─ requirements.txt               # 依赖清单（核心 + 可选，清晰分组）
├─ README.md                      # 本文（快速上手）
├─ .env.example                   # 环境变量样例
├─ docs/
│  └─ ARCHITECTURE.md             # 详细架构与实现说明
├─ src/
│  └─ recommender/                # 主包
│     ├─ __init__.py
│     ├─ config.py                # 环境配置（读取环境变量 / .env）
│     ├─ database.py              # 数据源接入：PostgreSQL/SQLite 自省 + 角色自动定位
│     ├─ data_loader.py           # 按角色装载 商品目录 / 订单交互
│     ├─ preprocessing.py         # 清洗 + 隐反馈构建 + 训练/测试切分
│     ├─ content_based.py         # 内容相似度（冷启动 / 无历史时的回退）
│     ├─ evaluation.py            # precision@K / recall@K / hit@K / coverage
│     ├─ exporter.py              # 导出对齐 RecommendationItem 契约的 JSON
│     ├─ train.py                 # CLI 入口：清洗 → 训练 → 评估 → 导出
│     └─ models/                  # 推荐模型（统一接口，可互换）
│        ├─ __init__.py
│        ├─ svd_model.py          # ① numpy 稠密 SVD（基线）
│        ├─ als_model.py          # ② 隐反馈置信加权 ALS（Hu et al.）
│        └─ lightfm_model.py      # ③ LightFM（可选，依赖缺失时自动跳过）
├─ scripts/
│  ├─ sample_orders.csv           # 18 条交互的离线样例
│  ├─ build_simulated_db.py       # 生成单文件模拟库（SQLite，Medusa 风格）
│  ├─ make_synthetic_orders.py    # 生成大规模合成 CSV
│  ├─ selftest_role_resolve.py    # 角色定位自测（无需数据库）
│  └─ run_checks.py               # CI 一键自检（单元测试 + 冒烟）
├─ tests/                         # 单元测试（标准库 unittest）
├─ simulated_marketplace.db       # (生成) 单文件模拟数据库，供组员直接使用
└─ artifacts/                     # (运行生成) recommendations.json 等
```

## 2. 安装与运行

### 2.1 安装

```bash
cd s4-recommendation

# 方式一（推荐）：以可编辑方式安装本包 → 之后任意目录都能 import recommender
pip install -e .

# 方式二：不安装，仅把 src 加入 PYTHONPATH
# Linux/macOS:  export PYTHONPATH=src
# Windows(PowerShell):  $env:PYTHONPATH = "src"
```

依赖见 `requirements.txt`（核心只有 `numpy`；Postgres 与 LightFM 为可选）。

### 2.2 选择数据源

```bash
# A) 云端 PostgreSQL（Railway，真实数据）
export DATABASE_URL="postgresql://user:pass@host:5432/medusa"

# B) 本地单文件模拟库（SQLite，没有真实数据时用）
python scripts/build_simulated_db.py            # 默认 200 用户 / 60 商品
export DATABASE_URL="sqlite:///$(pwd)/simulated_marketplace.db"
# Windows:  $env:DATABASE_URL = "sqlite:///E:/path/to/s4-recommendation/simulated_marketplace.db"
```

### 2.3 常用命令

```bash
# 1) 只看数据库能映射到哪些角色（不训练）
python -m recommender.train --inspect

# 2) 端到端：清洗 → 训练（多模型评估对比）→ 导出推荐
python -m recommender.train --models svd,als --export artifacts/recommendations.json
python -m recommender.train --models svd,als,lightfm --export artifacts/recommendations.json --k 8

# 3) 不连任何库：用离线 CSV 跑通整条流程
python -m recommender.train --offline-rows scripts/sample_orders.csv --models svd,als

# 4) CI 自检（单元测试 + 冒烟，退出码 0/1）
python scripts/run_checks.py
```

### 2.4 CLI 参数

| 参数 | 说明 | 默认 |
| --- | --- | --- |
| `--models` | 逗号分隔：`svd`/`als`/`lightfm`/`all` | `svd,als` |
| `--factors` | 隐向量维数 | `32` |
| `--iters` | 训练迭代轮数 | `15` |
| `--k` | 评估/推荐截断 K | `8` |
| `--holdout-per-user` | 每用户留出多少个购买做评估 | `1` |
| `--seed` | 随机种子 | `0` |
| `--inspect` | 只打印表结构定位结果并退出 | – |
| `--export PATH` | 输出 JSON 路径 | `artifacts/recommendations.json` |
| `--offline-rows CSV` | 不连库，用 CSV 跑通流程 | – |

## 3. 数据来源与“角色自动定位”

`src/recommender/database.py` 启动时**自省真实表/列**（PostgreSQL 走
`information_schema`，SQLite 走 `sqlite_master` + `PRAGMA table_info`），再按“角色
同义词组”自动挑出每类角色对应的表与列（列名支持别名，如 `title`/`name`、
`category_id`/`product_category_id`）：

| 角色 | 期望语义 | 定位依据 |
| --- | --- | --- |
| `order` | 成交订单 | 含 `id`＋`customer_id`（`user_id`/`buyer_id` 亦可），表名优先 `order`/`orders` |
| `line` | **订单行商品明细** | 含 `product_id`（`variant_product_id` 亦可）；表名优先 `order_line_item`/`order_line`/`line_item`，并**排除**名字含 `category`/`review`/`cart`/`message`/`address` 的干扰表 |
| `order_item_link` | **订单↔行关联表**（Medusa v2 两跳结构） | 含 `order_id`＋`item_id`（或 `line_item_id`），表名优先 `order_item` |
| `product` | 商品 | 含 `id`＋`title`（或 `name`） |
| `product_category_join` | 商品↔类别桥表 | 含 `product_id`＋`category_id`（或 `product_category_id`） |
| `category` | 类别 | `product_category` 表 |
| `customer` | 购买者 | `customer` 表（列 `id`） |

**两种订单行布局都支持**（`fetch_purchases` 会自动判别）：

- **Medusa v2（两跳）**：`order` ← `order_item(order_id, item_id)` → `order_line_item(product_id)`。
  真实的 Medusa v2 库即此结构——订单行表**没有** `order_id`，靠 `order_item` 关联;
  若不排除干扰表,`product_review`（恰好含 `order_id`+`product_id`）会被误选。
- **单表（旧 / 演示）**：订单行表自身同时含 `order_id` 与 `product_id`（本仓库的模拟库即此结构）。

表名在 SQL 中一律经 `quote_table()` 引号化,因此 PostgreSQL 保留字 `order` 也能安全使用;
`status` 若是 PostgreSQL enum,会先 `CAST(... AS TEXT)` 再比较,避免 enum 转换报错。
`DB_ROLE_OVERRIDE`（JSON）可强制指定映射,用于自省结果不合预期时;先跑 `--inspect` 核对。

## 4. 交互定义

仅使用**平台自身数据**构建隐反馈：`购买为正向信号`（订单/订单行,排除取消单;兼容 Medusa v2 两跳结构）。
若后端后续接入浏览/点击，可在 `RECURRING_TABLE` 配置后作为较低权重的正反馈参与训练
（`apply_views` 已预留接口，默认未启用）。

- 订单单项权重：`1.0 × 数量`
- 浏览/点击（若启用）：`VIEW_WEIGHT`（默认 `0.5`）
- 同一 `(customer, product)` 重复出现时**权重累加**

## 5. 对外契约（对齐 S1）

单项结构（`RecommendationItem`）：

```json
{ "product_id": "prod_...", "title": "...", "handle": "...",
  "thumbnail": null, "score": 0.93, "reason": null }
```

导出的 `recommendations.json` 按场景组织：

```json
{
  "source": "als",
  "model_version": "reco-v1-20260824-1530",
  "generated_at": "2026-08-24T15:30:00Z",
  "by_user":    { "cus_xxx": [ { "product_id": "...", "score": 0.93, "...": "..." } ] },
  "by_product": { "prod_aaa": [ { "product_id": "...", "score": 0.71 } ] },
  "fallback":   [ { "product_id": "...", "score": 1.0 } ]
}
```

- `by_user`：登录客户的个性化推荐（协同过滤胜出模型）
- `by_product`：商品详情页「相似商品」（内容相似度）
- `fallback`：匿名 / 冷启动兜底（热门 + 内容）
- S1 以 `customer_id` / `product_id` 命中对应键，无命中时回退 `fallback`

## 6. 本地模拟数据库（无真实数据时）

```bash
python scripts/build_simulated_db.py [out.db] [n_users] [n_products] [seed]
# 默认：simulated_marketplace.db / 200 用户 / 60 商品 / seed=42
```

生成内容：表 `store`、`product`、`product_category`、`product_category_product`、
`customer`、`"order"`、`order_item`；商品按手工艺类别分布；用户有 1~3 个偏好类别、
少量随机探索；每用户 1~10 单、每单 1~3 件；少量复购；约 6% 取消单（验证过滤）。

仓库已附带生成好的 `simulated_marketplace.db`，组员开箱即用；也可随时重建。

## 7. 依赖与环境

| 用途 | 依赖 |
| --- | --- |
| 核心（SVD / ALS / 评估 / 导出） | `numpy` |
| SQLite 模拟库 | 标准库 `sqlite3`，**无需额外依赖** |
| 连接 PostgreSQL | `psycopg2-binary`（或 `psycopg[binary]`） |
| LightFM 对比模型 | `lightfm` + `scipy`（PyPI 无 Windows wheel，建议 conda-forge） |

缺依赖不会静默失败：`train.py` 会打印提示并跳过对应模型。

## 8. 测试与 CI

```bash
# 全部单元测试（标准库 unittest）
python -m unittest discover -s tests -t .

# CI 一键自检：单元测试 + 离线 pipeline 冒烟，返回退出码 0/1
python scripts/run_checks.py
```

覆盖：配置解析、角色定位（多种模拟 schema）、数据装载与列别名、清洗与切分、
内容相似度、SVD/ALS/LightFM 统一接口、评估指标、导出契约、SQLite 模拟库端到端、
离线端到端。`scripts/run_checks.py` 供 S5 直接接入 CI/CD。

## 9. 详细文档

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — 分层架构、端到端数据流、
  模块 API、数据结构、算法细节、指标口径、扩展指南与 FAQ。
