import type { FileTreeItem } from "@/service/folderService";
import type { FlattenedItem, TreeItem } from "./types";

export const INDENTATION_WIDTH = 24;

// ---------------------------------------------------------------------------
// Column width constants (shared between header and rows)
// ---------------------------------------------------------------------------

export const COL_DATE_WIDTH = "w-28"; // 112px
export const COL_SIZE_WIDTH = "w-20"; // 80px

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SortMode = "name" | "modified" | "size";
export type SortDirection = "asc" | "desc";

/**
 * Sort children within a folder: folders first, then files.
 * Within each group, apply the requested sort mode & direction.
 */
export function sortChildren(
  children: TreeItem[],
  mode: SortMode = "name",
  direction: SortDirection = "asc",
): TreeItem[] {
  const folders = children.filter((c) => c.type === "folder");
  const files = children.filter((c) => c.type !== "folder");

  const cmp = (a: TreeItem, b: TreeItem): number => {
    let result: number;
    switch (mode) {
      case "modified": {
        const aTime = a.updatedAt ?? a.name;
        const bTime = b.updatedAt ?? b.name;
        result = aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
        break;
      }
      case "size": {
        const aSize = a.fileSize ?? -1; // folders get -1 → sort first
        const bSize = b.fileSize ?? -1;
        result = aSize - bSize;
        break;
      }
      default: // "name"
        result = a.name.localeCompare(b.name, undefined, {
          sensitivity: "base",
          numeric: true,
        });
    }
    return direction === "desc" ? -result : result;
  };

  return [...folders.sort(cmp), ...files.sort(cmp)];
}

/**
 * Recursively sort all children in a tree.
 */
export function sortTree(
  items: TreeItem[],
  mode: SortMode = "name",
  direction: SortDirection = "asc",
): TreeItem[] {
  return sortChildren(items, mode, direction).map((item) => ({
    ...item,
    children:
      item.children.length > 0
        ? sortTree(item.children, mode, direction)
        : item.children,
  }));
}

// ---------------------------------------------------------------------------
// Build nested tree from a flat API response
// ---------------------------------------------------------------------------

/**
 * Convert the flat list from GET /folders/tree into a nested TreeItem[].
 * Children are auto-sorted using the given sort mode (default: name asc).
 */
export function buildTreeFromFlat(
  items: FileTreeItem[],
  mode: SortMode = "name",
  direction: SortDirection = "asc",
): TreeItem[] {
  const map = new Map<string, TreeItem>();
  const roots: TreeItem[] = [];

  // First pass: create all nodes
  for (const item of items) {
    map.set(item.id, {
      id: item.id,
      name: item.name,
      type: item.is_dir ? "folder" : "file",
      children: [],
      collapsed: item.is_dir ? true : undefined,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      fileSize: item.file_size,
      contentType: item.content_type,
      // Construct lightweight Folder / FileUploadResponse-compatible objects
      // so the rest of the UI (context menus, double-click, etc.) works.
      ...(item.is_dir
        ? {
            folder: {
              id: item.id,
              user_id: "",
              parent_id: item.parent_id,
              name: item.name,
              is_deleted: false,
              created_at: item.created_at,
              updated_at: item.updated_at,
            },
          }
        : {
            file: {
              id: item.id,
              user_id: "",
              storage_key: null,
              original_filename: item.name,
              content_type: item.content_type,
              file_size: item.file_size,
              scope: "private",
              category: "others",
              file_hash: null,
              metainfo: null,
              is_deleted: false,
              is_dir: false,
              parent_id: item.parent_id,
              message_id: null,
              status: "confirmed" as const,
              created_at: item.created_at,
              updated_at: item.updated_at,
              deleted_at: null,
            },
          }),
    });
  }

  // Second pass: wire parent → children
  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort the entire tree
  return sortTree(roots, mode, direction);
}

// ---------------------------------------------------------------------------
// Flatten
// ---------------------------------------------------------------------------

/**
 * Flatten a nested tree into a flat list, skipping children of collapsed
 * folders. Used for rendering the visible tree.
 */
export function flattenTree(
  items: TreeItem[],
  parentId: string | null = null,
  depth = 0,
): FlattenedItem[] {
  return items.reduce<FlattenedItem[]>((acc, item, index) => {
    acc.push({ ...item, parentId, depth, index });
    if (item.children.length > 0 && !item.collapsed) {
      acc.push(...flattenTree(item.children, item.id, depth + 1));
    }
    return acc;
  }, []);
}

// ---------------------------------------------------------------------------
// Tree manipulation helpers
// ---------------------------------------------------------------------------

/** Set a property on a tree item found by ID (recursive). */
export function setProperty<K extends keyof TreeItem>(
  items: TreeItem[],
  id: string,
  property: K,
  setter: (value: TreeItem[K]) => TreeItem[K],
): TreeItem[] {
  return items.map((item) => {
    if (item.id === id) {
      return { ...item, [property]: setter(item[property]) };
    }
    if (item.children.length > 0) {
      return {
        ...item,
        children: setProperty(item.children, id, property, setter),
      };
    }
    return item;
  });
}

/** Recursively count all descendants of an item. */
export function getChildCount(items: TreeItem[], id: string): number {
  const item = findItemDeep(items, id);
  if (!item) return 0;
  return item.children.reduce(
    (count, child) => count + 1 + getChildCount(child.children, child.id),
    0,
  );
}

/** Find an item by ID in a nested tree. */
export function findItemDeep(
  items: TreeItem[],
  id: string,
): TreeItem | undefined {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children.length > 0) {
      const found = findItemDeep(item.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Remove an item from the tree by ID and return the updated tree.
 */
export function removeItem(items: TreeItem[], id: string): TreeItem[] {
  return items
    .filter((item) => item.id !== id)
    .map((item) => ({
      ...item,
      children:
        item.children.length > 0
          ? removeItem(item.children, id)
          : item.children,
    }));
}

/**
 * Insert an item into a folder's children (or root if parentId is null).
 * Used for optimistic updates when dragging items between folders.
 */
export function insertItem(
  items: TreeItem[],
  item: TreeItem,
  parentId: string | null,
  mode: SortMode = "name",
  direction: SortDirection = "asc",
): TreeItem[] {
  if (parentId === null) {
    // Insert at root level, re-sort
    return sortChildren([...items, item], mode, direction);
  }

  return items.map((node) => {
    if (node.id === parentId) {
      return {
        ...node,
        children: sortChildren([...node.children, item], mode, direction),
      };
    }
    if (node.children.length > 0) {
      return {
        ...node,
        children: insertItem(node.children, item, parentId, mode, direction),
      };
    }
    return node;
  });
}

/**
 * Format a file size in bytes to a human-readable string.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "--";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const size = bytes / Math.pow(1024, i);
  return `${size >= 10 ? Math.round(size) : size.toFixed(1)} ${units[i]}`;
}

/**
 * Format an ISO date string to a short human-readable form.
 */
export function formatDate(iso: string | undefined): string {
  if (!iso) return "--";
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const isThisYear = d.getFullYear() === now.getFullYear();

  if (isToday) {
    return d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (isThisYear) {
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
