# S4 推荐引擎 — 部署方案(Week 9:把模型部署为 REST API on Railway)

> 对应项目计划第 9 周的 ★ 里程碑:*"S4 deploys the trained recommendation model as a
> REST API service on Railway"*。
>
> 当前仓库已实现训练、导出和 REST API，支持以下两种集成路径。

---

## 1. 目标与边界

- **S4 提供**:一个只读的推荐结果来源。可以是导出的 JSON 文件,也可以是一个轻量 HTTP 服务。
- **S1 负责**:Medusa 后端的 `GET /store/recommendations` 端点消费该结果(契约见 §5)。
- **S2 负责**:前端「猜你喜欢 / 相似商品」组件调用 S1 的端点。
- **S4 不负责**:对外暴露面向浏览器的接口(仍由 S1 统一入口),也不写 Medusa 表。

推荐两条路径,**可先用 A 上线、再平滑升级到 B**:

| 路径 | 形态 | 优点 | 适用 |
| --- | --- | --- | --- |
| **A** | 训练产物 `artifacts/recommendations.json` | 零服务、零额外依赖 | Week 8–9 快速打通 |
| **B** | S4 自己的 REST API 服务 | 实时、可按请求返回 | Week 9 正式交付 |

---

## 2. 路径 A:导出 JSON(当前已可用)

1. 在 CI(或定时任务)里执行训练:

   ```bash
   export DATABASE_URL="postgresql://<railway-user>:<pass>@<railway-host>:<port>/<db>"
   python -m recommender.train --models svd,als,lightfm \
       --export artifacts/recommendations.json --k 8
   ```

2. 把 `artifacts/recommendations.json` 交给 S1 可读到的地方(提交到约定路径、对象存储、
   或在 S1 启动/定时任务中直接调用 S4 的 CLI)。

3. S1 在 `GET /store/recommendations` 里按 `customer_id` / `product_id` 命中
   `by_user` / `by_product`,缺省回退 `fallback`。

**刷新策略**:每次数据更新后重跑训练即可(训练在该数据规模下是秒级的)。

---

## 3. 路径 B:REST API 服务(Week 9 ★)

### 3.1 服务形态（已实现：`src/recommender/api.py`）

`recommendation-engine/src/recommender/api.py` 已实现基于 **FastAPI + uvicorn** 的只读服务:

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查,返回 `{"status":"ok","source":...,"model_version":...,"generated_at":...}` |
| `GET` | `/recommendations?customer_id=&product_id=&limit=8` | 返回 `RecommendationItem` 列表 |

返回体与 `GET /store/recommendations` 的契约保持一致(§5),这样 S1 只需做一次转发:
`strategy` 会标明命中 `by_user` / `by_product` / `fallback` 中的哪一路。

实现要点:

- **只读**:仅读取训练产物 `artifacts/recommendations.json`(可用 `RECOMMENDATIONS_PATH` 覆盖),绝不写库。
- **优雅降级**:产物缺失或 JSON 损坏时返回空列表 + `source="unavailable"`,服务不崩溃。
- **契约卫生**:自动剔除当前 seed 商品、去重、把导出中的 `"None"` 缩略图规范化为 `null`。
- **校验**:`limit` 限制 1–24,`customer_id`/`product_id` 需匹配 `^[a-zA-Z0-9_-]{1,128}$`。
- **调用鉴权**:`/recommendations` 必须携带 `X-API-Key` 请求头，与服务端
  `RECOMMENDATIONS_API_KEY` 匹配。缺失或错误返回 401；服务端未配置或仅配置空白时返回 503。
  `/health` 保持公开。推荐响应使用 `Cache-Control: private, no-store`。

### 3.2 本地启动

```bash
cd recommendation-engine
pip install -e ".[api]"            # fastapi + uvicorn
# 在当前终端设置本地测试密钥，调用方使用同一个值。
export RECOMMENDATIONS_API_KEY='local-test-only'
python -m recommender.api          # 或: uvicorn recommender.api:app --port 8000
```

> 若要“实时”推荐(而不是预计算 JSON),可在启动时用 `database.Driver` 读取交互、
> 训练一次模型并在内存里持有因子矩阵,再按 `customer_id` 计算 Top-N。数据量小时完全可行。

### 3.3 依赖

```bash
pip install fastapi "uvicorn[standard]"     # 或 flask gunicorn
```

建议加入 `requirements.txt` 的“可选:API 服务”分组(与 `postgres` / `lightfm` 平行)。

### 3.4 本地自测

```bash
uvicorn recommender.api:app --port 8000
curl "http://127.0.0.1:8000/health"
curl -H "X-API-Key: $RECOMMENDATIONS_API_KEY" \
  "http://127.0.0.1:8000/recommendations?customer_id=cus_00001&limit=5"
```

### 3.5 部署到 Railway（已提供 Dockerfile）

仓库已随附 `recommendation-engine/Dockerfile` 与 `recommendation-engine/scripts/start_api.sh`:

```bash
# 本地验证镜像
docker build -t recommendation-api recommendation-engine
docker run -p 8000:8000 -e DATABASE_URL -e RECOMMENDATIONS_API_KEY recommendation-api
curl "http://127.0.0.1:8000/health"
```

启动脚本的行为:

- 若 `artifacts/recommendations.json` 不存在且配置了 `DATABASE_URL` → **先训练一次再启动**;
- 否则直接启动,接口返回空结果(`source="unavailable"`),**不会崩溃**。

Railway 步骤:

1. Railway 新建一个 **Service**,根目录指向 `recommendation-engine/`(会自动识别 Dockerfile)。
2. 环境变量:配置 `DATABASE_URL`(与后端同一个 Postgres)、随机生成的
   `RECOMMENDATIONS_API_KEY` 与可选的 `RECOMMENDATIONS_PATH`; **不要**把 `.env` 或实际密钥提交进仓库。
3. Build:由 Dockerfile 完成(`pip install -e ".[api,postgres]"`)，包含首次启动训练所需的 PostgreSQL 驱动。
4. Start:`scripts/start_api.sh` → `uvicorn recommender.api:app --host 0.0.0.0 --port $PORT`(Railway 注入 `PORT`)。
5. 发布健康检查:把 Healthcheck Path 设为 `/health`。
6. 模型刷新:更新后重跑训练(CI 训练产物或 Railway Cron);服务会按产物 mtime 自动重新加载,无需重启。

建议在现有数据库所在项目环境中新建独立服务，连接 GitHub 的 `development` 分支，
Root Directory 设为 `/recommendation-engine`。Build/Start Command 无需覆盖，端口设为 8000。
为本地后端同学调用，在 Networking 中生成 HTTPS 公开域名；Railway 私网域名不能供本地电脑直接访问。

`/health` 返回 200 只代表进程存活；必须同时检查 `source` 不是 `unavailable`，
并带有效密钥请求 `/recommendations?limit=4`，确认训练产物可用。
未配置持久化卷时，新建容器会重新训练；当前启动脚本不负责周期刷新。
独立 Cron 服务的本地文件不会自动同步到 API 容器，后续如需周期更新，应另行设计共享产物交付。

### 3.6 S1 侧集成

- S1 在 Medusa 的 `GET /store/recommendations` 中调用 S4 服务(建议加 **超时 + 降级**:
  调用失败或超时即返回 `fallback`,保证店面不因推荐服务不可用而报错)。
- S1 的服务端请求必须携带 `X-API-Key`，密钥仅放后端环境变量，不发送到浏览器。
  本服务信任持有密钥的后端；客户身份校验、销售渠道/商品发布状态过滤仍由 Medusa 负责，不能直接转发未经验证的浏览器参数。
- 若增加缓存，应按客户与商品上下文隔离，个性化结果不得共享缓存。

---

## 4. 数据与模型刷新

| 项目 | 建议 |
| --- | --- |
| 训练频率 | 订单量小 → 每次部署训练一次;量大 → Railway Cron 每日/每小时 |
| 版本标记 | 导出 JSON 已带 `model_version` 与 `generated_at`,便于 S1 侧观测 |
| 选型 | 由 `--models` 自动按 `recall@K` 选优(当前模拟数据上 ALS 胜出) |

---

## 5. 接口契约(与 S1 对齐)

单项 `RecommendationItem`:

```json
{ "product_id": "prod_...", "title": "...", "handle": "...",
  "thumbnail": null, "score": 0.93, "reason": null }
```

`GET /store/recommendations` 返回:

```json
{ "recommendations": [ {"product_id": "...", "title": "...", "handle": "...",
                        "thumbnail": null, "score": 0.93, "reason": null} ],
  "count": 8, "limit": 8,
  "source": "als", "model_version": "reco-v1-20260824-1530",
  "context": { "customer_id": "cus_00001" } }
```

来源优先级:`by_user[customer_id]` → `by_product[product_id]` → `fallback`。

---

## 6. 上线检查清单

- [ ] `DATABASE_URL` 已在 Railway 配置(Railway 环境变量,而非提交 `.env`)
- [ ] `RECOMMENDATIONS_API_KEY` 已配置；无密钥调用返回 401，正确密钥可读取推荐
- [ ] `python -m recommender.train --inspect` 在真实库上角色定位正确
- [ ] 训练产出 `artifacts/recommendations.json` 且 `by_user` / `by_product` / `fallback` 非空
- [ ] 服务 `/health` 正常、`/recommendations` 返回契约字段
- [ ] S1 侧带超时与降级;S2 组件已接入
- [ ] S5 把训练 + 服务纳入 CI/CD(`scripts/run_checks.py` 已可作门禁)
