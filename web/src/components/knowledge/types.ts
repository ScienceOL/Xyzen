export type KnowledgeTab =
  | "home"
  | "all"
  | "documents"
  | "pages"
  | "images"
  | "audio"
  | "videos"
  | "trash"
  | "folders"
  | "knowledge";

export type ViewMode = "list" | "grid";

export interface StorageStats {
  used: number; // in bytes
  total: number; // in bytes
  fileCount: number;
  usagePercentage?: number; // 0-100
  availableBytes?: number;
  maxFileSize?: number; // in bytes
}
