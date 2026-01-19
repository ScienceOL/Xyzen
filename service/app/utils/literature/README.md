# Literature MCP - 学术文献搜索服务

多数据源学术文献搜索MCP服务，支持OpenAlex等数据源，提供统一的搜索接口和高级过滤功能。

## 功能特性

-  **多数据源支持**：当前支持OpenAlex，架构支持扩展更多数据源
-  **高级过滤**：按作者、机构、期刊、年份、作品类型、语言等多维度筛选
-  **质量筛选**：过滤撤回论文、要求摘要/全文可用
-  **智能去重**：基于DOI的智能去重，优先保留高引用、新发表的版本
-  **最佳实践**：严格遵循OpenAlex官方API指南的最佳实践
-  **增强错误提示**：名称解析失败时提供详细建议，帮助LLM自我修正
-  **Token优化**：默认不包含摘要，可选开关，大幅降低token消耗（节省69%）
-  **防无限调用**：在返回中包含"Next Steps Guide"，引导LLM合理使用
-  **指数退避重试**：处理速率限制、超时等错误
-  **格式化输出**：返回简洁总结 + 完整JSON文献列表 + 操作建议

## 快速开始

### 使用MCP工具

**重要**: 所有工具调用都需要提供 `mailto` 参数（您的邮箱地址），这样可以获得OpenAlex的polite pool访问权限（10倍速率限制）。

#### 1. 基础搜索

```python
search_literature(
    query="machine learning",
    mailto="your-email@example.com",
    include_abstract=False
)
```

#### 2. 高级过滤 - 按作品类型和作者

```python
search_literature(
    query="CRISPR gene editing",
    mailto="your-email@example.com",
    author="Jennifer Doudna",
    work_type="article",
    year_from="2020",
    is_oa="true",
    sort_by="cited_by_count",
    max_results=100
)
```

#### 3. 综述文献检索 - 按语言和质量

```python
search_literature(
    query="cancer immunotherapy",
    mailto="your-email@example.com",
    work_type="review",
    language="en",
    is_retracted="false",
    has_abstract="true",
    year_from="2020",
    sort_by="cited_by_count"
)
```

#### 4. 多维度搜索 - 机构和期刊

```python
search_literature(
    query="climate change",
    mailto="your-email@example.com",
    institution="Harvard University",
    source="Nature",
    year_from="2023",
    year_to="2024"
)
```

#### 5. 全文可用的研究论文

```python
search_literature(
    query="deep learning applications",
    mailto="your-email@example.com",
    work_type="article",
    has_fulltext="true",
    has_abstract="true",
    is_retracted="false"
)
```

#### 6. 按DOI获取单篇文献

```python
get_work_by_doi(
    doi="10.1038/nature12345",
    mailto="your-email@example.com"
)
```

## 筛选参数参考

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `query` | string | **必需** - 搜索关键词 | "machine learning" |
| `mailto` | string | **必需** - 邮箱地址 | "user@example.com" |
| `author` | string | 作者名 | "Albert Einstein" |
| `institution` | string | 机构名 | "MIT" |
| `source` | string | 期刊/会议名 | "Nature" |
| `year_from` | string/int | 开始年份 | "2020" |
| `year_to` | string/int | 结束年份 | "2024" |
| `is_oa` | string | 开放获取 | "true"/"false" |
| `work_type` | string | 作品类型 | "article"/"review"/"preprint"/"book" |
| `language` | string | 语言代码 | "en"/"zh"/"fr" |
| `is_retracted` | string | 撤回状态 | "true"/"false" |
| `has_abstract` | string | 有摘要 | "true"/"false" |
| `has_fulltext` | string | 有全文 | "true"/"false" |
| `sort_by` | string | 排序方式 | "relevance"/"cited_by_count"/"publication_date" |
| `max_results` | string/int | 最大结果数 | "50"/"100" |
| `include_abstract` | string/bool | 包含摘要 | "true"/"false" |

### 作品类型 (work_type)

- `article` - 研究文章（期刊/会议论文）
- `review` - 综述文章
- `preprint` - 预印本
- `book` - 书籍
- `dissertation` - 学位论文
- `letter` - 信件
- `editorial` - 社论
- `erratum` - 勘误

### 语言代码示例 (language)

- `en` - 英文
- `zh` - 中文
- `ja` - 日文
- `fr` - 法文
- `de` - 德文
- `es` - 西班牙文

## 核心特性

### 1. 参数类型转换

由于LLM工具调用通常返回字符串参数，本实现在MCP层自动处理类型转换，支持字符串和原生类型混用。

### 2. 智能去重 (DOI-based)

多个数据源可能返回同一篇论文，本实现根据DOI去重，并优先保留高引用数、最新发表、有摘要的版本。

### 3. 名称智能解析

对于作者、机构、期刊采用两步查询：先搜索获取ID，再用ID进行高效过滤，失败时提供详细建议。

## OpenAlex最佳实践

本实现严格遵循 [OpenAlex API Guide for LLMs](https://docs.openalex.org/api-guide-for-llms)：

###  已实现

- 名称解析和详细反馈
- 速率限制与`mailto`参数的polite pool（10 req/s）
- 指数退避重试处理（最多5次）
- 最大页面大小`per-page=200`减少API调用
- 摘要重建（从`abstract_inverted_index`）
- 批量查询支持（管道符`|`）

###  避免的错误模式

-  使用随机page采样   使用`sample`参数
-  直接用名称过滤   先获取ID再过滤
-  默认页面大小   使用`per-page=200`
-  不处理速率限制   指数退避重试

## 使用建议

###  最佳实践

1. 从简单开始：`search_literature(query="...", mailto="...")`
2. 逐步添加过滤器以优化结果
3. 检查返回的"Next Steps Guide"获取指导
4. 理性使用摘要（仅在需要时启用）

###  避免的模式

1.  频繁搜索相同或相似查询
2.  不检查返回错误提示就重新搜索
3.  总是包含摘要（浪费token）
4.  一次获取太多结果（>200）

## 相关文档

- [OpenAlex API官方文档](https://docs.openalex.org/)
- [OpenAlex API指南（针对LLM）](https://docs.openalex.org/api-guide-for-llms)
- [Works API过滤器](https://docs.openalex.org/api-entities/works/filter-works)
