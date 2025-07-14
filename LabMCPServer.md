# LabMCPServer 详细说明文档

## 一、项目结构与本地数据库

- **mcp_tools.json**：存储所有注册的MCP工具（MCPTool），每个工具包含名称、描述、参数、ID等信息。
- **labs.json**：存储所有实验室（Lab）的信息，包括实验室基础信息和该实验室可用的MCP工具ID列表。
- **models/MCPTool.py**：定义MCPTool数据模型，描述MCP工具的结构。
- **models/Lab.py**：定义Lab数据模型，描述实验室的结构和与工具的关系。

## 二、数据模型说明

### 1. MCPTool
- name：工具名称
- description：工具描述
- inputSchema：输入参数结构
- tool_id：工具唯一ID

### 2. Lab
- name：实验室名称
- description：实验室描述
- lab_id：实验室唯一ID
- type：实验室类型（Public/Private）
- discipline：学科类型
- mcp_tools_available：该实验室可用的MCP工具ID列表

## 三、LabMCPServer类的实现与核心逻辑

### 1. 继承自FastApiMCP
- 通过继承`FastApiMCP`，实现MCP协议的标准服务端。
- 在`__init__`中加载本地数据库（mcp_tools.json、labs.json），并建立工具、实验室、权限的映射。

### 2. 主要成员变量
- `self.all_tools`：所有MCP工具对象列表。
- `self.tool_name_to_id_map`：工具名称到ID的映射。
- `self.lab_tools_map`：实验室ID到可用工具ID列表的映射。
- `self.labs`：所有实验室对象列表。

### 3. 主要方法
- `_load_all_tools_from_json`：从mcp_tools.json加载所有工具。
- `_create_tool_name_to_id_map`：建立工具名称到ID的映射。
- `_load_lab_tools_map_from_json`：从labs.json加载实验室-工具权限映射。
- `_load_labs_from_json`：从labs.json加载完整实验室对象。
- `_check_tool_permission`：检查某实验室是否有权限调用某工具。
- `_extract_lab_id_from_request`：从请求中提取lab_id参数。

### 4. 核心MCP回调
- `list_tools`：始终返回所有工具（标准MCP客户端无法带lab_id参数，无法个性化过滤）。
- `call_tool`：严格校验lab_id权限，只有有权限的实验室才能调用对应工具。

## 四、运行逻辑与权限控制

1. 启动服务后，所有MCP客户端都通过同一个`/mcp`地址访问。
2. 客户端连接时在URL中带上`lab_id`参数（如`/mcp?lab_id=lab_1`）。
3. 客户端界面会显示所有工具（MCP协议限制）。
4. 用户调用工具时，服务端会根据lab_id和权限映射校验是否有权调用。
5. 权限分配完全由labs.json控制，安全性有保障。

## 五、功能示例

- **实验室1（lab_1）**：只能成功调用其`mcp_tools_available`中列出的工具，调用其他工具会被拒绝。
- **实验室2（lab_2）**：同理，只能调用自己有权限的工具。
- **所有实验室都能看到全部工具，但只有有权限的能成功调用。**

## 六、客户端使用说明

1. **连接方式**：
   - 通过 `/mcp?lab_id=lab_1` 或 `/mcp?lab_id=lab_2` 连接MCP Server。
   - 推荐在MCP客户端（如Claude Desktop）配置不同的lab_id参数实现多实验室切换。
2. **操作体验**：
   - 客户端界面会显示所有工具。
   - 只有有权限的工具能被成功调用，无权限的会提示“无权调用该工具”。
3. **无需自定义客户端**，兼容所有标准MCP客户端。

## 七、不足与局限

- **list_tools无法个性化过滤**：标准MCP客户端不会在list_tools请求中带lab_id参数，所有实验室都能看到全部工具。
- **权限控制只能在call_tool阶段实现**，无法在界面层面隐藏无权限工具。
- **如需界面个性化，需自定义客户端或分端口/分路由部署。**

## 八、已实现的功能

- 支持多实验室权限分配，权限由labs.json灵活配置。
- 支持标准MCP协议，兼容主流MCP客户端。
- 权限校验安全可靠，防止越权调用。
- 代码结构清晰，易于维护和扩展。

## 九、后续可扩展方向

- 支持更细粒度的权限（如用户/角色级别）。
- 支持动态热加载数据库，无需重启服务。
- 支持自定义客户端，实现界面个性化过滤。
- 支持分端口/分路由部署，彻底隔离不同实验室。

---
