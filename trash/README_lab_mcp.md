# 实验室MCP服务器功能

## 概述

本项目扩展了原有的 `fastapi_mcp` 功能，实现了为每个实验室创建独立MCP服务器的功能。每个实验室可以有自己的工具集合，并且可以通过动态路径访问各自的MCP服务器。

## 功能特性

1. **动态路由挂载**: 每个实验室的MCP服务器挂载到 `/labs/{lid}/tools/mcp` 路径
2. **工具过滤**: 每个实验室只能访问自己被授权的工具
3. **独立服务器**: 每个实验室有独立的MCP服务器实例
4. **管理器模式**: 使用 `LabMCPManager` 集中管理所有实验室的MCP服务器

## 核心组件

### 1. FastAPILabMCP 类

扩展的MCP服务器类，支持：
- 实验室ID过滤
- 工具权限控制
- 动态路径挂载

### 2. LabMCPManager 类

管理所有实验室MCP服务器的单例管理器：
- 创建和缓存实验室MCP服务器
- 管理传输实例
- 提供统一的访问接口

### 3. 动态挂载功能

`mount_lab_mcp_dynamically()` 函数：
- 自动读取所有实验室信息
- 为每个实验室创建MCP服务器
- 挂载到动态路径

## 使用方法

### 1. 启动服务器

```python
from fastapi import FastAPI
from server.FastAPILabMCP import mount_lab_mcp_dynamically

app = FastAPI()

# 动态挂载所有实验室的MCP服务器
mount_lab_mcp_dynamically(app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
```

### 2. 访问实验室MCP服务器

每个实验室的MCP服务器可以通过以下路径访问：

- **MCP连接端点**: `GET /labs/{lid}/tools/mcp`
- **MCP消息端点**: `POST /labs/{lid}/tools/mcp/messages/`

### 3. 实验室信息查询

- **实验室信息**: `GET /labs/{lid}`
- **实验室工具列表**: `GET /labs/{lid}/tools`

## 配置说明

### 实验室数据结构

实验室数据存储在 `data/labs.json` 文件中，包含：

```json
{
  "name": "实验室名称",
  "description": "实验室描述",
  "lid": 1,
  "type": "Public",
  "discipline": "Biology",
  "mcp_tools_available": [
    {
      "name": "工具名称",
      "tid": 1001,
      "type": "Tools",
      "requires_license": false
    }
  ]
}
```

### 工具过滤机制

系统支持多种工具过滤方式：

1. **按实验室ID过滤**: 只显示该实验室有权限的工具
2. **按操作ID过滤**: 使用 `operations_include/exclude`
3. **按标签过滤**: 使用 `tags_include/exclude`

## API端点

### 实验室相关端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/labs/{lid}` | 获取实验室信息 |
| GET | `/labs/{lid}/tools` | 获取实验室工具列表 |
| POST | `/labs/{lid}/tools` | 添加实验室工具 |
| DELETE | `/labs/{lid}/tools` | 删除实验室工具 |

### MCP相关端点

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/labs/{lid}/tools/mcp` | MCP连接端点 |
| POST | `/labs/{lid}/tools/mcp/messages/` | MCP消息端点 |

## 测试

运行测试脚本：

```bash
python test_lab_mcp.py
```

测试包含：
- 实验室MCP服务器创建测试
- 端点访问测试
- 工具过滤测试

## 扩展功能

### 自定义工具过滤

```python
lab_mcp = FastAPILabMCP(
    fastapi=app,
    lab_id=1,
    operations_include=["get_lab_info", "get_lab_tools"],
    tags_include=["labs"]
)
```

### 自定义挂载路径

```python
lab_mcp.mount(
    router=app,
    mount_path="/custom/path/mcp",
    transport="sse"
)
```

## 注意事项

1. **权限控制**: 确保实验室只能访问被授权的工具
2. **性能考虑**: 大量实验室时考虑使用缓存和延迟加载
3. **错误处理**: 实现完整的错误处理和日志记录
4. **安全性**: 在生产环境中添加适当的身份验证和授权机制

## 故障排除

### 常见问题

1. **实验室不存在**: 检查 `data/labs.json` 文件中是否包含对应的实验室数据
2. **工具访问失败**: 确认实验室有相应工具的权限
3. **MCP连接失败**: 检查端点路径和传输配置是否正确

### 日志调试

启用详细日志：

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

## 未来改进

1. **数据库支持**: 将实验室数据迁移到数据库
2. **动态权限管理**: 实现运行时权限更新
3. **性能优化**: 实现工具和服务器的缓存机制
4. **监控和指标**: 添加MCP服务器的监控功能 