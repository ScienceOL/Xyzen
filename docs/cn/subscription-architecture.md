# 订阅限额架构：DB 运行时真相源 + FGA Capability RBAC

## 概述

Xyzen 的订阅限额体系由三层协作完成：

1. **Plan Catalog（声明式种子）** — `plan_catalog.py` 中的 `PlanLimitsDefinition` 定义每个计划的资源限额，服务启动时 upsert 同步到 DB
2. **DB SubscriptionRole（运行时真相源）** — 所有业务代码只读 DB 中的 `SubscriptionRole` 行，不直接引用 catalog 常量
3. **OpenFGA Capability RBAC（布尔门控）** — FGA 做「能不能」的二值判断（capability gate），DB 做「还剩多少」的数量配额检查

三者通过 `LimitsEnforcer` 统一集成：每次限额检查先走 FGA boolean gate，再走 DB numeric quota。FGA 可选 — 不可用时自动降级为纯 DB 检查。

```
                  启动同步                        运行时检查
┌──────────────┐ upsert ┌───────────┐        ┌────────────────┐
│ plan_catalog │───────→│ DB Role   │←───────│ LimitsEnforcer │
│ (seed)       │        │ (truth)   │  读取  │                │
└──────────────┘        └───────────┘        │  1. FGA gate   │
                                             │  2. DB quota   │
┌──────────────┐ tuples ┌───────────┐        │                │
│ capabilities │───────→│ OpenFGA   │←───────│                │
│ (seed)       │        │ (authz)   │  check │                │
└──────────────┘        └───────────┘        └────────────────┘
```

## 目录结构

```
service/app/
├── core/
│   ├── plan_catalog.py              # PlanLimitsDefinition + _PLAN_LIMITS 种子定义
│   ├── subscription.py              # SubscriptionService（业务逻辑 + FGA sync hook）
│   ├── subscription_bootstrap.py    # 启动时 catalog → DB upsert 同步
│   ├── limits.py                    # LimitsEnforcer（FGA gate + DB quota 统一入口）
│   └── fga/
│       ├── bootstrap.py             # FGA authorization model（含 plan + capability 类型）
│       ├── client.py                # FgaClient（含 check_capability / write_tuple_raw）
│       ├── capabilities.py          # Capability 常量 + PLAN_CAPABILITIES 映射表
│       ├── subscription_tuples.py   # 启动时写入 plan→capability 静态关联 tuple
│       ├── subscription_sync.py     # 订阅变更时同步 user→plan subscriber tuple
│       └── migrate_subscriptions.py # 一次性迁移脚本（backfill 已有订阅到 FGA）
├── infra/
│   └── settler/
│       └── service.py               # Settler 部署编排（限额委托 LimitsEnforcer）
├── repos/
│   └── subscription.py              # SubscriptionRepository（含 upsert_role）
└── models/
    └── subscription.py              # SubscriptionRole / UserSubscription SQLModel
```

## 计划与限额定义

### PlanLimitsDefinition

`plan_catalog.py` 中定义了 `PlanLimitsDefinition` dataclass，包含每个计划的完整资源限额：

```python
@dataclass(frozen=True)
class PlanLimitsDefinition:
    display_name: str
    storage_limit_bytes: int
    max_file_count: int
    max_file_upload_bytes: int
    max_parallel_chats: int
    max_sandboxes: int
    max_scheduled_tasks: int
    max_terminals: int       # 终端连接数
    max_deployments: int     # Settler 部署数（同沙箱限制，不在前端展示）
    monthly_credits: int
    max_model_tier: str      # lite / standard / pro / ultra
    is_default: bool
    priority: int
```

### 四个计划的限额

所有资源限额遵循 **1 / 3 / 6 / 10** 的阶梯递进：

| 计划 | 存储 | 文件数 | 并行聊天 | 沙箱 | 定时任务 | 终端 | 部署 | 月积分 | 模型层级 |
|------|------|--------|----------|------|----------|------|------|--------|----------|
| free | 100 MB | 200 | 1 | 1 | 1 | 1 | 1 | 0 | lite |
| standard | 1 GB | 1,000 | 3 | 3 | 3 | 3 | 3 | 5,000 | standard |
| professional | 10 GB | 5,000 | 6 | 6 | 6 | 6 | 6 | 22,000 | pro |
| ultra | 100 GB | 50,000 | 10 | 10 | 10 | 10 | 10 | 60,000 | ultra |

**设计要点**：
- 所有资源类型（并行聊天、沙箱、定时任务、终端、部署）对所有计划统一开放，**包括免费版**。区分计划的是数量上限和模型层级。
- 部署（deployment）限额数值与沙箱一致，但**不在前端 API 响应中暴露**（`PlanLimitsResponse` 不包含 `max_deployments`）。
- 限额**不分区域** — Global 和 zh-cn 共享同一套 `_PLAN_LIMITS`。区域差异只体现在定价（`PlanCatalogEntry.pricing`）。

### 启动同步

`subscription_bootstrap.py` 中的 `ensure_subscription_roles()` 在服务启动时执行：

```python
async def ensure_subscription_roles() -> None:
    async with AsyncSessionLocal() as db:
        repo = SubscriptionRepository(db)
        for plan_key, limits in get_plan_limits().items():
            await repo.upsert_role(name=plan_key, **asdict(limits))
        await db.commit()
```

注册在 `main.py` 的 lifespan 中，使用 `run_once` Redis 分布式锁保证多 Pod 只执行一次：

```python
await run_once("startup:subscription_roles", ensure_subscription_roles)
```

`upsert_role()` 按 `name` 查找：存在则逐字段比对更新，不存在则创建。修改 `_PLAN_LIMITS` 中的数值后，下次服务重启自动同步到 DB，无需手动 migration。

## FGA Capability RBAC

### 授权模型

在 OpenFGA 中新增两个类型定义：

```
type plan
  relations
    define subscriber: [user]

type capability
  relations
    define associated_plan: [plan]
    define granted: subscriber from associated_plan
```

**语义**：`user:alice` 对 `capability:sandbox_access` 拥有 `granted` 关系，当且仅当存在某个 `plan:P`，使得：
- `plan:P` 是 `capability:sandbox_access` 的 `associated_plan`
- `user:alice` 是 `plan:P` 的 `subscriber`

### Capability 常量

`capabilities.py` 定义了 7 个 capability ID，分为两类：

**功能准入（所有计划均具备）**：
```python
CAPABILITY_SANDBOX_ACCESS = "sandbox_access"
CAPABILITY_SCHEDULED_TASK_ACCESS = "scheduled_task_access"
CAPABILITY_TERMINAL_ACCESS = "terminal_access"
CAPABILITY_DEPLOYMENT_ACCESS = "deployment_access"
```

**模型层级（按计划递增）**：
```python
CAPABILITY_MODEL_TIER_STANDARD = "model_tier:standard"
CAPABILITY_MODEL_TIER_PRO = "model_tier:pro"
CAPABILITY_MODEL_TIER_ULTRA = "model_tier:ultra"
```

### Plan → Capability 映射

所有计划均具备沙箱、定时任务、终端、部署的功能准入。计划间的差异体现在模型层级的 capability：

| 计划 | 功能准入 | 模型层级 |
|------|----------|----------|
| free | sandbox, scheduled_task, terminal, deployment | _(无)_ |
| standard | sandbox, scheduled_task, terminal, deployment | model_tier:standard |
| professional | sandbox, scheduled_task, terminal, deployment | model_tier:standard, model_tier:pro |
| ultra | sandbox, scheduled_task, terminal, deployment | model_tier:standard, model_tier:pro, model_tier:ultra |

### Tuple 写入

**静态 tuple（启动时）**：`subscription_tuples.py` 中的 `ensure_capability_tuples()` 写入 plan→capability 关联（共 22 条）：

```
plan:free          → associated_plan → capability:sandbox_access
plan:free          → associated_plan → capability:scheduled_task_access
plan:free          → associated_plan → capability:terminal_access
plan:free          → associated_plan → capability:deployment_access
plan:standard      → associated_plan → capability:sandbox_access
plan:standard      → associated_plan → capability:model_tier:standard
...
plan:ultra         → associated_plan → capability:model_tier:ultra
```

**动态 tuple（用户订阅变更时）**：`subscription_sync.py` 写入 user→plan subscriber：

```
user:alice → subscriber → plan:standard
```

当用户升级（如 standard → professional）时，先删除旧 tuple，再写入新 tuple。

### FGA Check 流程

```
check(user:alice, granted, capability:sandbox_access)
  → 查找 capability:sandbox_access 的 associated_plan
  → 找到 plan:free, plan:standard, plan:professional, plan:ultra
  → 对每个 plan 检查 user:alice 是否是 subscriber
  → user:alice subscriber plan:standard ✓
  → 结果：allowed = true
```

## LimitsEnforcer 统一入口

### 创建

```python
enforcer = await LimitsEnforcer.create(db, user_id)
# 内部：
#   1. 从 DB 读取 UserLimits（via SubscriptionService）
#   2. 尝试获取 FGA client（失败则 fga=None）
```

### 检查模式

每个检查方法遵循相同的两阶段模式：

```
1. FGA capability check（boolean gate）
   - True  → 通过，继续 DB quota 检查
   - False → 直接拒绝（403）
   - None  → FGA 不可用，跳过，继续 DB 检查（graceful degradation）

2. DB numeric quota check（数量配额）
   - 读取 max_xxx 限额
   - 查询当前使用量
   - 使用量 >= 限额 → 拒绝（429）
```

### 支持的检查

| 方法 | FGA Capability | DB 字段 | 使用量来源 | 错误码 |
|------|---------------|---------|-----------|--------|
| `check_sandbox_creation()` | `sandbox_access` | `max_sandboxes` | Redis scan | 403 / 429 |
| `check_scheduled_task_creation()` | `scheduled_task_access` | `max_scheduled_tasks` | DB count | 403 / 429 |
| `check_terminal_connection()` | `terminal_access` | `max_terminals` | Redis scan | 403 / 429 |
| `check_deployment_creation()` | `deployment_access` | `max_deployments` | DB count | 403 / 429 |
| `check_model_tier(tier)` | `model_tier:{tier}` | `max_model_tier` | — | 返回 clamped tier |
| `check_and_start_responding()` | _(无 FGA gate)_ | `max_parallel_chats` | Redis atomic | ParallelChatLimitError |

**使用量查询方式**：
- **沙箱**：Redis scan `sandbox:session:*` → 关联 session → 匹配 user_id
- **终端**：Redis scan `terminal:session:*` → 解析 JSON → 筛选 `state=attached` 且匹配 user_id
- **定时任务 / 部署**：DB count（`status in ("active", "paused")` / `status in ("creating", "running")`）
- **并行聊天**：Redis SessionPool 原子操作（Lua script）

### 前端可见性

| 资源 | 前端 API（`PlanLimitsResponse`） | `get_usage_summary()` |
|------|------|------|
| 并行聊天 | `max_parallel_chats` | `chats.used / chats.limit` |
| 沙箱 | `max_sandboxes` | `sandboxes.used / sandboxes.limit` |
| 定时任务 | `max_scheduled_tasks` | `scheduled_tasks.used / scheduled_tasks.limit` |
| 终端 | `max_terminals` | `terminals.used / terminals.limit` |
| 部署 | **不暴露** | **不包含** |
| 存储 | `storage` | `storage.used_bytes / storage.limit_bytes` |
| 文件数 | `max_file_count` | `files.used / files.limit` |
| 月积分 | `monthly_credits` | — |
| 模型层级 | `max_model_tier` | — |

### Model Tier 检查

`check_model_tier()` 的行为与其他检查稍有不同 — 它不抛异常，而是返回 effective tier（可能被降级）：

```python
effective = await enforcer.check_model_tier(ModelTier.PRO)
# 如果用户计划允许 PRO → 返回 PRO
# 如果用户计划只到 STANDARD → 返回 STANDARD（clamped）
```

三个调用点统一委托给 `LimitsEnforcer`：

| 调用点 | 文件 | 场景 |
|--------|------|------|
| Session 更新 API | `api/v1/sessions.py` | 用户手动切换 model tier |
| Session 创建/访问 | `core/session/service.py` | 自动 clamp NULL 或超限 tier |
| Chat 消息处理 | `core/chat/langchain.py` | 发消息前实时 clamp |

### Settler 部署限额

`infra/settler/service.py` 中的部署限额检查已委托给 `LimitsEnforcer`：

```python
# settler/service.py — deploy()
async with get_task_db_session() as db:
    enforcer = await LimitsEnforcer.create(db, user_id)
    await enforcer.check_deployment_creation(db)
```

取代了之前硬编码的 `configs.Settler.MaxPerUser`，限额现在跟随用户订阅计划动态变化。

## 订阅变更 FGA 同步

### 自动触发

以下场景会自动写入/更新 FGA tuple：

| 场景 | 触发位置 | FGA 操作 |
|------|----------|----------|
| 新用户首次访问 | `SubscriptionService.get_user_role()` | `write_plan_subscription(user, "free")` |
| 管理员分配角色 | `SubscriptionService.assign_role()` | `update_plan_subscription(user, old, new)` |
| 支付成功回调 | _(调用 assign_role)_ | 同上 |

所有 FGA 写入均为 best-effort — 失败只记日志，不阻塞 DB 操作。

### 存量迁移

对于已有订阅数据，运行一次性迁移脚本：

```bash
# 在 service 容器内执行
python -m app.core.fga.migrate_subscriptions
```

遍历所有 `UserSubscription` 记录，为每个用户写入 `user:X subscriber plan:Y` tuple。

## Graceful Degradation

FGA 不可用时的降级行为：

| 组件 | 行为 |
|------|------|
| `LimitsEnforcer.create()` | FGA client 获取失败 → `fga=None` |
| `_check_capability()` | FGA 调用异常 → 返回 `None` |
| 所有 `check_*()` 方法 | `None` → 跳过 FGA gate，仅执行 DB quota 检查 |
| 启动 tuple 同步 | 异常 → 记警告日志，服务正常启动 |
| 订阅变更 sync | 异常 → 记警告日志，DB 操作正常完成 |

**关键设计**：FGA 永远不会阻塞核心业务流程。最坏情况下退化为纯 DB 限额检查（与引入 FGA 之前的行为一致）。

## 启动顺序

```
lifespan
  ├── create_db_and_tables()
  ├── initialize_memory_service()
  ├── run_once("startup:providers", ...)
  ├── run_once("startup:subscription_roles", ensure_subscription_roles)     ← DB 角色同步
  ├── run_once("startup:fga_capability_tuples", ensure_capability_tuples)   ← FGA tuple 同步
  ├── register_builtin_tools()
  ├── ensure_novu_setup()
  ├── run_once("startup:system_agents", ...)
  ├── run_once("startup:builtin_listings", ...)
  └── run_once("startup:builtin_skill_listings", ...)
```

`subscription_roles` 在 `fga_capability_tuples` 之前，确保 DB 角色先就位。FGA tuple 同步包裹在 try/except 中，FGA 不可用时只记日志。

## DB Migration

新增两列需要生成 Alembic migration：

```bash
just migrate "add max_terminals and max_deployments to subscription role"
just migrate-up
```

两列均有 `default` 值（`max_terminals=1`, `max_deployments=1`），不会影响已有数据。启动同步会在下一次 `ensure_subscription_roles()` 时将所有角色更新到 `_PLAN_LIMITS` 中定义的数值。

## 验证方法

| 验证项 | 方法 |
|--------|------|
| DB 角色同步 | `just db-query "SELECT name, max_sandboxes, max_terminals, max_deployments, max_model_tier FROM subscriptionrole"` → 4 行数据与 `_PLAN_LIMITS` 一致 |
| FGA 模型 | `curl http://localhost:8080/stores/{id}/authorization-models` → 包含 `plan` 和 `capability` 类型 |
| Capability tuples | FGA playground 查询 `capability:sandbox_access` 的 `associated_plan` → 返回 free / standard / professional / ultra |
| 新用户 tuple | 新用户首次访问 → FGA 写入 `user:X subscriber plan:free` |
| Sandbox 门控 | Free 用户创建第 2 个 sandbox → 429 "limit reached (1/1)"；Standard 用户 → 429 at 3/3 |
| Terminal 门控 | Free 用户连接第 2 个终端 → 429；Standard 用户 → 429 at 3/3 |
| Deployment 门控 | Free 用户创建第 2 个部署 → 429；与 sandbox 限额数值一致 |
| Model tier 门控 | Free 用户设 model_tier=pro → clamp 到 lite；Standard 用户 → clamp 到 standard |
| 降级兜底 | 停止 OpenFGA 服务 → 所有功能继续工作（FGA 返回 None，fall through 到 DB check） |

## 开发指南

### 添加新 Capability

1. 在 `capabilities.py` 中添加常量：`CAPABILITY_NEW_FEATURE = "new_feature"`
2. 在 `PLAN_CAPABILITIES` 映射表中，为允许该功能的计划添加 capability
3. 在 `LimitsEnforcer` 中添加 `check_new_feature()` 方法，遵循 FGA gate → DB quota 模式
4. 重启服务，`ensure_capability_tuples()` 自动写入新 tuple

### 添加新计划

1. 在 `_PLAN_LIMITS` 中添加新计划的 `PlanLimitsDefinition`
2. 在 `PLAN_CAPABILITIES` 中添加新计划的 capability 列表
3. 在 `plan_catalog.py` 的 `_GLOBAL_CATALOG` / `_CHINA_CATALOG` 中添加 pricing 和 features
4. 重启服务，`ensure_subscription_roles()` 自动同步新角色到 DB

### 添加新资源限额字段

1. 在 `PlanLimitsDefinition` 中添加字段
2. 在 `SubscriptionRoleBase` 和 `SubscriptionRoleCreate` 中添加对应 DB 列（设 `default` 值）
3. 在 `UserLimits` 中添加字段，更新 `get_user_limits()` 映射
4. 在 `LimitsEnforcer` 中添加检查方法
5. 如需前端展示，在 `PlanLimitsResponse` 和 `get_plan_catalog_response()` 中添加字段
6. 生成 Alembic migration：`just migrate "add xxx field"`

### 修改限额数值

直接修改 `_PLAN_LIMITS` 中的数值，重启服务即可。`upsert_role()` 会逐字段比对并更新 DB。

## FAQ

**Q: 为什么不直接在运行时读 `plan_catalog.py` 的限额，而要同步到 DB？**
A: 多 Pod 环境下，不同版本的代码可能有不同的 catalog 定义。DB 作为单一真相源，确保所有 Pod 读到一致的限额。同时 DB 支持运维人员通过管理面板临时调整限额（如给特定用户提升配额），不需要重新部署。

**Q: FGA 和 DB 的限额会不会冲突？**
A: 不会。FGA 做的是 boolean gate（能不能），DB 做的是 numeric quota（还剩多少）。两者是互补关系：FGA 先快速判断计划是否包含该功能，通过后 DB 再检查具体数量限额。

**Q: 所有计划都有沙箱 / 终端 / 部署准入，FGA gate 还有意义吗？**
A: 有。FGA 的意义不仅在于当前的 plan 划分。如果未来需要针对特定用户单独禁用某项功能（如账户违规后禁用部署），只需删除该用户的 plan subscriber tuple，所有 capability 立即失效，无需改 DB 或代码。FGA 提供了比 DB 更灵活的细粒度控制能力。

**Q: 用户升级计划后，FGA 权限何时生效？**
A: `assign_role()` 在 DB 操作成功后立即调用 `update_plan_subscription()`，先删除旧 plan tuple，再写入新 plan tuple。FGA check 在下一次请求时就能读到新的授权关系。

**Q: FGA 不可用时，限制还生效吗？**
A: 生效。FGA 不可用时 `_check_capability()` 返回 `None`，`LimitsEnforcer` 继续执行 DB quota 检查。DB 中 Free 角色的 `max_sandboxes=1`、`max_scheduled_tasks=1` 等硬限制始终生效。

**Q: 部署（deployment）限额为什么不在前端展示？**
A: Settler 部署是由 AI agent 在沙箱内自动触发的功能，用户不直接管理。前端不需要展示部署配额，限额检查在后端 tool 调用时透明执行。

**Q: 如何回退 FGA 授权模型变更？**
A: OpenFGA 的 authorization model 是追加式（每次 `write_authorization_model` 创建新版本）。`bootstrap.py` 在每次启动时写入最新模型，旧版本自动被新版本替代。如需回退，修改 `_TYPE_DEFINITIONS` 后重启即可。
