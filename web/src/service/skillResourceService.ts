import { authService } from "@/service/authService";
import { http } from "@/service/http/client";
import type { FileTreeItem, Folder } from "@/service/folderService";
import type { UploadHandle, UploadProgress } from "@/service/fileService";

export interface SkillStorageStats {
  file_count: number;
  total_size: number;
  max_files: number;
  max_file_size: number;
  max_total_size: number;
}

class SkillResourceService {
  private base(skillId: string) {
    return `/xyzen/api/v1/skills/${skillId}`;
  }

  async getTree(skillId: string): Promise<FileTreeItem[]> {
    return http.get(`${this.base(skillId)}/files/tree`);
  }

  async getStats(skillId: string): Promise<SkillStorageStats> {
    return http.get(`${this.base(skillId)}/files/stats`);
  }

  uploadFileWithProgress(
    skillId: string,
    file: File,
    parentId?: string | null,
    onProgress?: (progress: UploadProgress) => void,
  ): UploadHandle {
    const formData = new FormData();
    formData.append("file", file);
    if (parentId) {
      formData.append("parent_id", parentId);
    }

    const xhr = new XMLHttpRequest();
    const baseUrl = http.baseUrl;

    const promise = new Promise<Record<string, unknown>>((resolve, reject) => {
      xhr.upload.addEventListener("progress", (e) => {
        if (onProgress && e.lengthComputable) {
          const percentage = Math.round((e.loaded * 100) / e.total);
          onProgress({ loaded: e.loaded, total: e.total, percentage });
        }
      });

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(`Upload failed: ${xhr.statusText}`));
        }
      });

      xhr.addEventListener("error", () => reject(new Error("Upload failed")));
      xhr.addEventListener("abort", () =>
        reject(new Error("Upload cancelled")),
      );

      xhr.open("POST", `${baseUrl}${this.base(skillId)}/files/upload`);
      const token = authService.getToken();
      if (token) {
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      }
      xhr.send(formData);
    });

    // Cast to match UploadHandle's expected type (FileUploadResponse)
    return {
      promise: promise as unknown as UploadHandle["promise"],
      abort: () => xhr.abort(),
    };
  }

  async updateFile(
    skillId: string,
    fileId: string,
    updates: { original_filename?: string; parent_id?: string | null },
  ): Promise<Record<string, unknown>> {
    return http.patch(`${this.base(skillId)}/files/${fileId}`, updates);
  }

  async deleteFile(skillId: string, fileId: string): Promise<void> {
    return http.delete(`${this.base(skillId)}/files/${fileId}`);
  }

  async downloadRaw(
    skillId: string,
    fileId: string,
    options?: { signal?: AbortSignal },
  ): Promise<Response> {
    return http.raw(`${this.base(skillId)}/files/${fileId}/download`, {
      signal: options?.signal,
    });
  }

  async createFolder(
    skillId: string,
    data: { name: string; parent_id?: string | null },
  ): Promise<Folder> {
    return http.post(`${this.base(skillId)}/folders`, data);
  }

  async updateFolder(
    skillId: string,
    folderId: string,
    updates: { name?: string; parent_id?: string | null },
  ): Promise<Folder> {
    return http.patch(`${this.base(skillId)}/folders/${folderId}`, updates);
  }

  async deleteFolder(skillId: string, folderId: string): Promise<void> {
    return http.delete(`${this.base(skillId)}/folders/${folderId}`);
  }

  async getFolderPath(skillId: string, folderId: string): Promise<Folder[]> {
    return http.get(`${this.base(skillId)}/folders/${folderId}/path`);
  }
}

export const skillResourceService = new SkillResourceService();
