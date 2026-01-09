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
  /**
   * Create a new knowledge set
   */
  async createKnowledgeSet(
    data: CreateKnowledgeSetRequest,
  ): Promise<KnowledgeSet> {
    const baseUrl = getBackendUrl();
    const response = await fetch(`${baseUrl}/xyzen/api/v1/knowledge-sets/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail?.msg || "Failed to create knowledge set");
    }
    return response.json();
  }

  /**
   * List knowledge sets
   */
  async listKnowledgeSets(
    includeDeleted: boolean = false,
  ): Promise<KnowledgeSetWithFileCount[]> {
    const baseUrl = getBackendUrl();
    const params = new URLSearchParams();
    if (includeDeleted) {
      params.append("include_deleted", "true");
    }

    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/knowledge-sets/?${params.toString()}`,
      {
        headers: { ...getAuthHeaders() },
      },
    );

    if (!response.ok) {
      throw new Error("Failed to list knowledge sets");
    }
    return response.json();
  }

  /**
   * Get knowledge set details
   */
  async getKnowledgeSet(
    knowledgeSetId: string,
  ): Promise<KnowledgeSetWithFileCount> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/knowledge-sets/${knowledgeSetId}`,
      {
        headers: { ...getAuthHeaders() },
      },
    );

    if (!response.ok) {
      throw new Error("Failed to get knowledge set");
    }
    return response.json();
  }

  /**
   * Update knowledge set
   */
  async updateKnowledgeSet(
    knowledgeSetId: string,
    data: UpdateKnowledgeSetRequest,
  ): Promise<KnowledgeSet> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/knowledge-sets/${knowledgeSetId}`,
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
      throw new Error(error.detail?.msg || "Failed to update knowledge set");
    }
    return response.json();
  }

  /**
   * Delete knowledge set
   */
  async deleteKnowledgeSet(
    knowledgeSetId: string,
    hardDelete: boolean = false,
  ): Promise<void> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/knowledge-sets/${knowledgeSetId}?hard_delete=${hardDelete}`,
      {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      },
    );

    if (!response.ok) {
      throw new Error("Failed to delete knowledge set");
    }
  }

  /**
   * Link a file to a knowledge set
   */
  async linkFileToKnowledgeSet(
    knowledgeSetId: string,
    fileId: string,
  ): Promise<{ message: string }> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/knowledge-sets/${knowledgeSetId}/files/${fileId}`,
      {
        method: "POST",
        headers: { ...getAuthHeaders() },
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.detail?.msg || "Failed to link file to knowledge set",
      );
    }
    return response.json();
  }

  /**
   * Unlink a file from a knowledge set
   */
  async unlinkFileFromKnowledgeSet(
    knowledgeSetId: string,
    fileId: string,
  ): Promise<void> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/knowledge-sets/${knowledgeSetId}/files/${fileId}`,
      {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      },
    );

    if (!response.ok) {
      throw new Error("Failed to unlink file from knowledge set");
    }
  }

  /**
   * Get all file IDs in a knowledge set
   */
  async getFilesInKnowledgeSet(knowledgeSetId: string): Promise<string[]> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/knowledge-sets/${knowledgeSetId}/files`,
      {
        headers: { ...getAuthHeaders() },
      },
    );

    if (!response.ok) {
      throw new Error("Failed to get files in knowledge set");
    }
    return response.json();
  }

  /**
   * Bulk link files to a knowledge set
   */
  async bulkLinkFilesToKnowledgeSet(
    knowledgeSetId: string,
    fileIds: string[],
  ): Promise<BulkLinkResponse> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/knowledge-sets/${knowledgeSetId}/files/bulk-link`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ file_ids: fileIds }),
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.detail?.msg || "Failed to bulk link files to knowledge set",
      );
    }
    return response.json();
  }

  /**
   * Bulk unlink files from a knowledge set
   */
  async bulkUnlinkFilesFromKnowledgeSet(
    knowledgeSetId: string,
    fileIds: string[],
  ): Promise<BulkUnlinkResponse> {
    const baseUrl = getBackendUrl();
    const response = await fetch(
      `${baseUrl}/xyzen/api/v1/knowledge-sets/${knowledgeSetId}/files/bulk-unlink`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ file_ids: fileIds }),
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(
        error.detail?.msg || "Failed to bulk unlink files from knowledge set",
      );
    }
    return response.json();
  }
}

export const knowledgeSetService = new KnowledgeSetService();
