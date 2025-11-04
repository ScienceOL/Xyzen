# Pytest 测试指南 - 中文版

## 目录
- [基础概念](#基础概念)
- [测试环境设置](#测试环境设置)
- [基础测试写法](#基础测试写法)
- [高级测试模式](#高级测试模式)
- [异步测试](#异步测试)
- [数据库测试](#数据库测试)
- [API测试](#api测试)
- [Mock和模拟](#mock和模拟)
- [测试组织和最佳实践](#测试组织和最佳实践)

## 基础概念

### 什么是测试？
测试是验证代码是否按预期工作的过程。通过编写测试，我们可以：
- 确保代码功能正确
- 防止回归错误
- 提高代码质量
- 便于重构

### 测试类型
1. **单元测试** - 测试单个函数或类
2. **集成测试** - 测试多个组件的交互
3. **端到端测试** - 测试完整的用户流程

## 测试环境设置

### 安装依赖
```bash
# 安装测试相关包
uv add --group test pytest pytest-asyncio pytest-cov pytest-mock httpx aiosqlite
```

### 运行测试
```bash
# 运行所有测试
uv run pytest

# 运行特定文件的测试
uv run pytest tests/test_models/test_provider.py

# 运行特定测试函数
uv run pytest tests/test_models/test_provider.py::TestProviderModel::test_provider_create_valid

# 带详细输出运行
uv run pytest -v

# 带覆盖率报告运行
uv run pytest --cov=. --cov-report=html
```

## 基础测试写法

### 1. 简单函数测试

```python
# 要测试的函数 (utils/math_helper.py)
def add_numbers(a: int, b: int) -> int:
    """两个数字相加"""
    return a + b

def divide_numbers(a: int, b: int) -> float:
    """两个数字相除"""
    if b == 0:
        raise ValueError("除数不能为零")
    return a / b

# 测试文件 (tests/test_utils/test_math_helper.py)
import pytest
from utils.math_helper import add_numbers, divide_numbers

class TestMathHelper:
    """数学工具函数测试"""

    def test_add_numbers_basic(self):
        """测试基本加法"""
        result = add_numbers(2, 3)
        assert result == 5

    def test_add_numbers_negative(self):
        """测试负数加法"""
        result = add_numbers(-1, 5)
        assert result == 4

    def test_divide_numbers_basic(self):
        """测试基本除法"""
        result = divide_numbers(10, 2)
        assert result == 5.0

    def test_divide_by_zero_raises_error(self):
        """测试除零异常"""
        with pytest.raises(ValueError, match="除数不能为零"):
            divide_numbers(10, 0)
```

### 2. 数据驱动测试

```python
import pytest

class TestProviderValidation:
    """供应商验证测试"""

    @pytest.mark.parametrize("provider_type", ["openai", "anthropic", "azure_openai", "google"])
    def test_valid_provider_types(self, provider_type):
        """测试有效的供应商类型"""
        provider = ProviderCreate(
            name=f"Test {provider_type}",
            provider_type=provider_type,
            api="https://api.test.com",
            key="test-key"
        )
        assert provider.provider_type == provider_type

    @pytest.mark.parametrize("temperature,expected", [
        (0.0, True),
        (0.5, True),
        (1.0, True),
        (2.0, True),
        (-0.1, False),  # 应该失败
        (2.1, False),   # 应该失败
    ])
    def test_temperature_validation(self, temperature, expected):
        """测试温度参数验证"""
        if expected:
            provider = ProviderCreate(
                name="Test Provider",
                provider_type="openai",
                api="https://api.test.com",
                key="test-key",
                temperature=temperature
            )
            assert provider.temperature == temperature
        else:
            with pytest.raises(ValidationError):
                ProviderCreate(
                    name="Test Provider",
                    provider_type="openai",
                    api="https://api.test.com",
                    key="test-key",
                    temperature=temperature
                )
```

## 高级测试模式

### 1. 测试夹具 (Fixtures)

```python
# conftest.py - 全局测试配置
import pytest
from uuid import uuid4
from models.provider import ProviderCreate

@pytest.fixture
def sample_provider_data():
    """创建示例供应商数据"""
    return ProviderCreate(
        name="Test Provider",
        provider_type="openai",
        api="https://api.openai.com/v1",
        key="sk-test-key-123"
    )

@pytest.fixture
def multiple_providers():
    """创建多个供应商数据"""
    return [
        ProviderCreate(name="OpenAI", provider_type="openai", api="https://api.openai.com", key="sk-1"),
        ProviderCreate(name="Anthropic", provider_type="anthropic", api="https://api.anthropic.com", key="sk-2")
    ]

# 使用夹具的测试
class TestProviderWithFixtures:
    """使用测试夹具的供应商测试"""

    def test_provider_creation(self, sample_provider_data):
        """测试供应商创建"""
        assert sample_provider_data.name == "Test Provider"
        assert sample_provider_data.provider_type == "openai"

    def test_multiple_providers(self, multiple_providers):
        """测试多个供应商"""
        assert len(multiple_providers) == 2
        provider_types = [p.provider_type for p in multiple_providers]
        assert "openai" in provider_types
        assert "anthropic" in provider_types
```

### 2. 测试标记 (Markers)

```python
import pytest

class TestIntegration:
    """集成测试示例"""

    @pytest.mark.unit
    def test_unit_function(self):
        """单元测试标记"""
        pass

    @pytest.mark.integration
    def test_database_integration(self):
        """集成测试标记"""
        pass

    @pytest.mark.slow
    def test_long_running_process(self):
        """慢速测试标记"""
        pass

# 运行特定标记的测试
# uv run pytest -m unit          # 只运行单元测试
# uv run pytest -m integration   # 只运行集成测试
# uv run pytest -m "not slow"    # 跳过慢速测试
```

## 异步测试

### 1. 基本异步测试

```python
import pytest
import asyncio
from sqlmodel.ext.asyncio.session import AsyncSession

class TestAsyncFunctions:
    """异步函数测试"""

    async def test_async_database_operation(self, db_session: AsyncSession):
        """测试异步数据库操作"""
        # 创建供应商
        provider_data = ProviderCreate(
            name="Async Test Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="sk-async-test"
        )

        provider_repo = ProviderRepository(db=db_session)
        provider = await provider_repo.create_provider(provider_data, user_id="test-user")

        assert provider.id is not None
        assert provider.name == "Async Test Provider"

    async def test_async_api_call(self):
        """测试异步API调用"""
        async def fetch_data():
            await asyncio.sleep(0.1)  # 模拟异步操作
            return {"status": "success"}

        result = await fetch_data()
        assert result["status"] == "success"
```

### 2. 异步夹具

```python
import pytest_asyncio
from sqlmodel.ext.asyncio.session import AsyncSession

@pytest_asyncio.fixture
async def async_provider_repo(db_session: AsyncSession):
    """创建异步供应商仓库"""
    repo = ProviderRepository(db=db_session)

    # 可以在这里做一些初始化
    yield repo

    # 清理工作在这里进行

class TestAsyncRepo:
    """异步仓库测试"""

    async def test_create_and_fetch_provider(self, async_provider_repo):
        """测试创建和获取供应商"""
        # 创建
        provider_data = ProviderCreate(name="Test", provider_type="openai", api="test", key="test")
        created = await async_provider_repo.create_provider(provider_data, "user-1")

        # 获取
        fetched = await async_provider_repo.get_provider_by_id(created.id)
        assert fetched is not None
        assert fetched.name == "Test"
```

## 数据库测试

### 1. 数据库夹具设置

```python
# conftest.py
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlmodel import SQLModel

@pytest.fixture
async def async_engine() -> AsyncEngine:
    """创建测试用异步数据库引擎"""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",  # 内存数据库，速度快
        echo=False  # 设为True可以看到SQL查询
    )

    # 创建所有表
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)

    yield engine
    await engine.dispose()

@pytest_asyncio.fixture
async def db_session(async_engine: AsyncEngine) -> AsyncSession:
    """创建数据库会话"""
    async with AsyncSession(async_engine) as session:
        yield session
        await session.rollback()  # 测试后回滚，保持数据库清洁
```

### 2. 数据库测试示例

```python
class TestProviderRepository:
    """供应商仓库测试"""

    async def test_create_provider_success(self, db_session: AsyncSession):
        """测试成功创建供应商"""
        repo = ProviderRepository(db=db_session)

        provider_data = ProviderCreate(
            name="Test Provider",
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="sk-test-key"
        )

        provider = await repo.create_provider(provider_data, user_id="test-user")

        assert provider.id is not None
        assert provider.name == "Test Provider"
        assert provider.user_id == "test-user"

    async def test_get_provider_by_id(self, db_session: AsyncSession):
        """测试通过ID获取供应商"""
        repo = ProviderRepository(db=db_session)

        # 先创建一个供应商
        provider_data = ProviderCreate(name="Get Test", provider_type="openai", api="test", key="test")
        created = await repo.create_provider(provider_data, "test-user")
        await db_session.commit()  # 提交到数据库

        # 然后获取它
        fetched = await repo.get_provider_by_id(created.id)
        assert fetched is not None
        assert fetched.name == "Get Test"

    async def test_get_nonexistent_provider(self, db_session: AsyncSession):
        """测试获取不存在的供应商"""
        repo = ProviderRepository(db=db_session)

        fake_id = uuid4()
        result = await repo.get_provider_by_id(fake_id)
        assert result is None

    async def test_user_isolation(self, db_session: AsyncSession):
        """测试用户数据隔离"""
        repo = ProviderRepository(db=db_session)

        # 用户A创建供应商
        provider_data_a = ProviderCreate(name="User A Provider", provider_type="openai", api="test", key="test")
        provider_a = await repo.create_provider(provider_data_a, "user-a")

        # 用户B创建供应商
        provider_data_b = ProviderCreate(name="User B Provider", provider_type="anthropic", api="test", key="test")
        provider_b = await repo.create_provider(provider_data_b, "user-b")

        await db_session.commit()

        # 验证用户A只能看到自己的供应商
        user_a_providers = await repo.get_providers_by_user("user-a", include_system=False)
        assert len(user_a_providers) == 1
        assert user_a_providers[0].name == "User A Provider"

        # 验证用户B只能看到自己的供应商
        user_b_providers = await repo.get_providers_by_user("user-b", include_system=False)
        assert len(user_b_providers) == 1
        assert user_b_providers[0].name == "User B Provider"
```

## API测试

### 1. FastAPI测试客户端

```python
from httpx import AsyncClient
from fastapi.testclient import TestClient

class TestProvidersAPI:
    """供应商API测试"""

    def test_get_provider_templates_sync(self, test_client: TestClient):
        """测试获取供应商模板（同步）"""
        response = test_client.get("/api/v1/providers/templates")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) > 0

    async def test_create_provider_success(self, async_client: AsyncClient):
        """测试创建供应商成功（异步）"""
        provider_data = {
            "name": "API Test Provider",
            "provider_type": "openai",
            "api": "https://api.openai.com/v1",
            "key": "sk-test-key"
        }

        response = await async_client.post("/api/v1/providers/", json=provider_data)

        assert response.status_code == 201
        created = response.json()
        assert created["name"] == "API Test Provider"
        assert "id" in created

    async def test_create_provider_invalid_data(self, async_client: AsyncClient):
        """测试创建供应商时数据无效"""
        invalid_data = {
            "name": "",  # 无效：空名称
            "provider_type": "invalid_type",  # 无效：不支持的类型
            "api": "not-a-url",  # 无效：不是URL
            "key": ""  # 无效：空密钥
        }

        response = await async_client.post("/api/v1/providers/", json=invalid_data)

        assert response.status_code == 422  # 验证错误
        error_detail = response.json()["detail"]
        assert len(error_detail) > 0  # 应该有错误信息

    async def test_get_provider_unauthorized(self, async_client: AsyncClient):
        """测试未授权访问供应商"""
        fake_id = str(uuid4())

        # 不提供认证头
        response = await async_client.get(f"/api/v1/providers/{fake_id}")

        assert response.status_code in [401, 403]  # 未授权或禁止访问
```

### 2. 认证测试

```python
from unittest.mock import patch

class TestAuthenticatedAPI:
    """需要认证的API测试"""

    @patch("handler.api.v1.providers.get_current_user")
    async def test_get_my_providers(self, mock_auth, async_client: AsyncClient):
        """测试获取我的供应商"""
        # 模拟认证用户
        mock_auth.return_value = "test-user-123"

        response = await async_client.get("/api/v1/providers/me")

        assert response.status_code == 200
        providers = response.json()
        assert isinstance(providers, list)

    async def test_create_provider_with_auth(self, async_client: AsyncClient):
        """测试带认证创建供应商"""
        with patch("handler.api.v1.providers.get_current_user") as mock_auth:
            mock_auth.return_value = "authenticated-user"

            provider_data = {
                "name": "Authenticated Provider",
                "provider_type": "openai",
                "api": "https://api.openai.com/v1",
                "key": "sk-auth-test"
            }

            response = await async_client.post("/api/v1/providers/", json=provider_data)

            assert response.status_code == 201
            created = response.json()
            assert created["user_id"] == "authenticated-user"  # 用户ID应该从认证中获取
```

## Mock和模拟

### 1. 基本Mock使用

```python
from unittest.mock import Mock, patch, MagicMock
import pytest

class TestExternalAPICalls:
    """外部API调用测试"""

    @patch("requests.post")
    def test_openai_api_call_success(self, mock_post):
        """测试OpenAI API调用成功"""
        # 设置模拟返回值
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "Hello from mock!"}}],
            "usage": {"total_tokens": 15}
        }
        mock_post.return_value = mock_response

        # 执行被测试的代码
        provider = OpenAIProvider(api_key="test-key")
        result = provider.call_api({"prompt": "Hello"})

        # 验证结果
        assert result["content"] == "Hello from mock!"
        mock_post.assert_called_once()  # 确保API被调用了一次

    @patch("requests.post")
    def test_openai_api_call_failure(self, mock_post):
        """测试OpenAI API调用失败"""
        # 模拟API错误
        mock_post.side_effect = requests.RequestException("Network error")

        provider = OpenAIProvider(api_key="test-key")

        with pytest.raises(requests.RequestException):
            provider.call_api({"prompt": "Hello"})
```

### 2. 异步Mock

```python
from unittest.mock import AsyncMock, patch
import pytest

class TestAsyncProviderCalls:
    """异步供应商调用测试"""

    @patch("core.providers.openai.AsyncOpenAI")
    async def test_async_openai_call(self, mock_client_class):
        """测试异步OpenAI调用"""
        # 创建异步模拟
        mock_client = AsyncMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Async mock response"
        mock_response.choices[0].finish_reason = "stop"

        mock_client.chat.completions.create.return_value = mock_response
        mock_client_class.return_value = mock_client

        # 测试
        provider = OpenAIProvider(api_key=SecretStr("test-key"))
        request = ChatCompletionRequest(
            messages=[ChatMessage(role="user", content="Hello")],
            model="gpt-4"
        )

        response = await provider.chat_completion(request)

        assert response.content == "Async mock response"
        assert response.finish_reason == "stop"
        mock_client.chat.completions.create.assert_called_once()
```

### 3. 数据库Mock

```python
from unittest.mock import AsyncMock
import pytest

class TestRepositoryMocking:
    """仓库模拟测试"""

    async def test_service_with_mocked_repo(self):
        """测试带模拟仓库的服务"""
        # 创建模拟仓库
        mock_repo = AsyncMock(spec=ProviderRepository)

        # 设置模拟返回值
        mock_provider = Provider(
            id=uuid4(),
            name="Mocked Provider",
            provider_type="openai",
            user_id="test-user"
        )
        mock_repo.get_provider_by_id.return_value = mock_provider

        # 测试使用模拟仓库的服务
        provider_id = uuid4()
        result = await mock_repo.get_provider_by_id(provider_id)

        assert result.name == "Mocked Provider"
        mock_repo.get_provider_by_id.assert_called_once_with(provider_id)
```

## 测试组织和最佳实践

### 1. 测试文件组织

```
tests/
├── conftest.py                 # 全局测试配置
├── test_models/                # 模型测试
│   ├── test_provider.py
│   ├── test_message.py
│   └── test_agent.py
├── test_repositories/          # 仓库测试
│   ├── test_provider_repo.py
│   └── test_message_repo.py
├── test_services/              # 服务层测试
│   ├── test_provider_service.py
│   └── test_chat_service.py
├── test_api/                   # API测试
│   ├── test_provider_endpoints.py
│   └── test_chat_endpoints.py
└── test_integration/           # 集成测试
    ├── test_full_workflow.py
    └── test_database_integration.py
```

### 2. 测试命名约定

```python
class TestProviderModel:
    """供应商模型测试 - 描述测试的目标"""

    def test_create_provider_with_valid_data(self):
        """测试使用有效数据创建供应商 - 描述具体场景"""
        pass

    def test_create_provider_with_invalid_name_raises_error(self):
        """测试无效名称创建供应商抛出错误 - 描述期望行为"""
        pass

    def test_provider_serialization_preserves_all_fields(self):
        """测试供应商序列化保留所有字段 - 描述验证内容"""
        pass
```

### 3. AAA模式 (Arrange-Act-Assert)

```python
def test_provider_creation_follows_aaa_pattern(self):
    """使用AAA模式的测试示例"""

    # Arrange - 准备测试数据
    provider_data = ProviderCreate(
        name="AAA Test Provider",
        provider_type="openai",
        api="https://api.openai.com/v1",
        key="sk-test-key"
    )

    # Act - 执行被测试的操作
    provider = Provider(**provider_data.model_dump(), id=uuid4())

    # Assert - 验证结果
    assert provider.name == "AAA Test Provider"
    assert provider.provider_type == "openai"
    assert provider.id is not None
```

### 4. 测试数据管理

```python
# fixtures/provider_fixtures.py
class ProviderTestData:
    """供应商测试数据工厂"""

    @staticmethod
    def valid_openai_provider(**overrides):
        """创建有效的OpenAI供应商数据"""
        defaults = {
            "name": "Test OpenAI Provider",
            "provider_type": "openai",
            "api": "https://api.openai.com/v1",
            "key": "sk-test-key-123"
        }
        defaults.update(overrides)
        return ProviderCreate(**defaults)

    @staticmethod
    def invalid_provider_missing_name():
        """创建缺少名称的无效供应商数据"""
        return {
            "provider_type": "openai",
            "api": "https://api.openai.com/v1",
            "key": "sk-test-key"
            # 故意不包含name
        }

# 在测试中使用
class TestProviderWithFactory:
    def test_valid_provider_creation(self):
        """测试有效供应商创建"""
        provider_data = ProviderTestData.valid_openai_provider()
        provider = Provider(**provider_data.model_dump(), id=uuid4())
        assert provider.name == "Test OpenAI Provider"

    def test_custom_provider_name(self):
        """测试自定义供应商名称"""
        provider_data = ProviderTestData.valid_openai_provider(name="Custom Name")
        provider = Provider(**provider_data.model_dump(), id=uuid4())
        assert provider.name == "Custom Name"
```

### 5. 错误测试模式

```python
class TestErrorHandling:
    """错误处理测试"""

    def test_specific_exception_with_message(self):
        """测试特定异常和消息"""
        with pytest.raises(ValueError, match="API密钥不能为空"):
            create_provider_with_empty_key()

    def test_multiple_validation_errors(self):
        """测试多个验证错误"""
        with pytest.raises(ValidationError) as exc_info:
            ProviderCreate(name="", provider_type="invalid", api="", key="")

        errors = exc_info.value.errors()
        assert len(errors) >= 3  # 至少3个错误
        error_fields = [error["loc"][0] for error in errors]
        assert "name" in error_fields
        assert "provider_type" in error_fields
        assert "api" in error_fields

    async def test_database_constraint_violation(self, db_session):
        """测试数据库约束违反"""
        repo = ProviderRepository(db=db_session)

        # 创建第一个供应商
        provider_data = ProviderCreate(name="Unique Name", provider_type="openai", api="test", key="test")
        await repo.create_provider(provider_data, "user-1")
        await db_session.commit()

        # 尝试创建同名供应商（如果有唯一约束）
        with pytest.raises(IntegrityError):
            await repo.create_provider(provider_data, "user-1")
            await db_session.commit()
```

### 6. 性能和边界测试

```python
import time
import pytest

class TestPerformanceAndLimits:
    """性能和边界测试"""

    @pytest.mark.slow
    def test_large_data_processing(self):
        """测试大数据处理"""
        large_data = ["item"] * 10000

        start_time = time.time()
        result = process_large_dataset(large_data)
        end_time = time.time()

        assert len(result) == 10000
        assert (end_time - start_time) < 5.0  # 应该在5秒内完成

    def test_boundary_values(self):
        """测试边界值"""
        # 测试最小值
        provider = ProviderCreate(
            name="A",  # 最短名称
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="sk-x",
            max_tokens=1,  # 最小token数
            temperature=0.0  # 最小温度
        )
        assert provider.max_tokens == 1

        # 测试最大值
        provider_max = ProviderCreate(
            name="X" * 100,  # 最长名称
            provider_type="openai",
            api="https://api.openai.com/v1",
            key="sk-test",
            max_tokens=128000,  # 最大token数
            temperature=2.0  # 最大温度
        )
        assert provider_max.max_tokens == 128000
```

## 实用提示

### 1. 调试测试
```bash
# 显示详细输出和打印语句
uv run pytest -v -s

# 在第一个失败时停止
uv run pytest -x

# 显示局部变量
uv run pytest --tb=long

# 只运行失败的测试
uv run pytest --lf
```

### 2. 测试覆盖率
```bash
# 生成HTML覆盖率报告
uv run pytest --cov=. --cov-report=html

# 只显示缺少覆盖的行
uv run pytest --cov=. --cov-report=term-missing

# 设置覆盖率阈值
uv run pytest --cov=. --cov-fail-under=90
```

### 3. 并行执行测试
```bash
# 安装pytest-xdist
uv add --group test pytest-xdist

# 并行运行测试
uv run pytest -n auto  # 自动检测CPU核心数
uv run pytest -n 4     # 使用4个进程
```

### 4. 常见测试断言
```python
# 基本断言
assert value == expected
assert value != unexpected
assert value > threshold
assert value in container
assert value is None
assert value is not None

# 字符串断言
assert "substring" in full_string
assert string.startswith("prefix")
assert string.endswith("suffix")

# 集合断言
assert len(collection) == expected_length
assert set(actual_items) == set(expected_items)

# 异常断言
with pytest.raises(ExceptionType):
    risky_function()

with pytest.raises(ValueError, match="specific message"):
    function_with_specific_error()

# 近似断言（浮点数）
assert abs(actual_value - expected_value) < 0.001
# 或使用pytest.approx
assert actual_value == pytest.approx(expected_value, rel=1e-3)
```

这个指南涵盖了pytest的核心概念和在Xyzen项目中的实际应用。建议从基础测试开始，逐步学习更高级的模式。记住，好的测试应该是：

- **可读的** - 清楚地表达测试意图
- **可靠的** - 结果一致且可重复
- **独立的** - 测试之间不相互依赖
- **快速的** - 能够频繁运行
- **有意义的** - 测试重要的功能和边界情况
