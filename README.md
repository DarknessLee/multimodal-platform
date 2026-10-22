# 多式联运演示版 v0

单 Web 端多角色演示系统：**货主 → MTO 调度 → 公路承运人 → 港站 → 结算**，
同一票订单在不同角色账号间流转：下单、人工调度、节点上报、mock 轨迹、签收、分段账单。

- 前端：Vue 3 + Vite + TypeScript + Element Plus + ECharts
- 后端：Node 24 + Express 5 + TypeScript + MySQL 8（7 张表 / 10 个接口）
- 外部系统（承运商、95306 铁路、港口 EDI、GPS）：全部 mock，集中在 `api/src/mock/`

## 目录结构

```
multimodal-platform/
├─ api/        # 后端代码（Node/Express/TS）
├─ web/        # 前端代码（Vue3/Vite/TS）
├─ docs/       # 实施方案、接口契约、演示脚本与验收
├─ scripts/    # setup / dev / accept / e2e 脚本
├─ README.md
└─ package.json
```

> 前后端代码分别只放在 `api/`、`web/` 两个子文件夹，根目录不放业务代码。

## 环境要求

- Node.js ≥ 20（已验证 v24.22.0）、npm
- MySQL 8 本机服务（已验证 8.0.46），已执行一次 `scripts/init-db.sql` 建库建号
- 无需 Docker / JDK / Maven

## 启动（2 条命令）

```powershell
npm run setup     # 首次：安装依赖 → 建表 → 写入 5 个账号 + 2 条历史订单（幂等，可重跑）
npm run dev       # 同时启动 API(8080) 与前端(5173)
```

打开 <http://127.0.0.1:5173>。停止用 `Ctrl+C`。

> 重置演示数据：`npm run db:init`（会清空并重建 7 张表）。

## 演示账号（密码均为 `demo123`）

| 账号 | 角色 | 能做什么 |
|---|---|---|
| `shipper01` | 货主 | 下单、看全程轨迹、签收、查看账单 |
| `mto01` | MTO 调度 | 查看新订单、人工分配公路段承运商 |
| `carrier01` | 公路承运人 | 接单、上报「已提货」「已送达」 |
| `terminal01` | 港站 | 确认进场、录入箱况、到港/到站确认 |
| `settlement01` | 结算 | 对已签收订单生成分段账单 |

## 演示脚本（同一票运单，角色间流转）

1. `shipper01` 登录 → 新建订单 → 提交（订单：**待调度**）
2. `mto01` 登录 → 订单详情 → 调度 → 选择公路承运商（订单：**已调度**）
3. `carrier01` 登录 → 我的运输任务 → 接单 → 已提货 → 已送达（订单：**运输中**）
4. `terminal01` 登录 → 港站作业 → 进场确认（可录箱况）→ 到港/到站（运单：**已到达**）
5. `shipper01` 登录 → 运单跟踪：ECharts 轨迹 + 时间轴 → 签收（订单：**已签收**）
6. `settlement01` 登录 → 结算工作台 → 生成账单（订单：**已出账**）
7. `shipper01` 登录 → 查看分段账单（公路 1280 + 海运 5200 + 铁路 8600 = **15080 元**）

## curl 自检

```powershell
# 1) 登录，复制返回的 token
curl.exe -s -X POST http://127.0.0.1:8080/api/auth/login -H "Content-Type: application/json" --data-raw "{\"username\":\"shipper01\",\"password\":\"demo123\"}"

# 2) 下单（替换 <TOKEN>）
curl.exe -s -X POST http://127.0.0.1:8080/api/orders -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" --data-raw "{\"cargoName\":\"汽车配件\",\"cargoWeight\":18.2,\"containerType\":\"40HQ\",\"containerCount\":1,\"origin\":\"上海嘉定\",\"destination\":\"成都青白江\",\"requiredPickupDate\":\"2026-10-25\"}"

# 3) 查轨迹（替换 <TOKEN>、<WAYBILL_ID>）
curl.exe -s http://127.0.0.1:8080/api/waybills/<WAYBILL_ID>/track -H "Authorization: Bearer <TOKEN>"
```

## 验收截图（docs/screenshots/）

| 截图 | 场景 |
|---|---|
| `01-货主下单-订单详情.png` | 货主下单成功，订单「待调度」，箱档案已生成 |
| `02-MTO-人工调度选承运商.png` | MTO 对比 3 家公路承运商报价并确认调度 |
| `03-MTO-调度后运单跟踪.png` | 调度后运单已生成，3 个分段待执行 |
| `04-承运人-待接单.png` | 公路承运人任务卡（待接单） |
| `05-承运人-运输任务完成.png` | 接单 → 已提货 → 已送达后的任务页 |
| `06-港站作业-完成.png` | 港站进场/到港/到站作业完成 |
| `07-货主-全程轨迹.png` | ECharts 全程 mock 轨迹（GPS/司机/港站/EDI 四类来源） |
| `08-货主-签收完成.png` | 货主签收，运单/订单 → 已签收 |
| `09-结算工作台-已出账.png` | 结算生成账单 |
| `10-分段账单.png` | 分段账单：饼图 + 明细（¥15080.00） |

## 自动化验收

```powershell
npm run build     # 后端 tsc --noEmit + 前端 vue-tsc/vite build
npm run accept    # API 全流程断言（需 npm run dev 已启动）
npm run e2e       # Playwright + 本机 Edge 无头点通全流程并截图（需 npm run dev 已启动）
```

验收产物：`docs/screenshots/` 下的关键页面截图；`npm run accept` 输出逐步断言结果。

## 接口（10 个，详见 docs/02-接口契约.md）

`POST /api/auth/login`、`POST/GET /api/orders`、`GET /api/orders/{id}`、
`POST /api/orders/{id}/dispatch`、`POST /api/segments/{id}/status`、
`GET /api/waybills/{id}/track`、`POST /api/waybills/{id}/sign`、
`POST /api/orders/{id}/settle`、`GET /api/bills/{id}`。

## 常见问题

- **启动报数据库连接失败**：确认 MySQL 服务已启动，且已执行 `scripts/init-db.sql`；
  账号密码在 `api/.env`（默认 `mto_demo / Mto_demo_2026`）。
- **端口被占用**：8080 / 5173 可分别改 `api/.env` 与 `web/vite.config.ts`。
- **页面 401**：登录已过期（12h），重新登录即可。
- **想恢复初始数据**：`npm run db:init`。
- **构建报 esbuild `remove ...\Temp\... Access is denied`**：Windows 沙箱/受限环境常见，
  将 `TEMP`、`TMP` 指向项目内 `.tmp` 目录后重试（该目录已在 `.gitignore`）。
- **修改 web 源码后 dev 服务崩溃（Vite watcher EBUSY）**：`web/vite.config.ts` 已忽略工具原子写临时目录；
  若仍出现，重启 `npm run dev` 即可。
- **e2e 报找不到 Edge**：Playwright 使用本机 Edge（channel=msedge），请确认已安装。

## 明确不做（原文非目标）

微服务、网关、中台、区块链、IoT 真设备、大数据、K8s、多端 APP、真实 95306/港口 EDI、
数据分层、MQ、ES、时序库、完整安全体系、真实地图、在线支付。后续规划仅记录：区块链存证、IoT 接入、真实 EDI、结算引擎、数据中台、微服务拆分。
