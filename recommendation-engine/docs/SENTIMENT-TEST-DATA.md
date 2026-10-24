# 情感分析测试数据说明（Week 10）

> 本文说明如何为 S4 情感分析层**临时造测试评论**、如何验证、如何清理。
> 面向组员：这是**人工测试工具**，不是生产数据，也不会被训练/API 流程自动调用。

## 1. 为什么需要这份文档

Week 10 的情感分析层需要真实或接近真实的 `product_review` 数据才能验证。
团队云端库里评论很少，直接等真实评论会阻塞验证。因此我们提供一个**显式、可识别、可回滚**的测试数据脚本。

## 2. 与协作规则（AGENTS.md）的关系

| AGENTS.md 约定 | 本脚本如何遵守 |
| --- | --- |
| **数据只读**：业务表只允许 SELECT | 生产代码（`sentiment.py` / `api.py` / `train.py`）仍然**只读**；只有本脚本显式写入，且不进入任何 pipeline |
| **双数据库兼容** | 复用 `database.Driver`，PostgreSQL / SQLite 都能用 |
| **核心依赖只有 numpy** | 仅用标准库 + 项目已有的可选驱动（psycopg2 / sqlite3），未新增依赖 |
| **不改变 schema** | 只 `INSERT` / `DELETE` 行，不建表、不改列；迁移仍走 `migrate` |
| **测试可复现** | 默认 `--dry-run`；插入行统一 `rev_s4test_` 前缀；`--cleanup` 精确删除 |

> 注意：`fyp-backend` 的「不手工改库」约束针对 schema 变更；本脚本只写**测试数据行**，且可一键清理。若团队认为连测试数据也不应进云端库，请改用 SQLite 测试库（见 §5）。

## 3. 脚本用法

脚本：`recommendation-engine/scripts/seed_sentiment_test_data.py`

```bash
cd recommendation-engine
export DATABASE_URL="postgresql://..."      # 或 sqlite:///...
export PYTHONPATH=src

# 1) 预览（默认，不写库）
python scripts/seed_sentiment_test_data.py --dry-run

# 2) 真正插入（云端库需额外 --yes 确认）
python scripts/seed_sentiment_test_data.py --apply --yes

# 3) 验证情感报告
python -m recommender.sentiment --export artifacts/sentiment.json

# 4) 清理（只删 rev_s4test_* 开头的行）
python scripts/seed_sentiment_test_data.py --cleanup --yes
```

### 参数

| 参数 | 说明 |
| --- | --- |
| `--dry-run` | 只打印将要插入的行（默认行为） |
| `--apply` | 实际插入 |
| `--cleanup` | 删除所有 `rev_s4test_*` 行 |
| `--yes` | 对**非 SQLite**（团队云端库）写入/删除的二次确认 |
| `--product-id ID` | 只挂到指定商品（默认取前 N 个商品） |
| `--limit N` | 插入多少条（默认 8） |

## 4. 测试数据内容

8 条中英文混合评论，覆盖正面 / 中性 / 负面：

| id | rating | 内容（摘要） | 预期情感 |
| --- | --- | --- | --- |
| `rev_s4test_001` | 5 | 质量很好，非常喜欢，值得推荐 | positive |
| `rev_s4test_002` | 4 | Very good quality, beautiful and worth the price | positive |
| `rev_s4test_003` | 5 | 手作很精致，卖家很用心，满意 | positive |
| `rev_s4test_004` | 1 | 收到就破损了，非常失望 | negative |
| `rev_s4test_005` | 2 | Terrible quality, arrived broken and late | negative |
| `rev_s4test_006` | 3 | 东西一般般，没有惊喜 | neutral |
| `rev_s4test_007` | 5 | Amazing craftsmanship, I love it | positive |
| `rev_s4test_008` | 1 | 很差，掉色严重，不推荐 | negative |

预期报告（大致）：

```
total: 8, positive: 4, neutral: 1, negative: 3
```

## 5. 推荐做法：优先用 SQLite 测试库

云端库是**团队共用**的，直接插评论会影响其他人的 dashboard 和数据统计。更安全的验证方式：

```bash
# 生成带 review/product 的临时 SQLite 库
OUT=$(python scripts/build_sentiment_demo.py | sed -n 's/^demo db : //p')
export DATABASE_URL="sqlite:///$OUT"

python scripts/seed_sentiment_test_data.py --apply
python -m recommender.sentiment --export /tmp/sentiment-test.json
python scripts/seed_sentiment_test_data.py --cleanup
```

SQLite 下不需要 `--yes`，且完全不影响团队数据。

## 6. 如果插入失败

最常见原因：`product_review` 表的 `order_id` / `order_line_item_id` 是 **NOT NULL**，
而脚本只填 `product_id` / `rating` / `content` / `status` / 时间戳。

脚本会打印：

```
[apply] insert failed: ...
[apply] This usually means product_review requires order_id / order_line_item_id to be NOT NULL.
```

处理方式（按推荐顺序）：

1. **改用 SQLite 测试库**（§5），不依赖云端外键；
2. 用 Store API 创建评论（`POST /store/product-reviews`，走正规业务流程）；
3. 让脚本带上真实 `order_id` / `order_line_item_id`（需要先有订单）。

## 7. 清理与验收

| 检查项 | 命令 |
| --- | --- |
| 确认测试行数量 | `--cleanup` 会先打印 `found N test rows` |
| 确认已清理 | 再次运行 `--cleanup`，应显示 `found 0 test rows` |
| 确认报告 | `python -m recommender.sentiment --export artifacts/sentiment.json` |

> `artifacts/` 已被 `.gitignore` 忽略，测试产物不会提交到仓库。

## 8. 一句话总结

**生产代码只读；测试数据用 `rev_s4test_` 前缀显式插入、`--cleanup` 精确删除；优先在 SQLite 测试库验证，云端库仅在必要时使用并需要 `--yes` 确认。**
