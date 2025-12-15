# Plan for Implementing Knowledge Features

## Summary of Current Progress (Previous Chat)

We have successfully implemented the **Knowledge Base (File System)** for Xyzen.

### Backend (`service/`)
*   **Models:** Created `Folder` model and updated `File` model with `folder_id`.
*   **Repository:** Implemented `FolderRepository` with support for recursive hard delete, path retrieval, and circular move prevention.
*   **API:** Created `folders.py` API endpoints (CRUD, path) and updated `files.py` to support folder operations.
*   **Stability:** Fixed critical logic bugs like circular moves and incomplete trash deletions.

### Frontend (`web/`)
*   **Service:** Implemented `folderService.ts` and updated `fileService.ts`.
*   **UI Components:**
    *   **Sidebar:** Dynamic "Knowledge" section listing root folders with a creation button.
    *   **FileList:** Supports mixed file/folder view, navigation, context menus, and drag-and-drop preparations.
    *   **Toolbar:** Breadcrumb navigation and action buttons.
    *   **Modals:** "Move to..." modal for organizing files.
*   **UX:** Implemented "My Files" as the root view, removed complex history stack for reliability, and ensured Trash management works for both files and folders.

---

## Next Steps: Full Knowledge Integration

The goal is to allow AI Agents to **access and manipulate** this Knowledge Base. This involves exposing the file system via MCP (Model Context Protocol) and allowing users to select a specific knowledge context (folder) in the Chat UI.

### 1. Backend Implementation: `knowledge_mcp`

We need to create a new MCP server that exposes file system capabilities to the Agent.

*   **Location:** `service/handler/mcp/knowledge.py`
*   **Core Tools to Implement:**
    1.  `list_files(folder_path: str = "/")`: Lists files and subfolders in a given path (virtual path based on folder names).
    2.  `read_file(file_path: str)`: Reads text content of a file.
    3.  `write_file(file_path: str, content: str)`: Creates or overwrites a file (handles folder creation if missing?). *Note: Writing might be restricted or require confirmation.*
    4.  `create_folder(folder_path: str)`: Creates a new folder.
    5.  `search_files(query: str)`: Semantic or keyword search (if vector store is ready, otherwise SQL `LIKE`).
*   **Virtual Path System:** Since the DB uses UUIDs but Agents understand paths (e.g., `/project/docs/readme.md`), we need a helper to resolve paths to UUIDs.
    *   *Challenge:* Duplicate folder names in the same parent allowed? Ideally no, to make paths unique.
    *   *Resolution:* Implement a path resolver helper in `FolderRepository` or within the MCP tool logic.

### 2. Frontend Implementation: Context Selection

The user needs to tell the Agent *which* knowledge base (folder) to focus on.

*   **Component:** `web/src/components/layouts/components/ChatToolbar.tsx`
*   **UI Change:**
    *   Add a **"Knowledge Context"** dropdown/selector next to the Model selector.
    *   It should list **Root Folders** (from `folderService.listFolders(null)`).
    *   Optionally allow selecting "All Knowledge" or specific subfolders (maybe too complex for a dropdown, sticking to Root Folders/Projects is best).
*   **State:**
    *   Store the selected `folderId` in the Chat Session context (or pass it as a hidden system prompt/context injection to the Agent).
    *   When a folder is selected, the Agent's system prompt is augmented with: *"You have access to the files in the '{FolderName}' directory. Use the knowledge tools to read them."*

### 3. Integration Logic

*   **Context Injection:**
    *   When the user sends a message with a selected Knowledge Folder, the Backend needs to know this scope.
    *   The `knowledge_mcp` tools needs to be "scoped" to that folder? Or the Agent just receives the root path as context?
    *   *Approach:* The Agent receives the `root_folder_id` in the context. The `knowledge_mcp` might need to check permissions or be initialized with this scope. Alternatively, the path resolver simply limits access to that tree.

### 4. Future Considerations (Not for this immediate step but relevant)
*   **RAG (Retrieval Augmented Generation):** Simply reading files is slow. Future steps will involve vectorizing the files in the Knowledge Base for semantic search.
*   **File Types:** Handling non-text files (PDFs, Images) via MCP (using OCR or multimodal models).

---

## Detailed Plan for Next Chat

1.  **Create `service/handler/mcp/knowledge.py`:**
    *   Initialize `FastMCP("Knowledge 🧠")`.
    *   Implement path resolution logic (Path string <-> DB UUIDs).
    *   Implement `list`, `read`, `write` tools using `FileRepository` and `FolderRepository`.
2.  **Update `ChatToolbar.tsx`:**
    *   Fetch root folders.
    *   Add the selector UI.
    *   Update the `useChat` or session state to include `knowledge_context`.
3.  **Wire it up:**
    *   Ensure the Agent receives the context instructions.

This plan provides a solid foundation for "Chat with your Data" capabilities.
