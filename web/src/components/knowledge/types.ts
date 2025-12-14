export type KnowledgeTab =
  | "home"
  | "all"
  | "documents"
  | "pages"
  | "images"
  | "audio"
  | "videos";

export interface StorageStats {
  used: number; // in bytes
  total: number; // in bytes
  fileCount: number;
}
