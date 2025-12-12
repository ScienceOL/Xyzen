export interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  category: "images" | "documents" | "audio" | "others";
  status: "uploading" | "completed" | "error" | "pending";
  progress: number;
  uploadedId?: string; // Server-side file ID after upload
  thumbnailUrl?: string; // Preview thumbnail for images
  error?: string;
  downloadUrl?: string; // Presigned download URL from server
  createdAt: Date;
}

export interface FileUploadOptions {
  maxSize?: number; // Max size per file in bytes (default: 10MB)
  maxFiles?: number; // Max number of files (default: 5)
  maxTotalSize?: number; // Max total size in bytes (default: 20MB)
  allowedTypes?: string[]; // Allowed MIME types
  autoUpload?: boolean; // Auto upload on select (default: true)
}

export interface FileUploadState {
  files: UploadedFile[];
  uploading: boolean;
  totalProgress: number;
  error: string | null;
}

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  errors?: string[];
}

export const DEFAULT_FILE_UPLOAD_OPTIONS: FileUploadOptions = {
  maxSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  maxTotalSize: 20 * 1024 * 1024, // 20MB
  allowedTypes: [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/markdown",
    "audio/mpeg",
    "audio/wav",
  ],
  autoUpload: true,
};

export const FILE_TYPE_ICONS: Record<string, string> = {
  "image/jpeg": "🖼️",
  "image/jpg": "🖼️",
  "image/png": "🖼️",
  "image/gif": "🖼️",
  "image/webp": "🖼️",
  "application/pdf": "📄",
  "text/plain": "📝",
  "text/markdown": "📝",
  "audio/mpeg": "🎵",
  "audio/wav": "🎵",
};

export const FILE_TYPE_COLORS: Record<string, string> = {
  images: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  documents:
    "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  audio:
    "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  others: "bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-300",
};
