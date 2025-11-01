# API 响应示例配置指南

本文档说明如何为 FastAPI 端点添加成功和失败的响应示例。

## 基本模式

### 1. 定义响应模型

首先创建 Pydantic 模型来定义响应结构：

```python
from pydantic import BaseModel, Field

class SuccessResponse(BaseModel):
    """成功响应模型"""
    status: str = Field(..., description="状态", examples=["success"])
    data: dict = Field(..., description="返回数据")

    class Config:
        json_schema_extra = {
            "examples": [
                {
                    "status": "success",
                    "data": {"id": "123", "name": "example"}
                }
            ]
        }
```

### 2. 使用 responses 参数

在路由装饰器中添加 `responses` 参数：

```python
@router.get(
    "/example",
    response_model=SuccessResponse,
    responses={
        200: {
            "description": "成功获取数据",
            "content": {
                "application/json": {
                    "examples": {
                        "success": {
                            "summary": "成功示例",
                            "value": {
                                "status": "success",
                                "data": {"id": "123", "name": "example"}
                            }
                        }
                    }
                }
            }
        },
        404: {
            "description": "资源未找到",
            "content": {
                "application/json": {
                    "examples": {
                        "not_found": {
                            "summary": "资源不存在",
                            "value": {
                                "detail": "Resource not found"
                            }
                        }
                    }
                }
            }
        },
        403: {
            "description": "访问被拒绝",
            "content": {
                "application/json": {
                    "examples": {
                        "forbidden": {
                            "summary": "权限不足",
                            "value": {
                                "detail": "Access denied"
                            }
                        }
                    }
                }
            }
        },
        500: {
            "description": "服务器错误",
            "content": {
                "application/json": {
                    "examples": {
                        "server_error": {
                            "summary": "内部错误",
                            "value": {
                                "detail": "Internal server error"
                            }
                        }
                    }
                }
            }
        }
    },
    summary="获取示例数据",
    description="详细的端点描述"
)
async def get_example():
    return SuccessResponse(status="success", data={"id": "123", "name": "example"})
```

## 常见响应状态码

### 成功响应 (2xx)

- **200 OK**: 请求成功
- **201 Created**: 资源创建成功
- **204 No Content**: 成功但无返回内容（删除操作）

### 客户端错误 (4xx)

- **400 Bad Request**: 请求参数错误
- **401 Unauthorized**: 未认证
- **403 Forbidden**: 无权限访问
- **404 Not Found**: 资源不存在
- **409 Conflict**: 资源冲突（如重复创建）
- **422 Unprocessable Entity**: 验证错误

### 服务器错误 (5xx)

- **500 Internal Server Error**: 服务器内部错误
- **503 Service Unavailable**: 服务不可用

## 完整示例

### GET 端点示例

```python
from typing import List
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter()

class Item(BaseModel):
    id: UUID = Field(..., description="项目ID")
    name: str = Field(..., description="项目名称")
    description: str | None = Field(None, description="项目描述")

class ItemListResponse(BaseModel):
    items: List[Item] = Field(..., description="项目列表")
    total: int = Field(..., description="总数")

@router.get(
    "/items",
    response_model=ItemListResponse,
    responses={
        200: {
            "description": "成功获取项目列表",
            "content": {
                "application/json": {
                    "examples": {
                        "with_items": {
                            "summary": "有数据",
                            "value": {
                                "items": [
                                    {
                                        "id": "123e4567-e89b-12d3-a456-426614174000",
                                        "name": "Item 1",
                                        "description": "First item"
                                    }
                                ],
                                "total": 1
                            }
                        },
                        "empty": {
                            "summary": "空列表",
                            "value": {
                                "items": [],
                                "total": 0
                            }
                        }
                    }
                }
            }
        },
        401: {
            "description": "未认证",
            "content": {
                "application/json": {
                    "examples": {
                        "unauthorized": {
                            "summary": "未登录",
                            "value": {"detail": "Not authenticated"}
                        }
                    }
                }
            }
        }
    },
    summary="获取项目列表",
    description="获取当前用户的所有项目"
)
async def get_items() -> ItemListResponse:
    # 实现逻辑
    pass
```

### POST 端点示例

```python
class ItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="项目名称")
    description: str | None = Field(None, max_length=500, description="项目描述")

@router.post(
    "/items",
    response_model=Item,
    status_code=201,
    responses={
        201: {
            "description": "项目创建成功",
            "content": {
                "application/json": {
                    "examples": {
                        "created": {
                            "summary": "创建成功",
                            "value": {
                                "id": "123e4567-e89b-12d3-a456-426614174000",
                                "name": "New Item",
                                "description": "A new item"
                            }
                        }
                    }
                }
            }
        },
        400: {
            "description": "请求参数错误",
            "content": {
                "application/json": {
                    "examples": {
                        "invalid_name": {
                            "summary": "名称无效",
                            "value": {
                                "detail": "Name is required and must be between 1 and 100 characters"
                            }
                        }
                    }
                }
            }
        },
        409: {
            "description": "项目已存在",
            "content": {
                "application/json": {
                    "examples": {
                        "duplicate": {
                            "summary": "重复创建",
                            "value": {
                                "detail": "Item with this name already exists"
                            }
                        }
                    }
                }
            }
        }
    },
    summary="创建新项目",
    description="为当前用户创建一个新项目"
)
async def create_item(item_data: ItemCreate) -> Item:
    # 实现逻辑
    pass
```

### PATCH 端点示例

```python
class ItemUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)

@router.patch(
    "/items/{item_id}",
    response_model=Item,
    responses={
        200: {
            "description": "更新成功",
            "content": {
                "application/json": {
                    "examples": {
                        "updated": {
                            "summary": "更新成功",
                            "value": {
                                "id": "123e4567-e89b-12d3-a456-426614174000",
                                "name": "Updated Item",
                                "description": "Updated description"
                            }
                        }
                    }
                }
            }
        },
        404: {
            "description": "项目不存在",
            "content": {
                "application/json": {
                    "examples": {
                        "not_found": {
                            "summary": "找不到项目",
                            "value": {"detail": "Item not found"}
                        }
                    }
                }
            }
        },
        403: {
            "description": "无权限修改",
            "content": {
                "application/json": {
                    "examples": {
                        "forbidden": {
                            "summary": "权限不足",
                            "value": {"detail": "You don't have permission to update this item"}
                        }
                    }
                }
            }
        }
    },
    summary="更新项目",
    description="更新指定项目的信息"
)
async def update_item(item_id: UUID, item_data: ItemUpdate) -> Item:
    # 实现逻辑
    pass
```

### DELETE 端点示例

```python
@router.delete(
    "/items/{item_id}",
    status_code=204,
    responses={
        204: {
            "description": "删除成功，无返回内容"
        },
        404: {
            "description": "项目不存在",
            "content": {
                "application/json": {
                    "examples": {
                        "not_found": {
                            "summary": "找不到项目",
                            "value": {"detail": "Item not found"}
                        }
                    }
                }
            }
        },
        403: {
            "description": "无权限删除",
            "content": {
                "application/json": {
                    "examples": {
                        "forbidden": {
                            "summary": "权限不足",
                            "value": {"detail": "You don't have permission to delete this item"}
                        }
                    }
                }
            }
        }
    },
    summary="删除项目",
    description="删除指定的项目"
)
async def delete_item(item_id: UUID) -> None:
    # 实现逻辑
    pass
```

## 多个成功示例

有时同一个端点可能返回不同格式的成功响应：

```python
@router.get(
    "/items/{item_id}",
    response_model=Item,
    responses={
        200: {
            "description": "成功获取项目",
            "content": {
                "application/json": {
                    "examples": {
                        "with_description": {
                            "summary": "包含描述",
                            "value": {
                                "id": "123e4567-e89b-12d3-a456-426614174000",
                                "name": "Item 1",
                                "description": "This is a detailed description"
                            }
                        },
                        "without_description": {
                            "summary": "无描述",
                            "value": {
                                "id": "123e4567-e89b-12d3-a456-426614174000",
                                "name": "Item 1",
                                "description": null
                            }
                        }
                    }
                }
            }
        }
    }
)
async def get_item(item_id: UUID) -> Item:
    pass
```

## 使用 OpenAPI 额外字段

还可以在响应模型中添加更多元数据：

```python
class DetailedResponse(BaseModel):
    status: str
    data: dict

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "status": "success",
                    "data": {"key": "value"}
                }
            ]
        }
    }
```

## 最佳实践

1. **始终定义响应模型**: 使用 Pydantic 模型而不是 `dict`
2. **提供多个示例**: 展示成功、失败、边界情况
3. **添加描述**: 为每个响应状态码和示例添加清晰的描述
4. **使用有意义的 summary**: 让开发者快速理解示例的场景
5. **保持一致性**: 在整个项目中使用相同的错误响应格式
6. **文档化所有可能的错误**: 包括认证、授权、验证错误等

## 工具和验证

访问 Swagger UI 查看效果：

- 本地: http://localhost:48196/xyzen/api/docs
- 线上: https://chat.sciol.ac.cn/xyzen/api/docs

每个端点会显示：

- 所有可能的响应状态码
- 每个状态码的示例
- 请求/响应的 schema
- 可交互的测试界面
