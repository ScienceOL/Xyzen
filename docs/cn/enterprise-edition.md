# Xyzen 企业版（Enterprise Edition）架构

## 概述

Xyzen 采用 CE（Community Edition）/ EE（Enterprise Edition）双版本架构，将商业能力（计费、配额、订阅、Admin、RBAC）与开源核心分离。

- **CE 模式（默认）**：零配置一键启动，行为与 EE 架构引入前完全一致（计费、限额正常工作）
- **EE 模式**：设置环境变量即可启用，核心商业逻辑运行在远程 EE API 服务上（尚未开发）
- **前端动态感知**：前端通过 `GET /api/v1/system/edition` 接口获取当前版本，无需构建时注入

## 目录结构

```
service/app/
├── configs/
│   └── ee.py                          # EE 配置（Enabled / ApiUrl / LicenseKey）
├── api/v1/
│   └── system.py                      # GET /system/edition 端点
├── ee/
│   ├── __init__.py                    # edition() / is_ee() / ee_only()
│   ├── client.py                      # EE API HTTP 客户端（httpx）
│   ├── lifecycle.py                   # ChatLifecycle 协议 + Default/Noop 实现
│   └── features/
│       ├── billing.py                 # 计费 API 包装
│       ├── limits.py                  # 限额 API 包装
│       └── subscription.py            # 订阅 API 包装

web/src/
├── core/edition/
│   └── edition.ts                     # resolveEdition() + getEdition() + hasFeature()
├── hooks/ee/
│   ├── index.ts                       # 统一导出
│   ├── useBilling.ts                  # 计费数据（wallet/points），CE 返回 null
│   ├── useCheckIn.ts                  # 签到状态 + showDot，CE 返回 null
│   └── useSubscriptionInfo.ts         # 订阅 + 用量 + tier，CE 返回 null
├── components/gates/
│   ├── index.ts                       # 仅保留 AdminGate + hasFeature 重导出
│   └── AdminGate.tsx                  # 管理后台页面守卫
```

## 配置

### 后端环境变量

| 环境变量 | 类型 | 默认值 | 说明 |
|---------|------|-------|------|
| `XYZEN_EE_Enabled` | bool | `false` | 是否启用 EE 模式 |
| `XYZEN_EE_ApiUrl` | str | `""` | 远程 EE API 服务地址 |
| `XYZEN_EE_LicenseKey` | str | `""` | License Key（Bearer token） |

三个字段**必须同时配置**才会激活 EE 模式。

### 前端

前端**不需要任何构建时配置**。`resolveEdition()` 在 App 初始化时调用一次 `GET /api/v1/system/edition`，之后 `hasFeature()` 为同步读取，稳定不变。

## 后端核心抽象

### 当前阶段

当前阶段，EE 架构已搭建基础设施（配置、客户端、lifecycle 协议），但**远程 EE API 尚未开发**。因此：

- `get_chat_lifecycle()` 工厂**始终返回 `DefaultChatLifecycle`**（包装现有本地计费/限额代码）
- `chat_event_handlers.py` 中的 settlement **无条件执行**（与 EE 架构引入前行为一致）
- `ee_only()` 和 `NoopChatLifecycle` 作为基础设施保留，待远程 EE API 就绪后启用

**零配置启动的行为与 EE 架构引入前完全一致。**

### EE 分支模式选择（未来）

当远程 EE API 就绪后，业务代码**不应直接使用** `if is_ee()` — 根据场景选择以下两种模式：

| 场景 | 模式 | 示例 |
|------|------|------|
| 复杂 CE/EE 行为分叉 | **Strategy**（`ChatLifecycle`） | `chat.py` 的 connect / limit / pre_deduct / disconnect |
| 简单的"EE 才执行" | **`ee_only(fn, *args)`** | 未来远程 EE API 调用场景 |

### ChatLifecycle — Strategy 模式

WebSocket 聊天处理器通过 `ChatLifecycle` 协议解耦计费/限额逻辑：

```python
# ee/lifecycle.py
class ChatLifecycle(Protocol):
    async def on_connect(self, connection_id: str) -> None: ...
    async def check_before_message(self, connection_id: str) -> dict | None: ...
    async def pre_deduct(self, db, user_id, auth_provider, amount, ...) -> float: ...
    async def on_disconnect(self, connection_id: str) -> None: ...

class DefaultChatLifecycle:  # 默认：包装 LimitsEnforcer + create_consume_for_chat
class NoopChatLifecycle:     # 预留：全部 no-op，pre_deduct 返回 0.0（未来 CE 自托管场景）
```

调用方（`chat.py`）不直接依赖 `LimitsEnforcer` 或 `create_consume_for_chat`：

```python
lifecycle = get_chat_lifecycle(user, db)  # 当前始终返回 DefaultChatLifecycle
await lifecycle.on_connect(connection_id)
```

未来远程 EE API 就绪后，工厂将根据 `is_ee()` 返回不同实现（如 `RemoteEEChatLifecycle`）。

### ee_only() — 异步守卫（预留）

用于"EE 模式执行，CE 模式跳过"的简单场景（当前未使用，作为基础设施预留）：

```python
from app.ee import ee_only

# CE 模式：不创建协程，直接返回 None；EE 模式：正常 await
await ee_only(some_ee_api_call, arg1, arg2)
```

接收 **callable**（不是 coroutine），CE 模式不会创建协程对象，避免 "coroutine was never awaited" 警告。调用方的 `try/except` 正常工作——CE 模式返回 `None`，不抛异常。

### EE API 客户端

`ee_request()` 是统一的 HTTP 客户端，任何异常返回 `None`，调用方自行 fallback：

```python
result = await ee_request("POST", "/v1/billing/pre-deduct", json={...})
if result is None:
    # fallback to CE behavior
```

## 前端核心抽象

### Edition 解析

```
App 初始化
  → resolveEdition(backendUrl)          # 请求 GET /api/v1/system/edition，写入模块级单例
  → hasFeature(key)                     # 同步读取，稳定不变
```

`resolveEdition()` 在 `App.tsx` 的 `useEffect` 中调用一次。之后 `hasFeature()` 和 `getEdition()` 均为同步读取模块级常量，无 React 状态，无 re-render。请求失败时 fallback 到 CE。

### Feature Flags

```typescript
import { hasFeature } from "@/core/edition/edition";

// 4 个 feature flag：
hasFeature("billing")       // 积分、钱包、消费
hasFeature("admin")         // 管理后台
hasFeature("checkIn")       // 每日签到
hasFeature("subscription")  // 订阅 / 会员等级
```

### 设计原则：Feature-Aware Hooks + 自守卫组件

前端 EE 功能遵循两层模式：

| 场景 | 方式 | 示例 |
|------|------|------|
| **需要数据 + UI** | Feature-aware hook | `useBilling()` 内部包含 `hasFeature` + query，CE 返回 `null` |
| **纯 UI 显示/隐藏** | `hasFeature()` 直接判断 | `{hasFeature("billing") && <SomeButton />}` |

即使数据不来自 `useQuery`（如来自 Store 或 Service 层），也应遵循同样的分层：**核心逻辑写在 Core 层，hook 调用 Core 层并在 hook 内部进行 `hasFeature` 判定**。不要在组件中直接混合 EE 判断和业务逻辑。

**关键约束**：不使用 Gate 包装组件（`<BillingGate>`/`<CheckInGate>` 等已删除）。原因：

- Gate 只守卫渲染，不守卫 query — 导致 CE 模式发无效请求
- Gate 散落在各消费方，`hasFeature` 守卫重复且不一致
- 数据 + UI 应内聚在同一层，而非拆分为外部 Gate + 内部 query

唯一保留的 Gate 是 `AdminGate`，用于守卫管理后台页面（纯 UI，无关联 query）。

### Feature-Aware Hooks（`hooks/ee/`）

每个 EE 功能封装为一个 hook，**内部统一处理** `hasFeature()` + auth + query：

```typescript
// hooks/ee/useBilling.ts
function useBilling() {
  const auth = useAuth();
  const enabled = (auth.isAuthenticated || !!auth.token) && hasFeature("billing");
  const wallet = useUserWallet(auth.token, enabled);
  if (!enabled) return null;               // CE → null，不发请求
  return { wallet, points: wallet.data?.virtual_balance ?? null };
}

// hooks/ee/useCheckIn.ts
function useCheckIn() {
  const auth = useAuth();
  const enabled = (auth.isAuthenticated || !!auth.token) && hasFeature("checkIn");
  const query = useQuery({ queryKey: ["check-in", "status"], ..., enabled });
  const showDot = enabled && query.data?.checked_in_today === false;
  if (!enabled) return null;
  return { query, showDot };
}

// hooks/ee/useSubscriptionInfo.ts
function useSubscriptionInfo() {
  const auth = useAuth();
  const enabled = (auth.isAuthenticated || !!auth.token) && hasFeature("subscription");
  const subQuery = useSubscription(auth.token, enabled);
  const usageQuery = useSubscriptionUsage(auth.token, enabled);
  if (!enabled) return null;
  return { subQuery, usageQuery, roleName, maxTier, userPlan };
}
```

### 组件集成模式

```typescript
// 数据 + UI：使用 EE hook，null 则不渲染
function CheckInSection() {
  const checkIn = useCheckIn();       // CE → null
  if (!checkIn) return null;          // 自守卫，无需外部 Gate
  return (
    <button onClick={() => setShowModal(true)}>
      {checkIn.showDot && <RedDot />}
      签到
    </button>
  );
}

// 纯 UI：直接用 hasFeature()
function SomeComponent() {
  return (
    <>
      {hasFeature("billing") && <BuyCreditsButton />}
    </>
  );
}
```

## 开发指南：添加新 EE 功能

### 后端

1. **远程 API 包装**：在 `service/app/ee/features/` 下创建模块，通过 `ee_request()` 调用远程 EE API
2. **选择分支模式**：
   - 行为分叉复杂 → 扩展 `ChatLifecycle` 协议或新建 Strategy
   - 简单的"EE 才执行" → 使用 `await ee_only(fn, *args)`

### 前端

1. 在 `core/edition/edition.ts` 的 `EditionFeatures` 中添加新字段
2. **需要数据**：在 `hooks/ee/` 下创建 feature-aware hook，内部包含 `hasFeature()` + query，CE 返回 `null`
3. **纯 UI**：组件中直接用 `hasFeature("xxx")` 条件渲染
4. **不要**创建新的 Gate 组件

## 部署

### 社区版（CE）

无需任何额外配置：

```bash
just dev
```

启动日志：`Edition: CE`

### 企业版（EE）

```env
XYZEN_EE_Enabled=true
XYZEN_EE_ApiUrl=https://ee-api.example.com
XYZEN_EE_LicenseKey=your-license-key
```

启动日志：
```
Edition: EE
EE API: https://ee-api.example.com
```

前端会自动从 `/api/v1/system/edition` 读取到 `ee`，启用对应 UI。

## FAQ

**Q: CE 模式下发消息会扣费吗？**
A: 会。当前阶段 `get_chat_lifecycle()` 始终返回 `DefaultChatLifecycle`，它包装了现有的 `LimitsEnforcer` 和 `create_consume_for_chat`，行为与 EE 架构引入前完全一致。Celery worker 中的 settlement 也无条件执行。

**Q: 前端如何知道当前是什么版本？**
A: `resolveEdition()` 在 App 初始化时请求 `GET /api/v1/system/edition`，将结果写入模块级单例。之后 `hasFeature()` 和 `getEdition()` 为同步读取，无 React 状态。请求失败时 fallback 到 CE。

**Q: 前端 CE 模式下积分/签到/订阅 UI 会显示吗？**
A: 不会。Feature-aware hooks（`useBilling()`、`useCheckIn()`、`useSubscriptionInfo()`）内部检查 `hasFeature()`，CE 模式下返回 `null` 且不发任何 API 请求。组件判断 `null` 后不渲染。

**Q: EE API 不可达会怎样？**
A: 后端 `ee_request()` 设置 10 秒超时，异常返回 `None`，调用方 fallback 到 CE 行为。前端 edition 接口仅依赖本地 `is_ee()` 判断，不依赖远程 EE API。

**Q: 如何验证 CE 模式？**
A: 不设任何 `XYZEN_EE_*` 环境变量启动服务，确认日志 `Edition: CE`，前端无积分/签到/订阅 UI，WebSocket 聊天和计费正常工作（与 EE 架构引入前行为一致）。

**Q: DefaultChatLifecycle 和 NoopChatLifecycle 分别什么时候用？**
A: 当前阶段始终使用 `DefaultChatLifecycle`（包装现有本地计费/限额代码）。`NoopChatLifecycle` 预留给未来自托管 CE 场景（显式禁用计费）。待远程 EE API 就绪后，工厂将根据 `is_ee()` 选择实现。

**Q: 升级到 EE 架构后需要改配置吗？**
A: 不需要。零配置启动行为与 EE 架构引入前完全一致。EE 基础设施已搭建但远程 API 尚未开发，所有 EE 相关代码路径暂不生效。
