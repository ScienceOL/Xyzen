# 基于FastMCP构建多MCP服务器的技术架构说明

## 1. 什么是FastMCP？

**FastMCP** 是一个基于FastAPI的MCP（Model Context Protocol）框架，它简化了MCP服务器的创建和管理过程。

### 核心优势：
- **快速开发**：使用装饰器快速注册MCP工具
- **自动集成**：自动处理HTTP传输和生命周期管理
- **类型安全**：完整的Python类型提示支持
- **易于扩展**：模块化设计，易于添加新功能

## 2. 与手动实现MCP的对比

### 2.1 手动实现方式（main.py）
```python
# 需要手动创建会话管理器
lab_session_manager = StreamableHTTPSessionManager(
    app=lab_mcp._mcp_server,
    event_store=None,
    json_response=False,
    stateless=False,
)

# 需要手动实现ASGI处理器
async def handle_lab_asgi(scope: Scope, receive: Receive, send: Send) -> None:
    await lab_session_manager.handle_request(scope, receive, send)
```

### 2.2 FastMCP方式（multi_server.py）
```python
# 直接创建FastMCP实例
lab_mcp: FastMCP = FastMCP("Lab 🚀")

# 使用装饰器注册工具
@lab_mcp.tool
def multiply(a: float, b: float) -> float:
    return a * b

# 自动转换为HTTP应用
lab_mcp_app = lab_mcp.http_app(transport="streamable-http", path="/")
```

## 3. 技术架构详解

### 3.1 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                    FastAPI 主应用                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   根路径    │  │  健康检查   │  │ MCP状态检查 │         │
│  │     /       │  │   /health   │  │ /mcp/status │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    路由挂载层                                │
│  ┌─────────────┐                    ┌─────────────┐         │
│  │ /mcp/lab    │                    │ /mcp/other  │         │
│  │  挂载点     │                    │  挂载点     │         │
│  └─────────────┘                    └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  FastMCP 应用层                              │
│  ┌─────────────┐                    ┌─────────────┐         │
│  │ Lab MCP     │                    │ Other MCP   │         │
│  │ 应用实例    │                    │ 应用实例    │         │
│  │             │                    │             │         │
│  │ 工具:       │                    │ 工具:       │         │
│  │ - multiply  │                    │ - add       │         │
│  └─────────────┘                    └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 核心组件解析

#### 3.2.1 FastMCP服务器创建
```python
lab_mcp: FastMCP = FastMCP("Lab 🚀")
other_mcp: FastMCP = FastMCP("Other Tools 🛠️")
```

**作用**：
- 创建独立的MCP服务器实例
- 每个服务器可以包含不同的工具集
- 支持自定义服务器名称和描述

#### 3.2.2 工具注册机制
```python
@lab_mcp.tool
def multiply(a: float, b: float) -> float:
    """Multiplies two numbers."""
    return a * b
```

**特点**：
- **装饰器模式**：使用 `@mcp.tool` 装饰器注册工具
- **自动类型推断**：从函数签名自动推断参数类型
- **文档字符串**：自动生成工具描述
- **类型安全**：完整的类型提示支持

#### 3.2.3 HTTP应用转换
```python
lab_mcp_app: StarletteWithLifespan = lab_mcp.http_app(
    transport="streamable-http", 
    path="/"
)
```

**作用**：
- 将MCP服务器转换为HTTP应用
- 支持流式HTTP传输
- 自动处理MCP协议转换
- 包含生命周期管理

#### 3.2.4 应用挂载
```python
app.mount("/mcp/lab", lab_mcp_app)
app.mount("/mcp/other", other_mcp_app)
```

**优势**：
- **路径隔离**：不同MCP服务使用不同路径
- **独立管理**：每个MCP服务独立运行
- **易于扩展**：可以轻松添加新的MCP服务

#### 3.2.5 统一生命周期管理
```python
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    async with lab_mcp_app.lifespan(lab_mcp_app), other_mcp_app.lifespan(other_mcp_app):
        yield
```

**特点**：
- **统一启动**：同时启动所有MCP服务
- **统一关闭**：应用关闭时清理所有资源
- **错误处理**：确保资源正确释放

## 4. 关键技术特性

### 4.1 装饰器模式
```python
# 工具注册装饰器
@lab_mcp.tool
def my_tool(param: str) -> str:
    return f"Processed: {param}"

# 等价于手动注册
# lab_mcp.register_tool("my_tool", my_tool)
```

**优势**：
- 代码简洁
- 易于理解
- 自动处理注册逻辑

### 4.2 类型系统集成
```python
def multiply(a: float, b: float) -> float:
    return a * b
```

FastMCP自动：
- 推断参数类型
- 生成JSON Schema
- 提供类型验证
- 生成API文档

### 4.3 流式HTTP传输
```python
lab_mcp.http_app(transport="streamable-http", path="/")
```

**支持特性**：
- 流式响应
- 长连接
- 实时数据传输
- 更好的性能

## 5. 服务管理功能

### 5.1 健康检查
```python
@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "healthy", "service": "xyzen"}
```

**作用**：
- 监控服务状态
- 负载均衡检查
- 故障检测

### 5.2 MCP状态监控
```python
@app.get("/mcp/status")
async def mcp_status() -> dict[str, Any]:
    return {
        "lab_tools": "http://127.0.0.1:48200/mcp/lab/",
        "other_tools": "http://127.0.0.1:48200/mcp/other/",
        "available_tools": {"lab": ["multiply"], "other": ["add"]},
    }
```

**功能**：
- 显示服务地址
- 列出可用工具
- 服务发现支持

## 6. 服务器配置

### 6.1 优雅关闭配置
```python
config_kwargs: dict[str, Any] = {
    "timeout_graceful_shutdown": 0,  # 立即关闭
    "lifespan": "on",  # 启用生命周期管理
}
```

**作用**：
- 确保资源正确释放
- 避免数据丢失
- 支持热重启

### 6.2 AnyIO集成
```python
if __name__ == "__main__":
    anyio.run(server.serve)
```

**优势**：
- 跨平台异步支持
- 更好的错误处理
- 统一的异步接口

## 7. 扩展性设计

### 7.1 模块化工具注册
```python
# 可以按功能模块组织工具
@lab_mcp.tool
def scientific_calculation():
    pass

@other_mcp.tool
def utility_function():
    pass
```

### 7.2 动态工具发现
```python
# 可以动态注册工具
def register_dynamic_tool(mcp_server: FastMCP, tool_func):
    mcp_server.register_tool(tool_func.__name__, tool_func)
```

### 7.3 配置化部署
```python
# 可以通过配置文件管理MCP服务
MCP_SERVICES = {
    "lab": {"name": "Lab 🚀", "tools": ["multiply"]},
    "other": {"name": "Other Tools 🛠️", "tools": ["add"]},
}
```

## 8. 性能优化

### 8.1 应用挂载 vs 路由注册
```python
# 高性能：直接挂载应用
app.mount("/mcp/lab", lab_mcp_app)

# 较低性能：通过路由注册
# app.include_router(lab_mcp_app.router, prefix="/mcp/lab")
```

### 8.2 生命周期管理
- 统一启动和关闭
- 避免资源泄漏
- 支持热重启

### 8.3 异步处理
- 所有操作都是异步的
- 支持高并发
- 非阻塞I/O

## 9. 开发最佳实践

### 9.1 工具设计原则
```python
# 好的工具设计
@lab_mcp.tool
def calculate_area(length: float, width: float) -> float:
    """计算矩形面积"""
    if length <= 0 or width <= 0:
        raise ValueError("长度和宽度必须大于0")
    return length * width

# 避免的设计
@lab_mcp.tool
def do_something():  # 没有类型提示
    pass  # 没有文档字符串
```

### 9.2 错误处理
```python
@lab_mcp.tool
def safe_divide(a: float, b: float) -> float:
    """安全除法"""
    if b == 0:
        raise ValueError("除数不能为零")
    return a / b
```

### 9.3 日志记录
```python
import logging

logger = logging.getLogger(__name__)

@lab_mcp.tool
def logged_operation(param: str) -> str:
    logger.info(f"Processing parameter: {param}")
    result = process(param)
    logger.info(f"Operation completed: {result}")
    return result
```

## 10. 学习路径建议

### 10.1 基础知识
1. **Python异步编程**：掌握 `async/await`
2. **FastAPI框架**：了解Web API开发
3. **装饰器模式**：理解Python装饰器
4. **类型提示**：掌握Python类型系统

### 10.2 进阶学习
1. **MCP协议**：深入理解MCP规范
2. **ASGI协议**：了解异步Web服务器接口
3. **微服务架构**：学习服务拆分和集成
4. **性能优化**：掌握高并发处理技术

### 10.3 实践项目
1. **简单计算器**：实现基础数学运算工具
2. **文件处理器**：实现文件读写工具
3. **数据库工具**：实现数据查询和操作
4. **AI集成工具**：实现与AI模型的交互

## 11. 总结

FastMCP多服务器架构提供了：

### 核心优势：
- **开发效率高**：装饰器模式简化开发
- **类型安全**：完整的类型系统支持
- **易于扩展**：模块化设计
- **性能优秀**：异步处理和流式传输
- **易于维护**：清晰的代码结构

### 适用场景：
- AI工具服务开发
- 微服务架构
- 插件化系统
- 多租户应用
- 工具集成平台

通过掌握这个架构，你可以快速构建高性能、可扩展的MCP服务，为AI应用提供强大的工具支持。 