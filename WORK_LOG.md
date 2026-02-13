# Xyzen 本地开发环境修复与配置工作日志

**日期**: 2026-02-12
**分支**: `feature/dev-setup`

## 1. 基础设施修复

### Casdoor 认证服务
*   **问题**: 启动报错 `panic: read /init_data.json: is a directory`。
*   **原因**: Docker 挂载时主机文件缺失，自动创建了同名目录。
*   **修复**:
    *   删除错误的 `infra/casdoor/init_data.json` 目录。
    *   从 `infra/casdoor/init_data.example.json` 复制生成正确的配置文件。
    *   删除并重建 `sciol-casdoor` 容器。
    *   **结果**: 服务正常启动，端口 `8000` (映射到 `sciol-infra-network-service-1`) 可用。

### 数据库与账号
*   **问题**: 默认账号 `admin` 密码错误，无法登录；用户积分不足。
*   **修复**:
    *   **账号**: 通过 SQL 强制重置 `admin` 密码为 `scienceol` (明文)。
        ```sql
        UPDATE "user" SET password = 'scienceol', "passwordType" = 'plain' WHERE name = 'admin';
        ```
    *   **积分**: 通过 SQL 为 `admin` (ID: `bbf2a176...`) 和当前登录用户 (ID: `f9c7a3ef...`) 充值积分至 `999999`。
    *   **缓存**: 清理 Redis 缓存 (`FLUSHALL`) 以确保数据同步。

## 2. 大模型 (LLM) 配置修复

### 环境变量 (`.env.dev`)
*   **问题**:
    *   配置混淆：同时启用了 Multi-provider (`XYZEN_LLM_providers`) 和 Legacy Single-provider (`XYZEN_LLM_provider`)。
    *   Provider 缺失：配置了 Google Vertex 参数但未在 `XYZEN_LLM_providers` 中启用。
    *   网络连接失败：本地环境无法直连 Google API。
*   **修复**:
    *   **精简配置**: 仅启用 `XYZEN_LLM_providers=google_vertex`。
    *   **添加代理**: 配置 Docker 容器代理以解决 `503 Service Unavailable`。
        ```properties
        HTTP_PROXY=http://host.docker.internal:7890
        HTTPS_PROXY=http://host.docker.internal:7890
        ```

### 后端代码 (`service/app/core/providers/factory.py`)
*   **问题**: Google Vertex 初始化报错 `Unexpected argument 'vertex_sa'`。
*   **原因**: `langchain-google-genai` 库版本更新，不再支持旧的参数传递方式。
*   **修复**:
    *   修改 `_create_google_vertex` 方法。
    *   移除 `ChatGoogleGenerativeAI` 构造函数中的 `vertex_sa` 和 `vertex_project` 参数。
    *   添加逻辑清理 `runtime_kwargs` 以防止参数泄露。
    *   **结果**: 成功修复 Celery Worker 报错，大模型调用恢复正常。

## 3. 开发环境配置

### Git 配置
*   **问题**: 远程仓库使用 HTTPS 协议，且未正确忽略敏感文件。
*   **修复**:
    *   修改远程仓库地址为 SSH (`git@github.com:ScienceOL/Xyzen.git`)。
    *   确认 `.gitignore` 已正确忽略 `.env.dev` 等敏感文件。
    *   创建并切换到 `feature/dev-setup` 分支进行开发。

---

## 下一步行动 (Next Steps)

1.  **文档更新**:
    *   拉取 `ScienceOL/docs` 仓库。
    *   将上述踩坑经验（特别是 Google Vertex 配置和代理设置）更新到 Xyzen 文档中。
2.  **代码合并**:
    *   测试无误后，提交 `feature/dev-setup` 分支并推送到远程仓库。
