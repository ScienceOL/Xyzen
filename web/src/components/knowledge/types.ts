export type KnowledgeTab =
  | "home"
  | "all"
  | "documents"
  | "pages"
  | "images"
  | "audio"
  | "videos"
  | "trash";

export type ViewMode = "list" | "grid";

export interface StorageStats {
  used: number; // in bytes
  total: number; // in bytes
  fileCount: number;
}
