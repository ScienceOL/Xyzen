import type { FileUploadResponse } from "@/service/fileService";
import type { Folder } from "@/service/folderService";

/** A node in the nested tree. */
export interface TreeItem {
  id: string;
  name: string;
  type: "folder" | "file";
  children: TreeItem[];
  collapsed?: boolean;
  /** ISO timestamp strings from the backend */
  createdAt?: string;
  updatedAt?: string;
  /** File metadata */
  fileSize?: number;
  contentType?: string | null;
  folder?: Folder;
  file?: FileUploadResponse;
  /** Temporary flag for inline-editing (e.g. newly created folder) */
  isEditing?: boolean;
}

/** A flattened representation of a tree node for rendering. */
export interface FlattenedItem extends TreeItem {
  parentId: string | null;
  depth: number;
  index: number;
}
