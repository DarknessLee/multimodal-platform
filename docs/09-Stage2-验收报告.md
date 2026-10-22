# Stage 2 验收报告（一单制运单 / 箱管 / 单证存证 / EDI 适配器）

> 验收日期：2026-10-22
> 环境：Windows 11 / Node v24.22.0 / MySQL 8.0.46（本机）/ 本机 Edge
> 依据：`docs/07-Stage2-执行计划.md`、`docs/08-Stage2-接口契约.md`
> 结论：**Stage 2 通过**，可进入 Stage 3（调度中心 + 可视化大屏 + 异常预警 + IoT Mock）

---

## 1. 交付范围

| 模块 | 交付内容 |
|---|---|
| 数据基座 | 33 张表（Stage1 26 + 7 新表）；主运单单证/分段运单/事件链/箱动态/堆存/存证 |
| 一单制运单 | dispatch 事务内自动签发主运单 MASTER + 3 张分段运单 SEGMENT + 5 张单证 + ISSUE 事件 + 哈希链存证 + 箱关联 |
| 单证中心 | base64 上传（≤5MB）、SHA-256、POD 自动 Mock OCR、重跑 OCR、Mock CA 签章（CA_SIGN 报文 + SIGN 事件 + 存证）、下载 |
| 哈希链存证 | 本地哈希链（`hash=sha256(payloadHash|prevHash|blockHeight)`、创世 64 个 0、prevHash 连续），verify 校验 |
| 箱管中心 | 放箱 / 提箱 / 进场 / 装船 / 发运 / 到达 / 卸船 / 出场 / 还箱 / 维修；堆存 80 元/天；箱状态机与事件联动 |
| 95306 / 港口 EDI | 需求车提报 RAIL_DEMAND_APPLY + 受理回执 RAIL_DEMAND_ACCEPT；订舱 SEA_BOOKING + 确认 SEA_BOOKING_CONFIRM；CODECO/COARRI 自动报文 |
| 页面 | 运单中心、一单制详情（事件/箱/单证/存证校验）、单证中心、箱管中心、铁路/水路工作台；订单/跟踪页入口 |
| 兼容 | v0 34 项 + Stage 1 53 项回归全部通过 |

---

## 2. 数据校验（`npm run setup` 冷启动）

```
users 9 | customers 12 | partners 24 | nodes 20 | routes 8 | price_rules 42 | contracts 8
quotes 12 | orders 20 | waybills 60（15 主单 + 45 分段单）| segments 45
documents 83（68 已签章、8 张 POD 已 OCR）| waybill_events 116 | notarize_records 312
container_movements 172 | depot_storage 4 | e_seals 3
integration_messages 67（95306/港口 EDI/CA/银行/税务 Mock）| audit_logs 48 | notifications 18
```

- 哈希链校验：**312 条记录 prev_hash 连续、hash 重算 0 异常**（创世 prevHash 64 个 0）
- 单证文件落盘 `api/storage/documents/`（gitignore），contentHash 与文件内容一致
- 每个主运单 3 张分段运单；已签收运单含 POD 回单与 OCR 结果

---

## 3. 自动化验收结果

| 验收项 | 命令 | 结果 |
|---|---|---|
| 构建 | `npm run build` | ✅ 后端 tsc + 前端 vue-tsc/vite build 零错误 |
| Stage 2 API | `npm run accept:stage2` | ✅ **33/33 断言** |
| Stage 1 API | `npm run accept` | ✅ **53/53 断言** |
| v0 回归 | `npm run accept:v0` | ✅ **34/34 断言** |
| Stage 2 UI | `npm run e2e:stage2` | ✅ **6 阶段 / 6 张截图 / 无 JS 异常** |
| Stage 1 UI | `npm run e2e` | ✅ **13 阶段 / 16 张截图** |

**accept:stage2 覆盖**：dispatch 自动签发（主单/3 分段单/5 单证/事件/存证）、运单中心列表与角色过滤、
一单制详情（事件/箱/单证/存证校验）、事件哈希字段、存证 verify（valid）、单证上传 + OCR（识别箱号/签收人/日期/数量）、
下载、重跑 OCR、Mock 签章（signHash 64 位 + 存证）、箱 release→pickup→gate_in→load→return + 堆存、
95306 apply/confirm、水路 book/confirm、港口/铁路报文可追溯、越权 40301、看板。

**e2e:stage2 覆盖**：一单制运单详情 + 哈希链校验弹窗、POD 上传→OCR→签章、箱动态登记、铁路 95306 提报/回执、
水路订舱/确认、集成中心报文详情。

---

## 4. 截图清单（`docs/screenshots/stage2/`）

| 文件 | 场景 |
|---|---|
| 01-一单制运单详情.png | 主运单 + 分段运单 + 交接事件链 + 箱 + 单证 + 哈希链校验弹窗 |
| 02-单证上传OCR签章.png | POD 上传、OCR 识别结果（箱号/签收人/数量）、Mock 签章与存证 |
| 03-箱管中心动态.png | 箱详情动态时间轴、堆存、放箱/提箱/还箱 |
| 04-铁路工作台95306.png | 需求车提报 / 受理回执 |
| 05-水路工作台订舱.png | 订舱 / 确认回执 |
| 06-集成中心报文.png | 95306 / 港口 EDI 报文列表与详情抽屉 |

Stage 1 的 16 张截图在 `docs/screenshots/stage1/`，v0 截图在 `docs/screenshots/`。

---

## 5. 已知简化（Stage 3+ 处理）

- 区块链为本地哈希链（非真实联盟链节点），CA 为 Mock 序列号。
- EDI 适配器为同步 Mock（复用集成中心失败重试），无真实网络/证书/重试队列。
- 箱 GPS 轨迹在 Stage 3 接入；Stage 2 仅记录节点动态。
- OCR 为规则识别（文件名/内容关键字），不接真实 OCR 服务。
- 自动签发单证为 5 张（主单 + 3 分段单 + 装箱单），单证与事件的“业务对象”分别落在主单/分段单上。
- 铁路/水路工作台以角色校验（RAIL_CARRIER/SEA_CARRIER/MTO/ADMIN）实现，未额外下发 menu:rail/menu:sea 给 MTO。

---

## 6. 复现命令

```powershell
npm run setup            # 冷启动：33 表 + Stage2 种子
npm run dev              # API:8080 + Web:5173
npm run build
npm run accept           # Stage 1（53）
npm run accept:stage2    # Stage 2（33）
npm run accept:v0        # v0 回归（34）
npm run e2e              # Stage 1 UI（13 阶段 / 16 截图）
npm run e2e:stage2       # Stage 2 UI（6 阶段 / 6 截图）
```
