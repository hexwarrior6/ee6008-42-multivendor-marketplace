# S4 推荐引擎 — 架构与实现说明

本文面向团队成员（含 S1 后端、S2 前端、S5 集成），说明推荐引擎的分层、数据流、
模块职责、算法与指标口径，以及扩展/排障方式。快速上手见上级目录的 `README.md`。

---

## 1. 定位与边界

- **角色**：S4 负责的 AI 推荐引擎，独立 Python 服务（不嵌入 Medusa 的 TS 运行时）。
- **输入**：平台自身的订单与商品元数据（`order` / `order_item` / `product` /
  `product_category` / `customer`），**不引入任何新数据采集**。
- **输出**：对齐后端 `RecommendationItem` 契约的 JSON，供 S1 的
  `GET /store/recommendations` 读取；S2 的「猜你喜欢 / 相似商品」组件消费该数据。
- **不做**：不改动 Medusa 表结构、不写数据库、不对外暴露 HTTP 服务（API 由 S1 提供）。

数据源两种形态，**同一套代码**：

| 形态 | 连接串 | 用途 |
| --- | --- | --- |
| PostgreSQL | `postgresql://...` | 云端 Railway / 本地真实库 |
| SQLite 单文件 | `sqlite:///<path>` | 本地 / CI 模拟，无需数据库服务 |

---

## 2. 分层架构

```
┌──────────────────────────── src/recommender/train.py（CLI 编排）────────────────────────────┐
│  argparse → _load → 预处理 → 逐模型训练+评估 → 选型 → 导出                                     │
└───┬───────────────┬────────────────┬──────────────────┬──────────────┬──────────────────────┘
    │               │                │                  │              │
    ▼               ▼                ▼                  ▼              ▼
 config.py      database.py     data_loader.py     models/*        evaluation.py / exporter.py
（配置）       （自省+角色定位）  （装载目录/交互）   （SVD/ALS/LFM）  （指标 / 契约导出）
                     │                │                  │              │
                     └────────────────┴──────────────────┴──────────────┘
                                      ▼
                              preprocessing.py
                          （清洗 + 隐反馈 + 切分 → CleanData）
                                      ▲
                                content_based.py
                            （内容相似度：冷启动 / 详情页回退）
```

依赖方向单向：`config` ← `database` ← `data_loader` ← `preprocessing` ← `{models, evaluation, exporter}` ← `train`。
`content_based` 仅依赖 `data_loader` 的 `CatalogItem`。

---

## 3. 端到端数据流

```
DATABASE_URL
   │  ① database.list_schema()         自省真实表/列
   │  ② database.resolve_roles()       角色 → 表 映射（可用 DB_ROLE_OVERRIDE 覆盖）
   ▼
data_loader.fetch_catalog()      → [CatalogItem]     商品目录（含类别，用于内容特征）
data_loader.fetch_purchases()    → [Interaction]     购买交互（排除取消单）
   │  ③ preprocessing.clean_interactions()
   ▼
CleanData(user_ids, item_ids, rows=[(u_idx, i_idx, weight)])
   │  ④ preprocessing.train_test_split()   留出法 → (train, ground, test)
   ▼
for model in {svd, als, lightfm}:                    ⑤ models/*.fit(train.rows)
   │  ⑥ evaluation.evaluate(model, ground, ...)      → precision@K / recall@K / hit@K / coverage
   ▼
选型（recall@K 最高）                                  ⑦
   │  ⑧ exporter.export_user / export_product_similar / export_fallback
   ▼
artifacts/recommendations.json  →  S1: GET /store/recommendations
```

---

## 4. 模块职责与关键 API

| 模块 | 职责 | 关键 API |
| --- | --- | --- |
| `config.py` | 读环境变量 / `.env` → `Config` | `get_config()`、`Config` |
| `database.py` | 数据源接入、表自省、角色定位、SQL 引用 | `Driver`、`list_schema()`、`resolve_roles()`、`quote_table()`、`is_sqlite()` |
| `data_loader.py` | 按角色装载目录与交互 | `fetch_catalog()`、`fetch_purchases()`、`apply_views()`、`CatalogItem`、`Interaction` |
| `preprocessing.py` | 清洗、隐反馈构建、切分 | `clean_interactions()`、`train_test_split()`、`CleanData` |
| `content_based.py` | 文本/类别相似度（冷启动/详情页） | `ContentRecommender.fit/similar_by_pid/top_n_all/recommend_by_seed` |
| `models/svd_model.py` | numpy 稠密 SVD 基线 | `SVDPredictor.fit/score_user/top_items` |
| `models/als_model.py` | 隐反馈置信加权 ALS | `ALSPredictor.fit/score_user/top_items` |
| `models/lightfm_model.py` | LightFM 封装（可选） | `available()`、`LightFMPredictor` |
| `evaluation.py` | 离线指标 | `evaluate()`、`MetricBundle`、`user_seen()` |
| `exporter.py` | 导出契约 JSON | `export_user()`、`export_product_similar()`、`export_fallback()`、`dump()` |
| `train.py` | CLI 编排 | `main(argv)`、`parse_models()` |

---

## 5. 统一模型接口（核心抽象）

三个模型实现同一组方法，因此 `train.py` / `evaluation.py` / `exporter.py` 可完全
无差别调用（鸭子类型）：

| 方法 | 签名 | 含义 |
| --- | --- | --- |
| `fit` | `(rows, n_users, n_items) -> self` | 用 `(u_idx, i_idx, weight)` 训练 |
| `score_user` | `(u: int) -> np.ndarray(n_items,)` | 给某用户对所有商品打分 |
| `top_items` | `(u, exclude: set, top_n: int) -> List[int]` | 取 Top-N 商品索引，可排除已购 |
| `name` | `() -> str` | 模型名（`svd`/`als`/`lightfm`） |

**新增模型只需实现这 4 个方法**，并在 `train.py::_instantiate` 注册即可（见 §13）。

---

## 6. 数据结构

| 类型 | 出处 | 字段 |
| --- | --- | --- |
| `CatalogItem` | `data_loader` | `product_id, title, handle, thumbnail, meta{categories}` |
| `Interaction` | `data_loader` | `customer_id, product_id, order_id, action, weight, meta` |
| `CleanData` | `preprocessing` | `user_ids[], item_ids[], rows[(u,i,w)]`、`n_users/n_items/non_zero` |
| `MetricBundle` | `evaluation` | `precision_at_k, recall_at_k, hit_rate, coverage, n_evaluated` |
| `SchemaInfo` | `database` | `tables{schema.table→cols}, role_map{role→table}` |
| `Config` | `config` | `database_url, role_override, recurring_table, view_weight, out_dir, factors, iters, k` |

---

## 7. 数据管道细节

### 7.1 表自省与角色定位

- PostgreSQL：`information_schema.columns`（排除 `pg_catalog`/`information_schema` 等）。
- SQLite：`sqlite_master` 取表名 + `PRAGMA table_info` 取列，键为 `main.<table>`。
- 定位：每个角色给出「必须列（同义词组）+ 表名偏好 + **排除名**」，打分取最高分表。
  `line` 角色会排除名字含 `category`/`review`/`cart`/`message`/`address` 的表，
  以免误选 `product_category_product`（桥表）或 `product_review`（评价表，恰好含
  `order_id`+`product_id`）。`DB_ROLE_OVERRIDE` 优先级最高。
- 角色共 7 个：`product` / `order` / `line` / `order_item_link` / `customer` /
  `product_category_join` / `category`。
- SQL 引用：所有表名经 `quote_table("schema.table") → "schema"."table"`，规避保留字。

### 7.2 装载

- `fetch_catalog`：读 product 表（列名支持 `title`/`name`、`handle`/`slug`、
  `thumbnail`/`image_url` 等别名），并 join 商品↔类别桥表把类别写入 `meta["categories"]`。
- `fetch_purchases`：**支持两种订单行布局**并自动判别：
  - Medusa v2 两跳：`order` ← `order_item(order_id, item_id)` → `order_line_item(product_id)`；
  - 单表：订单行表自身含 `order_id` + `product_id`（本仓库模拟库）。
  动态取 order 主键（不硬编码 `id`）；若 order 有 `status` 则排除 `canceled/cancelled`
  （`status` 为 PostgreSQL enum 时先 `CAST(... AS TEXT)` 再比较）；无 order 表时回退用
  line 上的 customer。

### 7.3 清洗与切分

- 丢弃：空 id、不在目录中的商品、非正 / 非有限权重。
- 聚合：同一 `(customer, product)` 权重累加（多次购买 = 更强的正反馈）。
- 索引：用户/商品分别映射为 `0..N-1`，供矩阵算法直接消费。
- 切分：留出法，每个活跃用户随机摘出最多 `holdout_per_user` 个购买作为评估集
  （购买数不足者不切分），返回 `(train, ground, test)`。

---

## 8. 模型算法

| 模型 | 类型 | 适用 | 关键参数 |
| --- | --- | --- | --- |
| SVD（`svd_model.py`） | 稠密矩阵分解（`numpy.linalg.svd`） | 基线 / 对照 | `n_factors`, `user_mean`, `alpha` |
| ALS（`als_model.py`） | 隐反馈置信加权 ALS（Hu et al. 2008） | **稀疏购买数据（推荐主力）** | `n_factors`, `alpha_conf=40`, `lambda_reg=1e-2`, `iters` |
| LightFM（`lightfm_model.py`） | 混合矩阵分解 | 有特征时的对比 | `no_components`, `loss="logistic"`, `iters` |
| Content（`content_based.py`） | TF-IDF + 归一化点积相似度 | 冷启动 / 详情页 | 无（纯标准库） |

- **ALS 置信度**：已观测对 `conf = 1 + alpha_conf × weight`，未观测对只由 `YᵀY` 默认项承载；
  交替求解 `X` / `Y` 的正规方程。
- **LightFM 守卫**：`MIN_NNZ=50 / MIN_USERS=5 / MIN_ITEMS=5`。数据量低于阈值时抛清晰异常
  （由 `train.py` 捕获并跳过）——因为其 native 求解器在极小数据上会**段错误**。
- **冷启动**：订单稀疏时（`non_zero < 8` 或无评估集）跳过协同指标，仅导出 content/热门兜底。

---

## 9. 评估指标口径

离线留出（leave-out）评估，逐用户计算后取宏平均：

| 指标 | 定义 |
| --- | --- |
| `precision@K` | 命中数 / 实际推荐条数（剔除已购后截断到 K） |
| `recall@K` | 命中数 / 该用户留出集大小 |
| `hit@K` | 至少命中一次的会话占比 |
| `coverage` | 被推荐到的去重商品数 / 全库商品数（多样性） |

评估时**剔除该用户训练集中已购商品**，与线上「不重复推荐已买」一致。选型默认取
`recall@K` 最高者。

---

## 10. 输出与 S1 对接

`exporter.py` 产出 `artifacts/recommendations.json`：

- `by_user[customer_id]` → 该客户 Top-N（协同过滤胜出模型）
- `by_product[product_id]` → 详情页相似商品（内容模型）
- `fallback` → 匿名 / 冷启动兜底（热门 + 内容）
- 元信息：`source`（胜出模型名）、`model_version`、`generated_at`

S1 在 `GET /store/recommendations` 中按 `customer_id` / `product_id` 命中对应键，
无命中时返回 `fallback`。单项字段与 `RecommendationItem` 完全一致。

---

## 11. 配置参考（环境变量）

| 变量 | 含义 | 默认 |
| --- | --- | --- |
| `DATABASE_URL` | Postgres / SQLite 连接串 | 无（必填其一） |
| `DB_ROLE_OVERRIDE` | 角色→表 强制映射（JSON） | 空（自动定位） |
| `RECURRING_TABLE` | 可选浏览/点击表 | 空（未启用） |
| `VIEW_WEIGHT` | 浏览相对订单的权重 | `0.5` |
| `OUT_DIR` | 导出目录 | `artifacts` |
| `FACTORS` / `ITERS` / `K` | 训练与评估参数 | `32` / `15` / `8` |

---

## 12. 测试策略

- `tests/`（标准库 `unittest`，无额外依赖）：
  - `test_config`：环境变量 / `.env` / JSON 解析与兜底
  - `test_database`：角色定位（多种模拟 schema、别名、缺列、override）
  - `test_data_loader`：列别名、目录装载、购买抽取、浏览权重合并
  - `test_preprocessing`：清洗规则、权重累加、切分确定性
  - `test_content_based`：分词、同类优先、排除、热门兜底
  - `test_models`：三者统一接口、排除已购、空数据报错、LightFM 守卫
  - `test_evaluation`：指标数值（用可控假模型精确断言）
  - `test_exporter`：契约字段、三块导出结构、JSON 读写
  - `test_simulated_db`：SQLite 自省→定位→装载→端到端训练
  - `test_train`：参数解析、离线端到端、异常路径
- `scripts/run_checks.py`：单元测试 + 离线冒烟，返回退出码（供 CI）。

---

## 13. 扩展指南

### 13.1 新增一个推荐模型

1. 在 `src/recommender/models/` 新增 `your_model.py`，实现 `fit / score_user / top_items / name`。
2. 在 `train.py::_instantiate` 的 `if name == ...` 分支注册。
3. 在 `train.py::MODELS` 元组中加入模型名，即可用 `--models your_model` 训练与评估。
4. 补一个 `tests/test_models.py` 用例，保证 4 个方法契约。

### 13.2 接入新的数据源形态

- 若是 SQL 系（MySQL 等）：在 `database.py::Driver` 增加分支，并实现对应的 `list_schema`。
- 若非 SQL（如导出文件）：可直接构造 `CatalogItem` / `Interaction`，跳过 `data_loader`。

### 13.3 切换到真实 Railway 数据

```bash
export DATABASE_URL="postgresql://<user>:<pass>@<host>:<port>/<db>"
python -m recommender.train --inspect          # 先核对表/列映射
python -m recommender.train --models svd,als,lightfm --export artifacts/recommendations.json
```
若映射不符，用 `--inspect` 输出的真实列名填 `DB_ROLE_OVERRIDE`。

---

## 14. 常见问题（FAQ）

**Q：`--inspect` 报“未配置 DATABASE_URL”？**
设置 `DATABASE_URL`，或先用 `python scripts/build_simulated_db.py` 生成模拟库。

**Q：定位不到 `line` 表 / 表选错？**
先 `--inspect` 看实际表列，用 `DB_ROLE_OVERRIDE` 指认，例如：
`DB_ROLE_OVERRIDE={"line":"public.order_item"}`。

**Q：`lightfm` 跑不起来？**
PyPI 无 Windows wheel。用 conda-forge 安装（`--solver=libmamba`）；未装时 `train.py`
会自动跳过该模型，不影响 svd/als。

**Q：warnings 里提示 “LightFM was compiled without OpenMP”？**
正常现象（单线程），不影响结果。

**Q：`simulated_marketplace.db` 从哪来？**
`python scripts/build_simulated_db.py` 生成，是给组员的单文件模拟数据（含 200 用户 /
60 商品 / 1160 订单）。真实库上线后换成 Railway 的 `DATABASE_URL` 即可。

**Q：为什么评估用户数是 194 而不是 200？**
留出法只对「购买数 > holdout」的用户评估；交互过少的用户不参与指标（仍会出现在
`by_user` 的推荐里）。
