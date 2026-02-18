import { authService } from "@/service/authService";
import { http } from "@/service/http/client";

export interface FileUploadResponse {
  id: string;
  user_id: string;
  storage_key: string | null;
  original_filename: string;
  content_type: string | null;
  file_size: number;
  scope: string;
  category: string;
  file_hash: string | null;
  metainfo: Record<string, unknown> | null;
  is_deleted: boolean;
  is_dir: boolean;
  parent_id: string | null;
  message_id: string | null;
  status: "pending" | "confirmed" | "expired";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  download_url?: string;
}

export interface FileStats {
  total_files: number;
  total_size: number;
  deleted_files: number;
  total_size_mb: number;
  total_size_gb: number;
  quota: {
    storage: {
      used_bytes: number;
      used_mb: number;
      used_gb: number;
      limit_bytes: number;
      limit_mb: number;
      limit_gb: number;
      available_bytes: number;
      available_mb: number;
      available_gb: number;
      usage_percentage: number;
    };
    file_count: {
      used: number;
      limit: number;
      available: number;
      usage_percentage: number;
    };
    max_file_size: {
      bytes: number;
      mb: number;
      gb: number;
    };
  };
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadHandle {
  promise: Promise<FileUploadResponse>;
  abort: () => void;
}

class FileService {
  /**
   * Upload a file to the server with progress and cancellation support
   */
  uploadFileWithProgress(
    file: File,
    scope: string = "private",
    category?: string,
    parentId?: string | null,
    knowledgeSetId?: string | null,
    onProgress?: (progress: UploadProgress) => void,
  ): UploadHandle {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scope", scope);
    if (category) {
      formData.append("category", category);
    }
    if (parentId) {
      formData.append("parent_id", parentId);
    }
    if (knowledgeSetId) {
      formData.append("knowledge_set_id", knowledgeSetId);
    }

    const xhr = new XMLHttpRequest();
    const baseUrl = http.baseUrl;

    const promise = new Promise<FileUploadResponse>((resolve, reject) => {
      xhr.upload.addEventListener("progress", (e) => {
        if (onProgress && e.lengthComputable) {
          const percentage = Math.round((e.loaded * 100) / e.total);
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percentage,
          });
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else if (xhr.status === 429) {
          reject(
            new Error("Too many requests. Please wait a moment and try again."),
          );
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Upload failed"));
      });

      xhr.addEventListener("abort", () => {
        reject(new Error("Upload cancelled"));
      });

      xhr.open("POST", `${baseUrl}/xyzen/api/v1/files/upload`);
      const token = authService.getToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.send(formData);
    });

    return {
      promise,
      abort: () => xhr.abort(),
    };
  }

  /**
   * Upload a file to the server
   */
  async uploadFile(
    file: File,
    scope: string = "private",
    category?: string,
    parentId?: string | null,
    knowledgeSetId?: string | null,
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scope", scope);
    if (category) {
      formData.append("category", category);
    }
    if (parentId) {
      formData.append("parent_id", parentId);
    }
    if (knowledgeSetId) {
      formData.append("knowledge_set_id", knowledgeSetId);
    }

    const xhr = new XMLHttpRequest();
    const baseUrl = http.baseUrl;

    return new Promise((resolve, reject) => {
      xhr.upload.addEventListener("progress", (e) => {
        if (onProgress && e.lengthComputable) {
          const percentage = Math.round((e.loaded * 100) / e.total);
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percentage,
          });
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else if (xhr.status === 429) {
          reject(
            new Error("Too many requests. Please wait a moment and try again."),
          );
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Upload failed"));
      });

      xhr.open("POST", `${baseUrl}/xyzen/api/v1/files/upload`);
      const token = authService.getToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }

      xhr.send(formData);
    });
  }

  async getFile(fileId: string): Promise<FileUploadResponse> {
    return http.get(`/xyzen/api/v1/files/${fileId}`);
  }

  async listFiles(params?: {
    scope?: string;
    category?: string;
    include_deleted?: boolean;
    limit?: number;
    offset?: number;
    parent_id?: string | null;
    filter_by_parent?: boolean;
    is_dir?: boolean;
    knowledge_set_id?: string;
  }): Promise<FileUploadResponse[]> {
    const queryParams = new URLSearchParams();

    if (params) {
      if (params.scope) queryParams.append("scope", params.scope);
      if (params.category) queryParams.append("category", params.category);
      if (params.include_deleted) queryParams.append("include_deleted", "true");
      if (params.limit) queryParams.append("limit", params.limit.toString());
      if (params.offset) queryParams.append("offset", params.offset.toString());

      if (params.parent_id) {
        queryParams.append("parent_id", params.parent_id);
      }
      if (params.filter_by_parent) {
        queryParams.append("filter_by_parent", "true");
      }
      if (params.is_dir !== undefined) {
        queryParams.append("is_dir", params.is_dir.toString());
      }
      if (params.knowledge_set_id) {
        queryParams.append("knowledge_set_id", params.knowledge_set_id);
      }
    }

    const queryString = queryParams.toString()
      ? "?" + queryParams.toString()
      : "";
    return http.get(`/xyzen/api/v1/files/${queryString}`);
  }

  async getFileUrl(
    fileId: string,
    expiresIn: number = 3600,
  ): Promise<{
    download_url: string;
    expires_in: number;
    storage_key: string;
  }> {
    return http.get(`/xyzen/api/v1/files/${fileId}/url`, {
      params: { expires_in: expiresIn },
    });
  }

  async updateFile(
    fileId: string,
    updates: {
      original_filename?: string;
      metainfo?: Record<string, unknown>;
      message_id?: string | null;
      status?: "pending" | "confirmed" | "expired";
      parent_id?: string | null;
    },
  ): Promise<FileUploadResponse> {
    return http.patch(`/xyzen/api/v1/files/${fileId}`, updates);
  }

  async confirmFiles(fileIds: string[], messageId: string): Promise<void> {
    await Promise.all(
      fileIds.map((fileId) =>
        this.updateFile(fileId, {
          message_id: messageId,
          status: "confirmed",
        }),
      ),
    );
  }

  async deleteFile(fileId: string, hardDelete: boolean = false): Promise<void> {
    return http.delete(`/xyzen/api/v1/files/${fileId}`, undefined, {
      params: { hard_delete: hardDelete },
    });
  }

  async restoreFile(fileId: string): Promise<FileUploadResponse> {
    return http.post(`/xyzen/api/v1/files/${fileId}/restore`);
  }

  async getStorageStats(): Promise<FileStats> {
    return http.get("/xyzen/api/v1/files/stats/summary");
  }

  async emptyTrash(): Promise<{ deleted_count: number }> {
    return http.post("/xyzen/api/v1/files/empty-trash");
  }

  async bulkDeleteFiles(fileIds: string[]): Promise<void> {
    return http.delete("/xyzen/api/v1/files/bulk", fileIds);
  }

  /**
   * Download a file through the backend proxy as a raw Response.
   * Returns a Response object — caller can use `.blob()` or `.text()`.
   */
  async downloadRaw(
    fileId: string,
    options?: { signal?: AbortSignal },
  ): Promise<Response> {
    return http.raw(`/xyzen/api/v1/files/${fileId}/download`, {
      signal: options?.signal,
    });
  }

  /**
   * Validate file before upload
   */
  validateFile(
    file: File,
    options: {
      maxSize?: number;
      allowedTypes?: string[];
    } = {},
  ): { valid: boolean; error?: string } {
    const {
      maxSize = 100 * 1024 * 1024, // 100MB default
      allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
        "text/plain",
        "text/markdown",
        "audio/mpeg",
        "audio/wav",
      ],
    } = options;

    if (file.size > maxSize) {
      return {
        valid: false,
        error: `File size exceeds ${(maxSize / (1024 * 1024)).toFixed(0)}MB limit`,
      };
    }

    if (allowedTypes.length > 0) {
      const typeMatches = allowedTypes.includes(file.type);
      const extensionMatches = allowedTypes.some(
        (type) =>
          type.startsWith(".") &&
          file.name.toLowerCase().endsWith(type.toLowerCase()),
      );

      if (!typeMatches && !extensionMatches) {
        return {
          valid: false,
          error: `File type ${file.type || "unknown"} is not supported`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Get file type category
   */
  getFileCategory(file: File): string {
    if (file.type.startsWith("image/")) return "images";
    if (file.type.startsWith("audio/")) return "audio";
    if (
      file.type.includes("pdf") ||
      file.type.includes("text") ||
      file.type.includes("document") ||
      file.name.toLowerCase().endsWith(".md")
    ) {
      return "documents";
    }
    return "others";
  }

  /**
   * Generate thumbnail URL for preview using Canvas API
   * Resizes image to max 160px dimension and outputs as JPEG for small file size
   */
  generateThumbnail(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("File is not an image"));
        return;
      }

      const MAX_SIZE = 160;
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        // Calculate scaled dimensions maintaining aspect ratio
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        // Create canvas and draw scaled image
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Export as JPEG with 0.8 quality for small file size
        const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve(thumbnailUrl);
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to load image"));
      };

      img.src = objectUrl;
    });
  }
}

export const fileService = new FileService();
