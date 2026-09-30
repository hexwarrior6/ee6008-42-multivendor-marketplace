# S4 推荐引擎 — 部署方案(Week 9:把模型部署为 REST API on Railway)

> 对应项目计划第 9 周的 ★ 里程碑:*"S4 deploys the trained recommendation model as a
> REST API service on Railway"*。
>
> 本文只给**部署方案**(不含实现代码,按团队约定本轮不新增 API 代码)。当前仓库已具备
> 训练与导出能力,下面的两种集成路径都能直接落地。

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

### 3.1 服务形态

在 `s4-recommendation/` 内新增一个轻量服务(建议 `FastAPI + uvicorn`,或 `Flask`),
**只读**地暴露推荐结果:

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查,返回 `{"status":"ok","model_version":...}` |
| `GET` | `/recommendations?customer_id=&product_id=&limit=8` | 返回 `RecommendationItem` 列表 |

返回体与 `GET /store/recommendations` 的契约保持一致(§5),这样 S1 只需做一次转发。

### 3.2 实现骨架(示意,非本轮交付代码)

```python
# 思路：启动时载入 artifacts/recommendations.json（或按需训练），查询时按键命中。
from fastapi import FastAPI, Query
import json

app = FastAPI()
DATA = json.load(open("artifacts/recommendations.json", encoding="utf-8"))

@app.get("/health")
def health():
    return {"status": "ok", "model_version": DATA.get("model_version"),
            "source": DATA.get("source")}

@app.get("/recommendations")
def recommendations(customer_id: str | None = None,
                    product_id: str | None = None,
                    limit: int = Query(8, ge=1, le=24)):
    items = (DATA["by_user"].get(customer_id) if customer_id else None) \
        or (DATA["by_product"].get(product_id) if product_id else None) \
        or DATA["fallback"]
    return {"recommendations": items[:limit], "count": min(limit, len(items)),
            "source": DATA.get("source"), "model_version": DATA.get("model_version")}
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
curl "http://127.0.0.1:8000/recommendations?customer_id=cus_00001&limit=5"
```

### 3.5 部署到 Railway

1. Railway 新建一个 **Service**,根目录指向 `s4-recommendation/`。
2. 环境变量:在 Railway 面板配置 `DATABASE_URL`(与后端同一个 Postgres),**不要**把 `.env` 提交进仓库。
3. Build:`pip install -e .` 或 `pip install -r requirements.txt`。
4. Start:`uvicorn recommender.api:app --host 0.0.0.0 --port $PORT`。
   (Railway 注入 `PORT`;本方案里的服务端口要读它。)
5. 模型刷新:可在部署阶段先跑一次训练生成 `artifacts/`,或加一个 Railway Cron 定期重跑。

### 3.6 S1 侧集成

- S1 在 Medusa 的 `GET /store/recommendations` 中调用 S4 服务(建议加 **超时 + 降级**:
  调用失败或超时即返回 `fallback`,保证店面不因推荐服务不可用而报错)。
- 建议加一层短缓存(如 60 秒),避免每次浏览都打 S4。

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
- [ ] `python -m recommender.train --inspect` 在真实库上角色定位正确
- [ ] 训练产出 `artifacts/recommendations.json` 且 `by_user` / `by_product` / `fallback` 非空
- [ ] 服务 `/health` 正常、`/recommendations` 返回契约字段
- [ ] S1 侧带超时与降级;S2 组件已接入
- [ ] S5 把训练 + 服务纳入 CI/CD(`scripts/run_checks.py` 已可作门禁)
