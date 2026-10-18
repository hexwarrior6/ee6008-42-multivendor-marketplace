# Week 9 推荐组件集成与验收

首页和商品详情页已接入“猜你喜欢”组件，复用现有 ProductPreview、商品图片和地区价格。S1 的 `GET /store/recommendations` 已实现模型 JSON 读取以及规则降级，不再只是 `model_pending` 占位。前端兼容两种来源，不把规则推荐描述为个性化模型结果。

商品详情页只保留一个推荐入口：有推荐时展示“猜你喜欢”；空结果或接口失败时，改用原有按集合、标签查询的相关商品区块，不再次请求推荐接口。首页没有结果时直接隐藏推荐区块。

## 接口与展示

- 请求：`GET /store/recommendations?product_id=prod_xxx&customer_id=cus_xxx&limit=4`。
- 首页不传 `product_id`；登录客户的 `customer_id` 由服务端查询当前登录身份取得，匿名访问不传。
- 读取 `recommendations[].product_id`，保留接口排序，去除重复项和详情页当前商品。
- 再调用 Store 商品接口获取当前标题、图片、handle 和当前 region 的价格；模型中的旧标题、缩略图和分数不直接用于商品卡片。
- 不存在、不可访问或缺少 handle 的商品不展示。空结果或接口失败时，首页隐藏区块，详情页使用目录相关商品后备；主要页面不依赖推荐服务成功。
- 用 Suspense 骨架表示加载；单次远端请求设置 3 秒超时；个性化数据使用 `no-store`。
- 支持中文、英文，切换语言保留地区和商品 URL。默认四张卡片，手机两列、较宽屏幕三列或四列。

## 验证

在 `fyp-storefront` 中运行：

```powershell
pnpm test:recommendations
pnpm test:s2-localization
pnpm typecheck
```

推荐单测共 13 项，覆盖匿名请求、服务端客户身份、过期登录、排序和去重、地区价格查询、不可用商品、空数据、服务异常、limit 限制、双语组件渲染，以及仅在推荐不可用时展示目录后备且不重复请求。

### 真实后端只读检查

先启动后端，确认 `.env.local` 的后端地址与 publishable key 正确，再在前端目录运行：

```powershell
pnpm test:recommendations:http
```

脚本只发 GET 请求，检查首页/详情推荐、排除当前商品、去重、禁止共享缓存、当前 Store API 商品及地区价格，以及匿名请求不能指定他人身份。不创建账户、不提交订单、不训练模型，也不输出密钥。默认测试 `cn` 地区；可通过 `RECOMMENDATION_TEST_COUNTRY` 指定其他已配置地区。测试销售渠道需要至少两个已发布且在该地区有价格的商品。

输出中的 `source` 和 `strategy` 用于区分模型与规则结果。`source: rules` 代表降级链路通过，不能据此声称协同过滤或个性化模型已验收。

### 模型产物的启用边界

由 S1/S4 提供有效产物，并按后端说明配置 `RECOMMENDATIONS_FILE`。默认有效期为一天；未配置、过期或无可见结果时后端使用规则推荐。不要为测试而修改产物的生成时间，也不要把预览商品伪装成正式模型输出。

仓库内 `fyp-backend/data/recommendations.json` 的当前快照为 `content`，生成于 2026-10-11，`by_user` 为空。截至 2026-10-17，该文件已超过默认有效期。真实个性化、模型效果、Railway 部署和定期刷新仍需 S1/S4/S5 与全员共同验收，不是前端组件通过即可代替。

## 本地故障与空结果预览

此预览工具只用于 UI 测试，用现有商城商品生成样例推荐，不代表模型结果，不会写数据库。

先启动真实 Medusa 后端 `http://localhost:9000`，在一个前端目录终端运行：

```powershell
node scripts/preview-recommendations.js
```

在另一个前端目录终端启动页面；此设置只影响当前终端，不需要修改 `.env.local`：

```powershell
$env:MEDUSA_BACKEND_URL = "http://127.0.0.1:9101"
pnpm dev
```

打开 `/cn` 首页和任意已发布商品详情页，检查推荐区块、商品链接及语言切换。预览模式可在浏览器中切换后刷新页面；只在专门的测试前端使用，不能把预览代理当真实后端：

- 有商品：`http://127.0.0.1:9101/__preview/recommendations?mode=products`
- 空结果：`http://127.0.0.1:9101/__preview/recommendations?mode=empty`
- 服务异常：`http://127.0.0.1:9101/__preview/recommendations?mode=error`

退出预览：停止两个预览进程，执行 `Remove-Item Env:MEDUSA_BACKEND_URL -ErrorAction SilentlyContinue` 后重新启动普通前端。`9101` 代理仅监听本机且仅转发读取请求，不应部署到 Railway。若端口已占用，可通过 `RECOMMENDATION_PREVIEW_PORT` 指定空闲端口。

## 2026-10-17 本地验收

- 基于 `development` 的 `f58f98c`；最新远程无新增提交，本轮改动保留在本地功能分支。
- 前端 9 个现有专项回归脚本全部通过；推荐单测 13 项通过；独立 TypeScript 检查无错误；后端运行时的 Next.js 生产构建通过。项目配置在构建时跳过类型与 lint，因此类型检查单独执行，未将构建成功等同于 lint 验收。
- 真实 Medusa HTTP：匿名首页/详情各返回 4 个规则推荐，地区价格查询及身份隔离通过；当前 `fallback_reason: not_configured`，未修改真实 `.env` 或 `.env.local`。
- Chrome 页面：中文与英文首页/详情各在 1440px、390px 视口检查；图片加载、商品跳转、价格展示、当前商品排除、无重复推荐区块和无横向溢出通过。
- 仅使用本地只读代理模拟空数组及 HTTP 503，验证首页隐藏、详情目录后备、商品主要内容仍可访问；这些故障场景不代表真实模型服务已部署。
- 未进行真实登录用户的 `by_user` 模型命中验收；登录身份传递、过期会话的行为由单测覆盖。没有创建客户、订单或修改共享业务数据。

## 协作边界

S2 本次提供推荐数据读取和 UI。`by_user` / `by_product` 命中以及 `fallback` 回退由 S1 在后端处理；训练、评估和 JSON 导出由 S4 维护。S2 不负责声明模型已在真实平台数据上完成评估。
