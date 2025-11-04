# Xyzen Service Testing Infrastructure

This directory contains comprehensive test coverage for the Xyzen AI Laboratory Server service, which is built with FastAPI, SQLModel, and modern Python 3.13 type checking.

## Overview

The testing infrastructure provides:
- **Unit tests** for all core components
- **Integration tests** for API endpoints
- **Repository tests** with database operations
- **Provider tests** for AI integrations
- **Mock fixtures** for external dependencies
- **Async test support** for FastAPI and SQLModel
- **Coverage reporting** with 85% target threshold

## Test Structure

```
tests/
├── conftest.py                 # Global pytest configuration and fixtures
├── fixtures/                   # Shared test fixtures
│   ├── auth_fixtures.py        # Authentication mocks and user contexts
│   └── provider_fixtures.py    # AI provider configurations and responses
├── test_models/                # SQLModel validation and serialization
│   ├── test_provider.py        # Provider model tests
│   ├── test_message.py         # Message model tests
│   ├── test_topic.py           # Topic model tests
│   └── test_agent.py           # Agent model tests
├── test_repo/                  # Repository database operations
│   └── test_provider_repository.py  # Provider CRUD operations
├── test_providers/             # AI provider implementations
│   ├── test_base_provider.py   # Base provider and model registry
│   └── test_openai_provider.py # OpenAI provider implementation
├── test_handlers/              # API endpoint handlers
│   └── test_providers_api.py   # REST API tests
├── test_core/                  # Core business logic
├── test_middleware/            # Middleware components
│   └── test_database.py        # Database middleware
├── test_utils/                 # Utility functions
│   └── test_built_in_tools.py  # Built-in MCP tools
└── test_integration.py         # Integration and end-to-end tests
```

## Running Tests

### Basic Commands

```bash
# Run all tests
uv run pytest

# Run specific test categories
uv run pytest tests/test_models/     # Model tests only
uv run pytest tests/test_repo/       # Repository tests only
uv run pytest tests/test_providers/  # Provider tests only

# Run with coverage
uv run pytest --cov=. --cov-report=html

# Run in verbose mode
uv run pytest -v

# Run specific test
uv run pytest tests/test_models/test_provider.py::TestProviderModel::test_provider_create_valid
```

### Test Markers

```bash
# Run only unit tests
uv run pytest -m "unit"

# Run only integration tests
uv run pytest -m "integration"

# Skip slow tests
uv run pytest -m "not slow"
```

## Configuration

### pytest.ini Options
- **asyncio_mode**: Automatic async test detection
- **Coverage target**: 85% minimum coverage
- **Test discovery**: `test_*.py` and `*_test.py` patterns
- **Markers**: `unit`, `integration`, `slow` for test categorization

### Coverage Settings
- **Source directories**: All service code
- **Exclusions**: Tests, migrations, cache files
- **Reports**: Terminal, HTML, and XML formats
- **Fail threshold**: 85% coverage required

## Test Fixtures

### Database Fixtures
- `async_engine`: Async SQLAlchemy engine with in-memory SQLite
- `db_session`: Isolated async database session for each test
- `sync_engine`: Synchronous database engine for legacy tests

### Authentication Fixtures
- `mock_user_context`: Test user authentication context
- `mock_auth_header`: JWT authorization headers
- `mock_jwt_token`: Valid JWT token for testing

### Provider Fixtures
- `openai_provider_data`: OpenAI provider configuration
- `anthropic_provider_data`: Anthropic provider configuration
- `azure_openai_provider_data`: Azure OpenAI provider configuration
- `mock_http_client`: Mocked HTTP client for API requests

### Application Fixtures
- `test_client`: FastAPI test client with mocked dependencies
- `async_client`: Async HTTP client for API testing
- `mock_provider`: Mock LLM provider for testing

## Key Testing Patterns

### Model Testing
```python
def test_provider_create_valid(self):
    """Test creating a valid provider."""
    data = {
        "name": "Test Provider",
        "provider_type": "openai",
        "api": "https://api.openai.com/v1",
        "key": "sk-test-key",
    }
    provider = ProviderCreate(**data)
    assert provider.name == "Test Provider"
```

### Repository Testing
```python
async def test_create_provider(self, provider_repo: ProviderRepository):
    """Test creating a new provider."""
    provider_data = ProviderCreate(...)
    provider = await provider_repo.create_provider(provider_data, user_id="test-user")
    assert provider.id is not None
```

### API Testing
```python
async def test_create_provider_success(self, async_client: AsyncClient, mock_auth):
    """Test creating a provider via API."""
    response = await async_client.post("/api/v1/providers/", json=provider_data)
    assert response.status_code == 201
```

### Provider Testing
```python
async def test_chat_completion_basic(self, mock_openai_client):
    """Test OpenAI chat completion."""
    provider = OpenAIProvider(api_key=SecretStr("sk-test"))
    response = await provider.chat_completion(request)
    assert response.content is not None
```

## Mock Strategies

### External APIs
- **OpenAI API**: Mock HTTP responses and client initialization
- **Anthropic API**: Mock streaming and tool responses
- **Azure OpenAI**: Mock capability-aware parameter filtering
- **Google GenAI**: Mock multimodal responses

### Database Operations
- **In-memory SQLite**: Fast, isolated test database
- **Transaction rollback**: Clean state between tests
- **Async session management**: Proper async/await patterns

### Authentication
- **JWT token mocking**: Valid token structure without real auth
- **User context injection**: Bypass authentication middleware
- **Permission testing**: Role-based access control validation

## Best Practices

### Test Organization
- **One test class per model/service**: Clear test organization
- **Descriptive test names**: Self-documenting test purposes
- **Setup/teardown isolation**: Independent test execution
- **Fixture reuse**: Minimize duplicate test setup

### Async Testing
- **pytest-asyncio**: Proper async test execution
- **AsyncSession management**: Database transaction isolation
- **Mock async clients**: Realistic API interaction simulation
- **Event loop scoping**: Proper async fixture lifecycle

### Coverage Goals
- **Models**: 100% coverage for validation and serialization
- **Repositories**: 90%+ coverage for database operations
- **Providers**: 85%+ coverage including error scenarios
- **APIs**: 80%+ coverage for success and error paths

### Error Testing
- **Validation errors**: Invalid input handling
- **Database constraints**: Unique key and foreign key violations
- **API errors**: Network failures and rate limiting
- **Authentication failures**: Invalid tokens and permissions

## Integration with Development

### Pre-commit Hooks
```bash
# Install pre-commit hooks
uv run pre-commit install

# Tests run automatically on commit
git commit -m "Add feature"
```

### CI/CD Integration
- **GitHub Actions**: Automated test execution
- **Coverage reporting**: Fail builds below threshold
- **Multiple Python versions**: Compatibility testing
- **Docker testing**: Containerized test execution

### Development Workflow
1. **Write failing tests**: Test-driven development
2. **Implement features**: Make tests pass
3. **Verify coverage**: Ensure adequate test coverage
4. **Run integration tests**: End-to-end validation
5. **Commit changes**: Automated test execution

## Troubleshooting

### Common Issues

**Import errors**: Ensure Python path includes service directory
```bash
cd service && uv run pytest
```

**Database errors**: Check that test database is properly isolated
```python
# Verify fixture usage
async def test_something(db_session: AsyncSession):
    # Test uses isolated session
```

**Async errors**: Verify proper async/await usage
```python
# Correct async test pattern
async def test_async_function():
    result = await some_async_function()
    assert result is not None
```

**Mock issues**: Ensure mocks are properly configured
```python
# Use context managers for patches
with patch('module.function') as mock_func:
    mock_func.return_value = expected_result
    # Test code here
```

### Debugging Tests
```bash
# Run with debugging output
uv run pytest -v -s

# Stop on first failure
uv run pytest -x

# Show local variables on failure
uv run pytest --tb=long

# Run specific failing test
uv run pytest tests/test_file.py::test_function -v -s
```

## Future Enhancements

- **Performance testing**: Load testing for API endpoints
- **Security testing**: Input sanitization and injection testing
- **Contract testing**: API contract validation with consumers
- **Mutation testing**: Test quality validation with mutation testing
- **Property-based testing**: Hypothesis-based test generation
