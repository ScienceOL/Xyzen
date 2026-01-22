"""
Help content constants for knowledge tools.

Contains all help text and documentation for knowledge base operations.
"""

from __future__ import annotations

from typing import Any

KNOWLEDGE_HELP_OVERVIEW = """
# Knowledge Base Tools - Quick Reference

## Available Tools
- **knowledge_list**: List all files in your knowledge base
- **knowledge_read**: Read content from a file
- **knowledge_write**: Create or update files (supports rich documents)
- **knowledge_search**: Search files by name
- **knowledge_help**: Get detailed usage guides (this tool)

## Supported File Types
- **Documents**: PDF, DOCX, PPTX, XLSX
- **Data**: JSON, YAML, XML
- **Web**: HTML
- **Text**: TXT, MD, CSV

## Quick Start
1. Use `knowledge_list` to see available files
2. Use `knowledge_write` with plain text for simple files
3. Use `knowledge_write` with JSON spec for rich documents (call `knowledge_help` with topic='pptx' for examples)

## Creating Beautiful Presentations with AI Images
For stunning presentations with AI-generated slides:
1. Use `generate_image` to create each slide as an image (use 16:9 aspect ratio)
2. Collect the `image_id` values from each generation
3. Use `knowledge_write` with `mode: "image_slides"` to assemble into PPTX

Call `knowledge_help(topic='image_slides')` for detailed workflow and examples.

For detailed help on a specific topic, call knowledge_help with topic='pptx', 'pdf', 'xlsx', 'images', 'tables', 'image_slides', or 'all'.
"""

KNOWLEDGE_HELP_PPTX = """
# PPTX (PowerPoint) Generation Guide

## Basic Structure
```json
{
  "title": "Presentation Title",
  "author": "Author Name",
  "slides": [
    { "layout": "...", "title": "...", "content": [...] }
  ]
}
```

## Slide Layouts
- `title` - Title slide with title and subtitle
- `title_content` - Title with content area (most common)
- `section` - Section header
- `two_column` - Two column layout
- `comparison` - Side-by-side comparison
- `title_only` - Title without content placeholder
- `blank` - Empty slide

## Content Block Types

### Text
```json
{"type": "text", "content": "Your paragraph text here", "style": "normal"}
```
Styles: `normal`, `bold`, `italic`, `code`

### Heading
```json
{"type": "heading", "content": "Section Title", "level": 2}
```
Levels 1-6 (1 is largest)

### List
```json
{"type": "list", "items": ["Point 1", "Point 2", "Point 3"], "ordered": false}
```
Set `ordered: true` for numbered lists

### Table
```json
{
  "type": "table",
  "headers": ["Column 1", "Column 2", "Column 3"],
  "rows": [
    ["Row 1 A", "Row 1 B", "Row 1 C"],
    ["Row 2 A", "Row 2 B", "Row 2 C"]
  ]
}
```

### Image
```json
{
  "type": "image",
  "url": "https://example.com/chart.png",
  "caption": "Figure 1: Sales Chart",
  "width": 400
}
```
- `url`: HTTP URL, base64 data URL, or storage:// path
- `image_id`: UUID from generate_image tool (alternative to url)
- `caption`: Optional text below image
- `width`: Optional width in points (72 points = 1 inch)

## Complete Example
```json
{
  "title": "Q4 Business Review",
  "slides": [
    {
      "layout": "title",
      "title": "Q4 2024 Review",
      "subtitle": "Sales Department"
    },
    {
      "layout": "title_content",
      "title": "Revenue Summary",
      "content": [
        {"type": "heading", "content": "Key Metrics", "level": 2},
        {"type": "table", "headers": ["Region", "Q3", "Q4", "Growth"], "rows": [
          ["North America", "$1.2M", "$1.5M", "+25%"],
          ["Europe", "$800K", "$1.1M", "+37%"]
        ]},
        {"type": "text", "content": "All regions exceeded targets.", "style": "bold"}
      ],
      "notes": "Emphasize the European growth story"
    },
    {
      "layout": "title_content",
      "title": "Visual Analysis",
      "content": [
        {"type": "image", "url": "https://example.com/chart.png", "caption": "Revenue by Region"}
      ]
    }
  ]
}
```
"""

KNOWLEDGE_HELP_PDF_DOCX = """
# PDF/DOCX Generation Guide

## Basic Structure
```json
{
  "title": "Document Title",
  "author": "Author Name",
  "subject": "Document Subject",
  "page_size": "letter",
  "content": [...]
}
```

Page sizes: `letter`, `A4`, `legal`

## Content Block Types

### Heading
```json
{"type": "heading", "content": "Chapter Title", "level": 1}
```

### Text
```json
{"type": "text", "content": "Paragraph text here", "style": "normal"}
```
Styles: `normal`, `bold`, `italic`, `code`

### List
```json
{"type": "list", "items": ["Item 1", "Item 2"], "ordered": false}
```

### Table
```json
{
  "type": "table",
  "headers": ["Name", "Value"],
  "rows": [["Item A", "100"], ["Item B", "200"]]
}
```

### Page Break
```json
{"type": "page_break"}
```

## Example
```json
{
  "title": "Monthly Report",
  "author": "Analytics Team",
  "content": [
    {"type": "heading", "content": "Executive Summary", "level": 1},
    {"type": "text", "content": "This report covers..."},
    {"type": "heading", "content": "Key Findings", "level": 2},
    {"type": "list", "items": ["Revenue up 15%", "Costs down 8%"], "ordered": false},
    {"type": "page_break"},
    {"type": "heading", "content": "Detailed Analysis", "level": 1},
    {"type": "table", "headers": ["Metric", "Value"], "rows": [["Sales", "$1.5M"]]}
  ]
}
```
"""

KNOWLEDGE_HELP_XLSX = """
# XLSX (Excel) Generation Guide

## Basic Structure
```json
{
  "sheets": [
    {
      "name": "Sheet Name",
      "headers": ["Col1", "Col2"],
      "data": [[...], [...]],
      "freeze_header": true
    }
  ]
}
```

## Sheet Properties
- `name`: Sheet tab name
- `headers`: Optional column headers (styled with blue background)
- `data`: 2D array of cell values (strings, numbers, null)
- `freeze_header`: Freeze the header row for scrolling (default: true)

## Example: Multi-Sheet Workbook
```json
{
  "sheets": [
    {
      "name": "Sales Data",
      "headers": ["Product", "Q1", "Q2", "Q3", "Q4", "Total"],
      "data": [
        ["Widget A", 100, 150, 200, 250, 700],
        ["Widget B", 80, 90, 110, 130, 410],
        ["Widget C", 50, 60, 70, 80, 260]
      ],
      "freeze_header": true
    },
    {
      "name": "Summary",
      "headers": ["Metric", "Value"],
      "data": [
        ["Total Revenue", 1370],
        ["Average per Product", 456.67],
        ["Best Performer", "Widget A"]
      ]
    }
  ]
}
```
"""

KNOWLEDGE_HELP_IMAGES = """
# Image Embedding Guide

## Supported in PPTX Content Blocks

### Image Block Structure
```json
{
  "type": "image",
  "url": "...",
  "caption": "Optional caption text",
  "width": 400
}
```

## URL Formats

### HTTP/HTTPS URLs
```json
{"type": "image", "url": "https://example.com/chart.png"}
```

### Base64 Data URLs
```json
{"type": "image", "url": "data:image/png;base64,iVBORw0KGgo..."}
```

### Storage URLs (internal files)
```json
{"type": "image", "url": "storage://path/to/uploaded/image.png"}
```

### Generated Images (from generate_image tool)
```json
{"type": "image", "image_id": "abc-123-456-def"}
```

## Size Handling
- **Max file size**: 10MB
- **Max dimension**: 4096px (larger images auto-resized)
- **Width parameter**: Specify in points (72pt = 1 inch)
- **Aspect ratio**: Always preserved

## Example with Caption
```json
{
  "type": "image",
  "url": "https://example.com/quarterly-chart.png",
  "caption": "Figure 1: Quarterly Revenue Comparison",
  "width": 500
}
```

## Error Handling
If an image fails to load, a placeholder text will appear:
`[Image failed to load: <error message>]`
"""

KNOWLEDGE_HELP_TABLES = """
# Table Generation Guide

## Table Block Structure
```json
{
  "type": "table",
  "headers": ["Column 1", "Column 2", "Column 3"],
  "rows": [
    ["Row 1 Col 1", "Row 1 Col 2", "Row 1 Col 3"],
    ["Row 2 Col 1", "Row 2 Col 2", "Row 2 Col 3"]
  ]
}
```

## Supported In
- **PPTX**: Styled tables with blue headers
- **PDF**: Formatted tables with borders
- **DOCX**: Word tables with grid style

## Styling (Automatic)
- Header row: Blue background (#4472C4), white bold text, centered
- Data rows: Standard formatting, left-aligned
- Borders: Thin black borders on all cells

## Example: Data Table
```json
{
  "type": "table",
  "headers": ["Product", "Price", "Stock", "Status"],
  "rows": [
    ["Laptop Pro", "$1,299", "45", "In Stock"],
    ["Tablet Air", "$799", "120", "In Stock"],
    ["Phone Max", "$999", "0", "Out of Stock"],
    ["Watch SE", "$249", "200", "In Stock"]
  ]
}
```

## Tips
- Keep tables simple (avoid merged cells - not supported)
- Use consistent data types per column
- Header count must match row column count
- Empty cells: use empty string ""
"""

KNOWLEDGE_HELP_IMAGE_SLIDES = """
# Creating Beautiful Presentations with AI-Generated Slides

## Overview
Instead of using structured content blocks, you can create stunning presentations
by generating each slide as an AI image. This gives full creative control over
typography, layout, colors, and visual effects.

## Step-by-Step Workflow

### Step 1: Generate Slide Images
Use the `generate_image` tool for each slide:

```
generate_image(
    prompt="Professional presentation slide with title 'Q4 Revenue Summary' showing a blue gradient background, large white bold text, and a subtle upward trending graph icon. Clean corporate style, 16:9 aspect ratio.",
    aspect_ratio="16:9"
)
```

### Step 2: Collect Image IDs
Each `generate_image` call returns an `image_id`. Save these:
- Slide 1: "abc-123-..."
- Slide 2: "def-456-..."
- etc.

### Step 3: Create PPTX
Use `knowledge_write` with image_slides mode:

```json
{
  "mode": "image_slides",
  "title": "Q4 Business Review",
  "author": "Sales Team",
  "image_slides": [
    {"image_id": "abc-123-...", "notes": "Opening remarks"},
    {"image_id": "def-456-...", "notes": "Highlight 25% growth"},
    {"image_id": "ghi-789-...", "notes": "Thank the team"}
  ]
}
```

## Prompting Tips for Consistent Style

1. **Define a style template** and reference it in each prompt:
   - "Corporate blue theme (#1a73e8), white text, clean minimal layout"

2. **Specify slide type** in prompts:
   - "Title slide" / "Content slide" / "Section divider" / "Closing slide"

3. **Include aspect ratio**:
   - Always use "16:9 aspect ratio presentation slide"

4. **Maintain visual consistency**:
   - "Matching the style of previous slides in this presentation"

## Complete Example

```python
# Agent generates beautiful slides
slide1 = await generate_image(
    prompt="Title slide: 'Q4 Business Review 2024' with dark blue gradient,
            large white text centered, subtle geometric patterns,
            professional corporate style, 16:9 presentation slide"
)

slide2 = await generate_image(
    prompt="Content slide: 'Revenue Growth +25%' with bar chart visualization,
            blue color scheme matching previous slide, clean data presentation,
            16:9 presentation slide"
)

slide3 = await generate_image(
    prompt="Closing slide: 'Thank You' with contact information,
            matching corporate blue theme, 16:9 presentation slide"
)

# Agent assembles into PPTX
await knowledge_write(
    filename="Q4-Review.pptx",
    content=json.dumps({
        "mode": "image_slides",
        "title": "Q4 Business Review",
        "image_slides": [
            {"image_id": slide1["image_id"], "notes": "Welcome everyone"},
            {"image_id": slide2["image_id"], "notes": "Emphasize growth"},
            {"image_id": slide3["image_id"], "notes": "Q&A time"}
        ]
    })
)
```

## Limitations
- Text in images is NOT editable in PowerPoint
- Best for final presentations, not drafts requiring edits
- Larger file sizes than structured content
"""


def get_help_content(topic: str | None) -> dict[str, Any]:
    """Get help content for the specified topic."""
    topic_map = {
        "pptx": KNOWLEDGE_HELP_PPTX,
        "powerpoint": KNOWLEDGE_HELP_PPTX,
        "pdf": KNOWLEDGE_HELP_PDF_DOCX,
        "docx": KNOWLEDGE_HELP_PDF_DOCX,
        "word": KNOWLEDGE_HELP_PDF_DOCX,
        "xlsx": KNOWLEDGE_HELP_XLSX,
        "excel": KNOWLEDGE_HELP_XLSX,
        "images": KNOWLEDGE_HELP_IMAGES,
        "image": KNOWLEDGE_HELP_IMAGES,
        "tables": KNOWLEDGE_HELP_TABLES,
        "table": KNOWLEDGE_HELP_TABLES,
        "image_slides": KNOWLEDGE_HELP_IMAGE_SLIDES,
        "imageslides": KNOWLEDGE_HELP_IMAGE_SLIDES,
    }

    if topic is None:
        return {"success": True, "content": KNOWLEDGE_HELP_OVERVIEW}

    topic_lower = topic.lower().strip()

    if topic_lower == "all":
        all_content = (
            KNOWLEDGE_HELP_OVERVIEW
            + "\n\n---\n\n"
            + KNOWLEDGE_HELP_PPTX
            + "\n\n---\n\n"
            + KNOWLEDGE_HELP_PDF_DOCX
            + "\n\n---\n\n"
            + KNOWLEDGE_HELP_XLSX
            + "\n\n---\n\n"
            + KNOWLEDGE_HELP_IMAGES
            + "\n\n---\n\n"
            + KNOWLEDGE_HELP_TABLES
            + "\n\n---\n\n"
            + KNOWLEDGE_HELP_IMAGE_SLIDES
        )
        return {"success": True, "content": all_content}

    if topic_lower in topic_map:
        return {"success": True, "content": topic_map[topic_lower]}

    return {
        "success": False,
        "error": f"Unknown topic: {topic}. Available topics: pptx, pdf, docx, xlsx, images, tables, image_slides, all",
    }


__all__ = [
    "KNOWLEDGE_HELP_OVERVIEW",
    "KNOWLEDGE_HELP_PPTX",
    "KNOWLEDGE_HELP_PDF_DOCX",
    "KNOWLEDGE_HELP_XLSX",
    "KNOWLEDGE_HELP_IMAGES",
    "KNOWLEDGE_HELP_TABLES",
    "KNOWLEDGE_HELP_IMAGE_SLIDES",
    "get_help_content",
]
