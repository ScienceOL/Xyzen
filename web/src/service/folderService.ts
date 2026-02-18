import { http } from "@/service/http/client";

export interface Folder {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

/** A single item in the flat tree returned by GET /folders/tree */
export interface FileTreeItem {
  id: string;
  parent_id: string | null;
  name: string;
  is_dir: boolean;
  file_size: number;
  content_type: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
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
  async createFolder(data: CreateFolderRequest): Promise<Folder> {
    return http.post("/xyzen/api/v1/folders/", data);
  }

  async listFolders(
    parentId: string | null = null,
    includeDeleted: boolean = false,
    knowledgeSetId?: string,
  ): Promise<Folder[]> {
    return http.get("/xyzen/api/v1/folders/", {
      params: {
        parent_id: parentId ?? undefined,
        include_deleted: includeDeleted || undefined,
        knowledge_set_id: knowledgeSetId,
      },
    });
  }

  async getTree(
    knowledgeSetId?: string,
    onlyDeleted?: boolean,
  ): Promise<FileTreeItem[]> {
    return http.get("/xyzen/api/v1/folders/tree", {
      params: {
        knowledge_set_id: knowledgeSetId,
        only_deleted: onlyDeleted || undefined,
      },
    });
  }

  async getFolder(folderId: string): Promise<Folder> {
    return http.get(`/xyzen/api/v1/folders/${folderId}`);
  }

  async getFolderPath(folderId: string): Promise<Folder[]> {
    return http.get(`/xyzen/api/v1/folders/${folderId}/path`);
  }

  async updateFolder(
    folderId: string,
    data: UpdateFolderRequest,
  ): Promise<Folder> {
    return http.patch(`/xyzen/api/v1/folders/${folderId}`, data);
  }

  async deleteFolder(
    folderId: string,
    hardDelete: boolean = false,
  ): Promise<void> {
    return http.delete(`/xyzen/api/v1/folders/${folderId}`, undefined, {
      params: { hard_delete: hardDelete },
    });
  }
}

export const folderService = new FolderService();
