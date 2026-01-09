# Xyzen Developer Guide

This comprehensive guide provides architectural guidance for AI Agents and LLMs working on the Xyzen codebase. Follow these instructions to ensure consistency, quality, and maintainability across all system components.

## 1. Project Overview & Philosophy

### 1.1 Project Mission
Xyzen is an **AI Laboratory Server** - a sophisticated full-stack application designed for advanced AI research and development. It provides:
- Multi-agent LLM orchestration with LangGraph
- Real-time collaborative chat interfaces
- Advanced document processing capabilities
- Extensible plugin architecture via Model Context Protocol (MCP)
- Enterprise-grade file processing and storage systems

### 1.2 Architecture Philosophy
**Goal:** Build a professional, scalable, and maintainable AI platform.

**Core Principles:**
- **Layered Architecture**: Clear separation of concerns across all layers
- **Agent-First Design**: AI agents as first-class citizens in the system
- **Real-Time by Default**: WebSocket-driven communication for responsive UX
- **No-Foreign-Key Database**: Flexible data relationships without rigid constraints
- **Plugin Extensibility**: MCP-based tool and capability extension
- **Type Safety**: Comprehensive TypeScript and Python typing

## 2. System Architecture

### 2.1 Backend Architecture

```
service/app/
├── agents/             # LangGraph-based AI agents
│   ├── base_graph_agent.py      # Abstract base for graph agents
│   ├── base_agent.py            # Flexible agent execution patterns
│   └── [specific_agents]/       # Domain-specific agent implementations
├── api/                # FastAPI REST and WebSocket endpoints
│   ├── v1/             # Versioned REST APIs
│   └── ws/             # WebSocket endpoints (real-time communication)
├── core/               # Business logic and orchestration
│   ├── chat/           # Chat system and message handling
│   ├── llm/            # LLM provider integration
│   ├── providers/      # Multi-provider system management
│   └── storage/        # File storage and processing
├── infra/              # Infrastructure services
│   ├── database/       # Database connections and management
│   └── storage/        # Object storage (S3/MinIO) integration
├── middleware/         # Cross-cutting concerns
│   └── auth.py         # Authentication and authorization
├── models/             # SQLModel definitions (no foreign keys)
├── repos/              # Repository pattern for data access
├── schemas/            # Pydantic request/response schemas
└── mcp/                # Model Context Protocol integration
```

**Key Technologies:**
- **FastAPI**: Modern async web framework
- **SQLModel**: Type-safe database ORM
- **LangGraph**: Multi-agent workflow orchestration
- **Redis**: Real-time messaging and caching
- **PostgreSQL**: Primary data store
- **Casdoor**: Authentication and user management

### 2.2 Frontend Architecture

```
web/src/
├── app/                # Next.js-style routing and pages
├── components/         # React components (UI rendering only)
│   ├── features/       # Feature-specific UI components
│   ├── chat/           # Chat interface components
│   ├── layouts/        # Application layout wrappers
│   ├── preview/        # File preview system
│   └── ui/             # shadcn/ui design system components
├── core/               # ⭐ HEART: Business logic and orchestration
│   ├── chat/           # Chat system business logic
│   ├── document/       # Document processing logic
│   └── auth/           # Authentication logic
├── hooks/              # Custom React hooks
│   ├── queries/        # TanStack Query hooks (server state)
│   └── [feature]/      # Feature-specific hooks
├── service/            # Pure HTTP/WebSocket communication
│   ├── api/            # REST API services
│   └── websocket/      # WebSocket services
├── store/              # Zustand state management
│   └── slices/         # Feature-specific state slices
└── types/              # Global TypeScript definitions
```

**Frontend Layered Architecture:**
1. **Component Layer**: Pure UI rendering, no business logic
2. **Hook Layer**: Capability encapsulation, state subscription
3. **Core Layer** ⭐: Business logic, flow orchestration, side effects
4. **Service Layer**: HTTP/WebSocket requests only
5. **Store Layer**: Client-side UI state (Zustand)
6. **Query Layer**: Server state caching (TanStack Query)

## 3. Agent System

### 3.1 Agent Architecture

Xyzen uses a sophisticated agent system built on **LangGraph** for multi-agent workflows and state management.

#### Base Agent Patterns

**BaseBuiltinGraphAgent** - Abstract base for LangGraph agents:
```python
# service/app/agents/base_graph_agent.py
class BaseBuiltinGraphAgent(ABC):
    name: str
    description: str
    version: str
    capabilities: list[str]
    tags: list[str]

    @abstractmethod
    def build_graph(self) -> CompiledStateGraph:
        """Build and return the LangGraph StateGraph"""

    @abstractmethod
    def get_state_schema(self) -> dict[str, Any]:
        """Return the state schema for this agent"""
```

**BaseAgent** - Flexible execution patterns:
```python
# service/app/agents/base_agent.py
class BaseAgent(ABC):
    # Supports multiple execution modes:
    # - Simple: Single LLM call
    # - ReAct: Iterative LLM call with validation
    # - Parallel: Concurrent processing
    # - Graph: LangGraph-based tool calling

    async def execute(self, state: MainState, use_agent: bool = False) -> MainState:
        # Dynamic execution strategy selection
```

#### Agent Registration and Discovery

Agents are automatically discovered using `__init_subclass__`:
```python
class MyCustomAgent(BaseBuiltinGraphAgent):
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        # Automatic registration with agent registry
```

### 3.2 Agent Development Patterns

#### Creating New Agents

1. **Inherit from BaseBuiltinGraphAgent**:
```python
class DocumentProcessingAgent(BaseBuiltinGraphAgent):
    def __init__(self):
        super().__init__(
            name="Document Processing Agent",
            description="Advanced document processing capabilities",
            version="1.0.0",
            capabilities=["pdf-conversion", "analysis"],
            tags=["document", "processing"]
        )
```

2. **Define State Schema**:
```python
def get_state_schema(self) -> dict[str, Any]:
    return {
        "input_file": "File path or content to process",
        "processing_type": "Type of processing to perform",
        "progress": "Processing progress (0-100)",
        "results": "Processing results and outputs"
    }
```

3. **Build Graph Workflow**:
```python
def build_graph(self) -> CompiledStateGraph:
    workflow = StateGraph(MyState)

    # Add nodes
    workflow.add_node("analyze_input", self._analyze_input)
    workflow.add_node("process_data", self._process_data)
    workflow.add_node("format_output", self._format_output)

    # Define flow
    workflow.add_edge(START, "analyze_input")
    workflow.add_edge("analyze_input", "process_data")
    workflow.add_edge("process_data", "format_output")
    workflow.add_edge("format_output", END)

    return workflow.compile()
```

#### Execution Modes

**Simple Mode**: Direct LLM call with prompt template
**ReAct Mode**: Iterative reasoning with validation loops
**Parallel Mode**: Concurrent processing of multiple inputs
**Graph Mode**: Full LangGraph workflow execution

#### Agent-as-Tool Pattern
Agents can be used as tools within other agents:
```python
# Register agent as tool for use in other workflows
@tool
def document_processing_agent(input_data: str) -> str:
    """Process documents using the Document Processing Agent"""
    return agent.execute(input_data)
```

## 4. Real-Time Communication

### 4.1 WebSocket Architecture

Xyzen uses WebSocket-first architecture for real-time communication:

```python
# service/app/api/ws/v1/chat.py
class WebSocketManager:
    def __init__(self):
        self.connections: Dict[str, WebSocket] = {}
        self.redis_client = get_redis_client()

    async def connect(self, websocket: WebSocket, session_id: str):
        # Connection management with Redis pub/sub

    async def send_to_session(self, session_id: str, message: dict):
        # Real-time message delivery
```

**Key Features:**
- Connection lifecycle management
- Redis pub/sub for scalability
- Authentication integration
- Message routing and delivery
- Error handling and reconnection

### 4.2 WebSocket Message Types

**Standard Message Structure:**
```typescript
interface WebSocketMessage {
  type: string;
  data: any;
  session_id?: string;
  timestamp?: string;
  message_id?: string;
}
```

**Common Message Types:**
- `chat_message`: User chat messages
- `agent_response`: Agent responses
- `tool_call`: Tool execution messages
- `progress_update`: Real-time progress updates
- `file_upload`: File upload notifications
- `document_processing_*`: Document processing events

## 5. Chat & Messaging System

### 5.1 Message Architecture

The chat system supports rich message types with comprehensive metadata:

```python
# Backend message structure
class Message(SQLModel, table=True):
    id: str
    session_id: str
    user_id: str
    content: str
    message_type: MessageType
    attachments: Optional[List[dict]] = None
    metadata: Optional[dict] = None
    created_at: datetime
```

```typescript
// Frontend message structure
interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant' | 'system';
  type: MessageType;
  attachments?: Attachment[];
  metadata?: Record<string, any>;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
}
```

### 5.2 Message Processing Pipeline

1. **Input Validation**: Content, attachments, permissions
2. **Agent Routing**: Select appropriate agent for response
3. **Processing**: Execute agent workflow with real-time updates
4. **Response Generation**: Format and deliver agent response
5. **Storage**: Persist conversation history
6. **Notifications**: Real-time delivery to connected clients

### 5.3 Attachment Handling

Supports multiple attachment types:
- **Documents**: PDF, DOCX, PPTX with processing capabilities
- **Images**: With thumbnail generation and preview
- **Audio**: With transcription support
- **Code Files**: With syntax highlighting
- **Generated Files**: Agent-created content

## 6. File Processing & Storage

### 6.1 File Upload System

**Upload Flow:**
```python
# service/app/api/v1/files.py
@router.post("/upload")
async def upload_file(
    file: UploadFile,
    scope: str = FileScope.PRIVATE,
    category: str | None = None,
    user_id: str = Depends(get_current_user),
    storage: StorageServiceProto = Depends(get_storage_service)
):
    # 1. Validation (size, type, quota)
    # 2. Hash calculation
    # 3. Storage upload
    # 4. Database record creation
    # 5. Metadata extraction
```

**File Categories:**
- `images`: Image files with thumbnail generation
- `documents`: PDF, Office documents with conversion
- `audio`: Audio files with transcription
- `others`: General file category

### 6.2 Storage Architecture

**Storage Service Pattern:**
```python
class StorageServiceProto(Protocol):
    async def upload(self, file_data: bytes, key: str) -> str
    async def download(self, key: str) -> bytes
    async def delete(self, key: str) -> bool
    async def get_download_url(self, key: str) -> str
```

**Storage Implementations:**
- **LocalStorage**: Development environment
- **S3Storage**: Production object storage
- **MinIOStorage**: Self-hosted S3-compatible storage

### 6.3 File Processing Capabilities

**Document Conversion:**
- PDF generation from DOCX/XLSX/PPTX
- OCR text extraction
- Metadata extraction
- Preview generation

**Image Processing:**
- Thumbnail generation
- Format conversion
- Metadata extraction
- Preview optimization

**Audio Processing:**
- Transcription services
- Format conversion
- Metadata extraction

## 7. Database Patterns

### 7.1 No-Foreign-Key Architecture

**Philosophy**: Avoid rigid database constraints to maintain flexibility and scalability.

**Relationship Handling:**
```python
# Instead of foreign keys, use logical relationships
class User(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str

class Session(SQLModel, table=True):
    id: str = Field(primary_key=True)
    user_id: str  # Logical reference, not foreign key
    title: str

# Handle relationships in service layer
class SessionRepository:
    async def get_sessions_for_user(self, user_id: str) -> List[Session]:
        # Query sessions by user_id
        # Validate user existence in business logic
```

### 7.2 Repository Pattern

**Repository Structure:**
```python
class BaseRepository(Generic[T]):
    def __init__(self, session: AsyncSession, model: Type[T]):
        self.session = session
        self.model = model

    async def create(self, item: T) -> T:
        self.session.add(item)
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def get_by_id(self, id: str) -> T | None:
        return await self.session.get(self.model, id)

    async def update(self, item: T) -> T:
        self.session.add(item)
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def delete(self, id: str) -> bool:
        item = await self.get_by_id(id)
        if item:
            await self.session.delete(item)
            await self.session.commit()
            return True
        return False
```

**Specific Repositories:**
```python
class UserRepository(BaseRepository[User]):
    async def get_by_email(self, email: str) -> User | None:
        # Custom query methods

    async def get_active_users(self) -> List[User]:
        # Business-specific queries
```

### 7.3 Transaction Management

**Service Layer Transactions:**
```python
class ChatService:
    async def create_message_with_attachments(
        self,
        message_data: MessageCreate,
        attachments: List[FileCreate]
    ) -> Message:
        async with self.db.begin():
            # All operations in single transaction
            message = await self.message_repo.create(message_data)

            for attachment in attachments:
                attachment.message_id = message.id
                await self.file_repo.create(attachment)

            return message
```

## 8. Authentication & Security

### 8.1 Authentication System

**Casdoor Integration:**
```python
# service/app/middleware/auth.py
async def get_current_user(
    authorization: str | None = Header(None)
) -> str:
    if not authorization:
        raise HTTPException(401, "Authorization header missing")

    # Validate token with Casdoor
    user_info = await casdoor_client.parse_jwt_token(token)
    return user_info.user_id
```

**Token Management:**
- JWT-based authentication
- Token refresh mechanisms
- Session management
- Multi-provider support

### 8.2 Authorization Patterns

**Resource Access Control:**
```python
class FileService:
    async def get_file(self, file_id: str, user_id: str) -> File:
        file = await self.file_repo.get_by_id(file_id)

        # Authorization check
        if not self.can_access_file(file, user_id):
            raise HTTPException(403, "Access denied")

        return file

    def can_access_file(self, file: File, user_id: str) -> bool:
        # Public files accessible to all
        if file.scope == FileScope.PUBLIC:
            return True

        # Private files only for owner
        return file.user_id == user_id
```

**Permission Levels:**
- **Public**: Accessible to all users
- **Private**: User-specific access
- **Shared**: Group or team access
- **Generated**: System-generated content

## 9. MCP & Provider Integration

### 9.1 Model Context Protocol (MCP)

**MCP Server Management:**
```python
# service/app/mcp/__init__.py
class MCPManager:
    def __init__(self):
        self.servers: Dict[str, MCPServer] = {}
        self.tools: Dict[str, Tool] = {}

    async def register_server(self, server_config: MCPServerConfig):
        # Dynamic server registration
        server = await self.connect_to_server(server_config)
        self.servers[server_config.name] = server

        # Register available tools
        tools = await server.list_tools()
        for tool in tools:
            self.tools[f"{server_config.name}:{tool.name}"] = tool

    async def call_tool(self, tool_name: str, arguments: dict) -> dict:
        # Route tool calls to appropriate MCP server
```

**MCP Integration Features:**
- Automatic server discovery
- Dynamic tool registration
- Flexible routing and calling
- Authentication handling
- Error management and retries

### 9.2 Provider System

**LLM Provider Configuration:**
```python
# service/app/core/providers/
class ProviderManager:
    def __init__(self):
        self.providers: Dict[str, LLMProvider] = {}

    async def get_provider(self, provider_name: str) -> LLMProvider:
        # Provider selection and configuration

    async def call_llm(
        self,
        provider: str,
        messages: List[dict],
        **kwargs
    ) -> LLMResponse:
        # Unified LLM calling interface
```

**Supported Providers:**
- OpenAI (GPT-3.5, GPT-4, GPT-4o)
- Anthropic (Claude family)
- Google (Gemini)
- Local models (Ollama, vLLM)
- Custom providers via MCP

## 10. Testing Strategies

### 10.1 Testing Architecture

**Test Structure:**
```
tests/
├── unit/               # Pure logic tests
│   ├── test_agents/    # Agent logic testing
│   ├── test_services/  # Business logic testing
│   └── test_utils/     # Utility function testing
├── integration/        # System integration tests
│   ├── test_api/       # API endpoint testing
│   ├── test_db/        # Database integration testing
│   └── test_websocket/ # WebSocket testing
└── fixtures/           # Test data and mocks
```

**Testing Patterns:**

**Agent Testing:**
```python
@pytest.mark.asyncio
async def test_document_processing_agent():
    agent = DocumentProcessingAgent()

    # Test state schema
    schema = agent.get_state_schema()
    assert "input_file" in schema

    # Test graph building
    graph = agent.build_graph()
    assert graph is not None

    # Test execution
    initial_state = MyState(input_file="test.pdf")
    result = await graph.ainvoke(initial_state)
    assert result.status == "completed"
```

**WebSocket Testing:**
```python
@pytest.mark.asyncio
async def test_websocket_message_flow(websocket_client):
    # Connect to WebSocket
    async with websocket_client.websocket_connect("/ws/chat") as websocket:
        # Send message
        await websocket.send_json({"type": "chat_message", "content": "Hello"})

        # Receive response
        response = await websocket.receive_json()
        assert response["type"] == "agent_response"
```

### 10.2 Testing Best Practices

**Database Testing:**
```python
@pytest.fixture
async def db_session():
    # Create test database session
    async with AsyncSession(test_engine) as session:
        yield session
        await session.rollback()  # Rollback after test

@pytest.mark.asyncio
async def test_user_repository(db_session):
    repo = UserRepository(db_session)

    # Test create
    user = await repo.create(User(name="Test User"))
    assert user.id is not None

    # Test retrieve
    found_user = await repo.get_by_id(user.id)
    assert found_user.name == "Test User"
```

**API Testing:**
```python
@pytest.mark.asyncio
async def test_file_upload(async_client, auth_headers):
    # Test file upload endpoint
    files = {"file": ("test.txt", b"test content", "text/plain")}
    response = await async_client.post(
        "/api/v1/files/upload",
        files=files,
        headers=auth_headers
    )

    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["filename"] == "test.txt"
```

## 11. Configuration & Environment

### 11.1 Configuration Management

**Environment Variables:**
```python
# service/app/core/config.py
class Settings(BaseSettings):
    # Database
    DATABASE_URL: str

    # Authentication
    CASDOOR_ENDPOINT: str
    CASDOOR_CLIENT_ID: str

    # Storage
    STORAGE_TYPE: Literal["local", "s3", "minio"] = "local"
    S3_BUCKET: str | None = None

    # LLM Providers
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None

    # MCP Servers
    MCP_SERVERS: List[str] = []

    class Config:
        env_file = ".env"
```

**Configuration Hierarchy:**
1. Environment variables
2. `.env` file
3. Default values
4. Runtime overrides

### 11.2 Development Environment

**Docker Setup:**
```yaml
# docker-compose.yml
services:
  backend:
    build: ./service
    environment:
      - DATABASE_URL=postgresql://user:pass@db:5432/xyzen
      - REDIS_URL=redis://redis:6379/0

  frontend:
    build: ./web
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:8000

  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=xyzen

  redis:
    image: redis:7-alpine
```

**Development Commands:**
```bash
# Start development environment
./launch/dev.sh -d

# Backend commands
cd service
uv run pytest                    # Run tests
uv run pyright .                # Type checking

# Frontend commands
cd web
yarn dev                        # Start dev server
yarn lint                       # Linting
yarn type-check                 # Type checking
yarn test                       # Run tests
```

## 12. Development Workflows & Best Practices

### 12.1 Code Quality Guidelines

**Backend (Python):**
```python
# Use modern Python syntax
def process_data(items: list[dict[str, Any]]) -> list[ProcessedItem]:
    # Use list[T] instead of List[T]
    # Use dict[K, V] instead of Dict[K, V]
    # Use str | None instead of Optional[str]

# Async by default
async def fetch_data() -> DataResponse:
    # Prefer async operations
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        return response.json()

# Comprehensive error handling
try:
    result = await process_operation()
except ProcessingError as e:
    logger.error(f"Processing failed: {e}")
    raise HTTPException(500, f"Processing error: {str(e)}")
```

**Frontend (TypeScript):**
```typescript
// Strict typing
interface UserProfile {
  id: string;
  name: string;
  email: string;
  preferences?: UserPreferences;
}

// Component structure
export const UserProfileCard: React.FC<{
  user: UserProfile;
  onUpdate: (user: UserProfile) => void;
}> = ({ user, onUpdate }) => {
  // UI rendering only, no business logic
  return (
    <Card>
      <CardHeader>
        <CardTitle>{user.name}</CardTitle>
      </CardHeader>
    </Card>
  );
};

// Business logic in Core layer
// core/user/userManager.ts
export class UserManager {
  async updateUserProfile(
    userId: string,
    updates: Partial<UserProfile>
  ): Promise<UserProfile> {
    // Business logic and orchestration
  }
}
```
