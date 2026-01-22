# E2B 沙箱 API 测试报告

> 测试时间: 2026-01-22
> 测试环境: E2B Cloud (API Key: e2b_c93f1c4e99...)
> 测试结果: **20/20 全部通过** ✅

---

## 测试概览

| 难度等级 | 测试项数 | 通过数 | 通过率 |
|----------|----------|--------|--------|
| Level 1 (中级) | 6 | 6 | 100% ✅ |
| Level 2 (高级) | 7 | 7 | 100% ✅ |
| Level 3 (边界) | 7 | 7 | 100% ✅ |
| **总计** | **20** | **20** | **100%** ✅ |

---

## Level 1: 中级测试 - 组合功能验证

> 目标：验证多步骤操作和状态保持

### 1.1 状态保持 - 定义变量

**测试目标**: 验证跨执行的变量状态保持

**步骤**:
1. 执行 `x = 100`
2. 执行 `y = 200`
3. 执行 `print(f"x={x}, y={y}, sum={x+y}")`

**结果**: ✅ PASS

```
输出: x=100, y=200, sum=300
```

---

### 1.2 定义并调用函数

**测试目标**: 验证函数定义和后续调用

**步骤**:
1. 定义函数:
```python
def greet(name):
    return f"Hello, {name}!"
```
2. 调用 `print(greet("Xyzen"))`

**结果**: ✅ PASS

```
输出: Hello, Xyzen!
```

---

### 1.3 列表推导式

**测试目标**: 验证复杂 Python 语法支持

**输入**:
```python
numbers = [1, 2, 3, 4, 5]
squares = [n**2 for n in numbers]
print(f"原始: {numbers}")
print(f"平方: {squares}")
```

**结果**: ✅ PASS

```
原始: [1, 2, 3, 4, 5]
平方: [1, 4, 9, 16, 25]
```

---

### 1.4 错误处理 - NameError

**测试目标**: 验证未定义变量错误的捕获

**输入**:
```python
undefined_var
```

**结果**: ✅ PASS

```json
{
  "success": false,
  "error": "NameError: name 'undefined_var' is not defined"
}
```

---

### 1.5 错误处理 - ZeroDivisionError

**测试目标**: 验证除零错误的捕获

**输入**:
```python
print(1/0)
```

**结果**: ✅ PASS

```json
{
  "success": false,
  "error": "ZeroDivisionError: division by zero"
}
```

---

### 1.6 JSON 处理

**测试目标**: 验证 JSON 序列化/反序列化

**输入**:
```python
import json
data = {"name": "测试", "values": [1, 2, 3], "nested": {"key": "value"}}
json_str = json.dumps(data, ensure_ascii=False, indent=2)
print(json_str)
parsed = json.loads(json_str)
print(f"解析后 name: {parsed['name']}")
```

**结果**: ✅ PASS

```json
{
  "name": "测试",
  "values": [1, 2, 3],
  "nested": {"key": "value"}
}
解析后 name: 测试
```

---

## Level 2: 高级测试 - 复杂场景验证

> 目标：验证真实业务场景

### 2.1 安装第三方库

**API**: `POST /session/{session_id}/sandbox/install`

**测试目标**: 验证 pip 包安装

**输入**:
```json
{ "packages": ["requests"] }
```

**验证**:
```python
import requests
print(f"requests 版本: {requests.__version__}")
```

**结果**: ✅ PASS

```
requests 版本: 2.32.4
```

---

### 2.2 发送 HTTP 请求

**测试目标**: 验证网络访问能力

**输入**:
```python
import requests
response = requests.get("https://httpbin.org/json", timeout=10)
data = response.json()
print(f"状态码: {response.status_code}")
print(f"数据类型: {type(data).__name__}")
print(f"包含 slideshow: {'slideshow' in data}")
```

**结果**: ✅ PASS

```
状态码: 200
数据类型: dict
包含 slideshow: True
```

---

### 2.3 文件上传

**API**: `POST /session/{session_id}/sandbox/upload`

**测试目标**: 验证文件上传功能

**输入**:
- 文件内容: `{"test": "data", "number": 42, "array": [1,2,3]}`
- 目标路径: `/home/user/test_data.json`

**结果**: ✅ PASS

```json
{
  "path": "/home/user/test_data.json",
  "size": 48
}
```

---

### 2.4 代码读取上传的文件

**测试目标**: 验证上传文件可被代码访问

**输入**:
```python
import json
with open("/home/user/test_data.json", "r") as f:
    data = json.load(f)
print(f"读取成功: {data}")
print(f"number 值: {data['number']}")
```

**结果**: ✅ PASS

```
读取成功: {'test': 'data', 'number': 42, 'array': [1, 2, 3]}
number 值: 42
```

---

### 2.5 代码创建文件并下载

**API**: `GET /session/{session_id}/sandbox/download`

**测试目标**: 验证代码创建文件 + 下载

**步骤**:
1. 代码创建文件:
```python
output_data = {"result": "success", "items": ["a", "b", "c"]}
import json
with open("/home/user/output.json", "w") as f:
    json.dump(output_data, f, indent=2)
```

2. 下载 `/home/user/output.json`

**结果**: ✅ PASS

```json
// 下载的内容
{
  "result": "success",
  "items": [
    "a",
    "b",
    "c"
  ]
}
```

---

### 2.6 列出文件

**API**: `GET /session/{session_id}/sandbox/files`

**测试目标**: 验证文件列表功能

**参数**: `path=/home/user`

**结果**: ✅ PASS

```json
[
  "/home/user/output.json",
  "/home/user/test_data.json"
]
```

---

### 2.7 数据分析

**测试目标**: 验证数据分析能力

**输入**:
```python
import statistics
data = [23, 45, 67, 89, 12, 34, 56, 78, 90, 11]
print(f"数据: {data}")
print(f"平均值: {statistics.mean(data):.2f}")
print(f"中位数: {statistics.median(data):.2f}")
print(f"标准差: {statistics.stdev(data):.2f}")
print(f"最大值: {max(data)}, 最小值: {min(data)}")
```

**结果**: ✅ PASS

```
数据: [23, 45, 67, 89, 12, 34, 56, 78, 90, 11]
平均值: 50.50
中位数: 50.50
标准差: 30.19
最大值: 90, 最小值: 11
```

---

## Level 3: 边界测试 - 特殊情况验证

> 目标：验证边界条件和异常情况

### 3.1 多会话隔离

**测试目标**: 验证不同 session 之间的数据隔离

**步骤**:
1. Session A: `isolation_var = "SessionA"`
2. Session B: `isolation_var = "SessionB"`
3. 分别读取各自的 `isolation_var`

**结果**: ✅ PASS

```
Session A 输出: SessionA
Session B 输出: SessionB
```

**结论**: 会话完全隔离，互不影响

---

### 3.2 重复启动同一会话

**测试目标**: 验证重复启动返回同一实例

**步骤**:
1. 第一次启动 `test_duplicate`
2. 第二次启动 `test_duplicate`
3. 比较返回的 `sandbox_id`

**结果**: ✅ PASS

```
第一次 ID: i6bv9q2w78q54sq5i4mlu
第二次 ID: i6bv9q2w78q54sq5i4mlu
返回相同实例: true
```

**结论**: 幂等性正常，不会创建重复沙箱

---

### 3.3 关闭后重新启动

**测试目标**: 验证关闭后重启创建新实例

**步骤**:
1. 启动沙箱，记录 ID
2. 关闭沙箱
3. 重新启动，记录新 ID
4. 比较 ID

**结果**: ✅ PASS

```
旧 ID: ixmsa7zumbrah2idiq5y3
新 ID: igx6cwvdwqyvcn6i5153a
创建新实例: true
```

**结论**: 关闭后状态清除，重启创建全新实例

---

### 3.4 获取不存在会话的状态

**测试目标**: 验证不存在会话的处理

**输入**: `GET /session/non_existent_session_xyz/sandbox/status`

**结果**: ✅ PASS

```json
null
```

**结论**: 优雅处理不存在的会话，返回 null

---

### 3.5 中文支持

**测试目标**: 验证 Unicode/中文字符支持

**输入**:
```python
message = "你好，世界！"
data = {"名称": "测试", "数值": 123}
print(f"消息: {message}")
print(f"数据: {data}")
```

**结果**: ✅ PASS

```
消息: 你好，世界！
数据: {'名称': '测试', '数值': 123}
```

**结论**: 完全支持中文及 Unicode 字符

---

### 3.6 大量输出

**测试目标**: 验证大输出量的处理

**输入**:
```python
for i in range(100):
    print(f"Line {i}: " + "x" * 50)
print("DONE")
```

**结果**: ✅ PASS

```
输出长度: 5995 字符
包含结束标记 DONE: true
```

**结论**: 大量输出正常处理，无截断

---

### 3.7 空代码执行

**测试目标**: 验证空代码的处理

**输入**: `""`（空字符串）

**结果**: ✅ PASS

```json
{
  "success": true,
  "output": ""
}
```

**结论**: 空代码不报错，正常返回

---

## 测试结论

### 功能验证总结

| 功能模块 | 状态 |
|----------|------|
| 沙箱生命周期管理 | ✅ 正常 |
| Python 代码执行 | ✅ 正常 |
| 状态保持 | ✅ 正常 |
| 错误处理 | ✅ 正常 |
| 依赖安装 | ✅ 正常 |
| 网络访问 | ✅ 正常 |
| 文件操作 | ✅ 正常 |
| 多会话隔离 | ✅ 正常 |
| 中文支持 | ✅ 正常 |
| 边界情况 | ✅ 正常 |

### 性能观察

- 沙箱启动时间: ~3-5 秒
- 代码执行延迟: ~100-500ms
- HTTP 请求支持: 正常
- 大输出处理: 正常（6KB+ 无问题）

### 建议

1. **生产环境**: 建议设置合理的超时时间
2. **错误处理**: 前端需处理 `success: false` 的情况
3. **文件操作**: 注意沙箱关闭后文件会丢失
4. **会话管理**: 建议前端维护 session_id 的生命周期
