import { http } from "@/service/http/client";

export interface KnowledgeSet {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface KnowledgeSetWithFileCount extends KnowledgeSet {
  file_count: number;
}

// Alias for backward compatibility
export type KnowledgeSetRead = KnowledgeSet;

export interface CreateKnowledgeSetRequest {
  name: string;
  description?: string | null;
}

export interface UpdateKnowledgeSetRequest {
  name?: string;
  description?: string | null;
  is_deleted?: boolean;
}

export interface BulkLinkResponse {
  message: string;
  successful: number;
  skipped: number;
}

export interface BulkUnlinkResponse {
  message: string;
  count: number;
}

class KnowledgeSetService {
  async createKnowledgeSet(
    data: CreateKnowledgeSetRequest,
  ): Promise<KnowledgeSet> {
    return http.post("/xyzen/api/v1/knowledge-sets/", data);
  }

  async listKnowledgeSets(
    includeDeleted: boolean = false,
  ): Promise<KnowledgeSetWithFileCount[]> {
    return http.get("/xyzen/api/v1/knowledge-sets/", {
      params: { include_deleted: includeDeleted || undefined },
    });
  }

  async getKnowledgeSet(
    knowledgeSetId: string,
  ): Promise<KnowledgeSetWithFileCount> {
    return http.get(`/xyzen/api/v1/knowledge-sets/${knowledgeSetId}`);
  }

  async updateKnowledgeSet(
    knowledgeSetId: string,
    data: UpdateKnowledgeSetRequest,
  ): Promise<KnowledgeSet> {
    return http.patch(`/xyzen/api/v1/knowledge-sets/${knowledgeSetId}`, data);
  }

  async deleteKnowledgeSet(
    knowledgeSetId: string,
    hardDelete: boolean = false,
  ): Promise<void> {
    return http.delete(
      `/xyzen/api/v1/knowledge-sets/${knowledgeSetId}`,
      undefined,
      { params: { hard_delete: hardDelete } },
    );
  }

  async linkFileToKnowledgeSet(
    knowledgeSetId: string,
    fileId: string,
  ): Promise<{ message: string }> {
    return http.post(
      `/xyzen/api/v1/knowledge-sets/${knowledgeSetId}/files/${fileId}`,
    );
  }

  async unlinkFileFromKnowledgeSet(
    knowledgeSetId: string,
    fileId: string,
  ): Promise<void> {
    return http.delete(
      `/xyzen/api/v1/knowledge-sets/${knowledgeSetId}/files/${fileId}`,
    );
  }

  async getFilesInKnowledgeSet(knowledgeSetId: string): Promise<string[]> {
    return http.get(`/xyzen/api/v1/knowledge-sets/${knowledgeSetId}/files`);
  }

  async bulkLinkFilesToKnowledgeSet(
    knowledgeSetId: string,
    fileIds: string[],
  ): Promise<BulkLinkResponse> {
    return http.post(
      `/xyzen/api/v1/knowledge-sets/${knowledgeSetId}/files/bulk-link`,
      { file_ids: fileIds },
    );
  }

  async bulkUnlinkFilesFromKnowledgeSet(
    knowledgeSetId: string,
    fileIds: string[],
  ): Promise<BulkUnlinkResponse> {
    return http.post(
      `/xyzen/api/v1/knowledge-sets/${knowledgeSetId}/files/bulk-unlink`,
      { file_ids: fileIds },
    );
  }
}

export const knowledgeSetService = new KnowledgeSetService();
