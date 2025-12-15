import { useXyzen } from "@/store";

const getBackendUrl = () => {
  const url = useXyzen.getState().backendUrl;
  if (!url || url === "") {
    if (typeof window !== "undefined") {
      return `${window.location.protocol}//${window.location.host}`;
    }
  }
  return url;
};

const getAuthHeaders = (): Record<string, string> => {
  const token = useXyzen.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export interface FileUploadResponse {
  id: string;
  user_id: string;
  storage_key: string;
  original_filename: string;
  content_type: string;
  file_size: number;
  scope: string;
  category: string;
  file_hash: string | null;
  metainfo: Record<string, unknown> | null;
  is_deleted: boolean;
  message_id: string | null;
  status: "pending" | "confirmed" | "expired";
  folder_id: string | null;
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
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

class FileService {
  /**
   * Upload a file to the server
   */
  async uploadFile(
    file: File,
    scope: string = "private",
    category?: string,
    folderId?: string | null,
    onProgress?: (progress: UploadProgress) => void,
  ): Promise<FileUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("scope", scope);
    if (category) {
      formData.append("category", category);
    }
    if (folderId) {
      formData.append("folder_id", folderId);
    }

    const xhr = new XMLHttpRequest();
    const baseUrl = getBackendUrl();

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
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Upload failed"));
      });

      xhr.open("POST", `${baseUrl}/xyzen/api/v1/files/upload`);
      const headers = getAuthHeaders();
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });

      xhr.send(formData);
    });
  }

  /**
   * Get file by ID
   */
  async getFile(fileId: string): Promise<FileUploadResponse> {
    const baseUrl = getBackendUrl();
    const response = await fetch(`${baseUrl}/xyzen/api/v1/files/${fileId}`, {
      headers: { ...getAuthHeaders() },
    });
    if (!response.ok) throw new Error("Failed to get file");
    return response.json();
  }

  /**
   * List files for current user
   */
  async listFiles(params?: {
    scope?: string;
    category?: string;
    include_deleted?: boolean;
    limit?: number;
    offset?: number;
    folder_id?: string | null;
    filter_by_folder?: boolean;
  }): Promise<FileUploadResponse[]> {
    const baseUrl = getBackendUrl();
    const queryParams = new URLSearchParams();

    if (params) {
      if (params.scope) queryParams.append("scope", params.scope);
      if (params.category) queryParams.append("category", params.category);
      if (params.include_deleted) queryParams.append("include_deleted", "true");
      if (params.limit) queryParams.append("limit", params.limit.toString());
      if (params.offset) queryParams.append("offset", params.offset.toString());

      // Handle folder_id: only append if not null (unless backend supports literal "null" which it usually doesn't for UUID)
      // If folder_id is null, we assume Root. Backend treats missing folder_id as "don't filter" unless filter_by_folder is true.
      // If filter_by_folder is true AND folder_id is missing, backend treats it as Root (None).
      if (params.folder_id) {
        queryParams.append("folder_id", params.folder_id);
      }
      if (params.filter_by_folder) {
        queryParams.append("filter_by_folder", "true");
      }
    }

    const queryString = queryParams.toString()
      ? "?" + queryParams.toString()
      : "";
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/files/${queryString}`,
      {
        headers: { ...getAuthHeaders() },
      },
    );
    if (!response.ok) throw new Error("Failed to list files");
    return response.json();
  }

  /**
   * Get presigned download URL for a file
   */
  async getFileUrl(
    fileId: string,
    expiresIn: number = 3600,
  ): Promise<{
    download_url: string;
    expires_in: number;
    storage_key: string;
  }> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/files/${fileId}/url?expires_in=${expiresIn}`,
      {
        headers: { ...getAuthHeaders() },
      },
    );
    if (!response.ok) throw new Error("Failed to get file URL");
    return response.json();
  }

  /**
   * Update file metadata
   */
  async updateFile(
    fileId: string,
    updates: {
      original_filename?: string;
      metainfo?: Record<string, unknown>;
      message_id?: string | null;
      status?: "pending" | "confirmed" | "expired";
      folder_id?: string | null;
    },
  ): Promise<FileUploadResponse> {
    const baseUrl = getBackendUrl();
    const response = await fetch(`${baseUrl}/xyzen/api/v1/files/${fileId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(updates),
    });
    if (!response.ok) throw new Error("Failed to update file");
    return response.json();
  }

  /**
   * Confirm files and associate with message
   */
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

  /**
   * Delete a file (soft delete by default)
   */
  async deleteFile(fileId: string, hardDelete: boolean = false): Promise<void> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/files/${fileId}?hard_delete=${hardDelete}`,
      {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      },
    );
    if (!response.ok) throw new Error("Failed to delete file");
  }

  /**
   * Restore a soft-deleted file
   */
  async restoreFile(fileId: string): Promise<FileUploadResponse> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/files/${fileId}/restore`,
      {
        method: "POST",
        headers: { ...getAuthHeaders() },
      },
    );
    if (!response.ok) throw new Error("Failed to restore file");
    return response.json();
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<FileStats> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/files/stats/summary`,
      {
        headers: { ...getAuthHeaders() },
      },
    );
    if (!response.ok) throw new Error("Failed to get storage stats");
    return response.json();
  }

  /**
   * Bulk delete files
   */
  async bulkDeleteFiles(fileIds: string[]): Promise<void> {
    const baseUrl = getBackendUrl();
    const response = await fetch(`${baseUrl}/xyzen/api/v1/files/bulk`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(fileIds),
    });
    if (!response.ok) throw new Error("Failed to bulk delete files");
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

    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      return {
        valid: false,
        error: `File type ${file.type} is not supported`,
      };
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
      file.type.includes("document")
    ) {
      return "documents";
    }
    return "others";
  }

  /**
   * Generate thumbnail URL for preview
   */
  generateThumbnail(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith("image/")) {
        reject(new Error("File is not an image"));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          resolve(e.target.result as string);
        } else {
          reject(new Error("Failed to read file"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }
}

export const fileService = new FileService();
