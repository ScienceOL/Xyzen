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

export interface Folder {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CreateFolderRequest {
  name: string;
  parent_id?: string | null;
}

export interface UpdateFolderRequest {
  name?: string;
  parent_id?: string | null;
  is_deleted?: boolean;
}

class FolderService {
  /**
   * Create a new folder
   */
  async createFolder(data: CreateFolderRequest): Promise<Folder> {
    const baseUrl = getBackendUrl();
    const response = await fetch(`${baseUrl}/xyzen/api/v1/folders/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail?.msg || "Failed to create folder");
    }
    return response.json();
  }

  /**
   * List folders
   */
  async listFolders(
    parentId: string | null = null,
    includeDeleted: boolean = false,
  ): Promise<Folder[]> {
    const baseUrl = getBackendUrl();
    const params = new URLSearchParams();
    if (parentId) {
      params.append("parent_id", parentId);
    }
    if (includeDeleted) {
      params.append("include_deleted", "true");
    }

    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/folders/?${params.toString()}`,
      {
        headers: { ...getAuthHeaders() },
      },
    );

    if (!response.ok) {
      throw new Error("Failed to list folders");
    }
    return response.json();
  }

  /**
   * Get folder details
   */
  async getFolder(folderId: string): Promise<Folder> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/folders/${folderId}`,
      {
        headers: { ...getAuthHeaders() },
      },
    );

    if (!response.ok) {
      throw new Error("Failed to get folder");
    }
    return response.json();
  }

  /**
   * Get folder path
   */
  async getFolderPath(folderId: string): Promise<Folder[]> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/folders/${folderId}/path`,
      {
        headers: { ...getAuthHeaders() },
      },
    );

    if (!response.ok) {
      throw new Error("Failed to get folder path");
    }
    return response.json();
  }

  /**
   * Update folder
   */
  async updateFolder(
    folderId: string,
    data: UpdateFolderRequest,
  ): Promise<Folder> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/folders/${folderId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify(data),
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail?.msg || "Failed to update folder");
    }
    return response.json();
  }

  /**
   * Delete folder
   */
  async deleteFolder(
    folderId: string,
    hardDelete: boolean = false,
  ): Promise<void> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/folders/${folderId}?hard_delete=${hardDelete}`,
      {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      },
    );

    if (!response.ok) {
      throw new Error("Failed to delete folder");
    }
  }
}

export const folderService = new FolderService();
