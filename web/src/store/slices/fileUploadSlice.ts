import type { StateCreator } from "zustand";
import { fileService } from "@/service/fileService";
import type {
  UploadedFile,
  FileUploadOptions,
  FileValidationResult,
} from "@/types/file";
import type { XyzenState } from "../types";

export interface FileUploadSlice {
  // State
  uploadedFiles: UploadedFile[];
  isUploading: boolean;
  uploadError: string | null;

  // File upload options
  fileUploadOptions: FileUploadOptions;

  // Actions
  addFiles: (files: File[]) => Promise<void>;
  removeFile: (fileId: string) => void;
  clearFiles: (deleteFromServer?: boolean) => void;
  uploadFile: (file: File) => Promise<string | null>;
  confirmFilesForMessage: (messageId: string) => Promise<void>;
  cancelUpload: (fileId: string) => void;
  retryUpload: (fileId: string) => Promise<void>;
  validateFiles: (files: File[]) => FileValidationResult;
  updateFileUploadOptions: (options: Partial<FileUploadOptions>) => void;
  getTotalSize: () => number;
  canAddMoreFiles: () => boolean;
}

export const createFileUploadSlice: StateCreator<
  XyzenState,
  [],
  [],
  FileUploadSlice
> = (set, get) => ({
  // Initial state
  uploadedFiles: [],
  isUploading: false,
  uploadError: null,
  fileUploadOptions: {
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
      ".md",
    ],
    autoUpload: true,
  },

  // Validate files before upload
  validateFiles: (files: File[]): FileValidationResult => {
    const state = get();
    const options = state.fileUploadOptions;
    const currentFiles = state.uploadedFiles;
    const errors: string[] = [];

    // Check total number of files
    if (currentFiles.length + files.length > (options.maxFiles || 5)) {
      errors.push(
        `Maximum ${options.maxFiles} files allowed. You have ${currentFiles.length} files and are trying to add ${files.length} more.`,
      );
    }

    // Check individual file sizes and types
    for (const file of files) {
      const validation = fileService.validateFile(file, {
        maxSize: options.maxSize,
        allowedTypes: options.allowedTypes,
      });

      if (!validation.valid && validation.error) {
        errors.push(`${file.name}: ${validation.error}`);
      }
    }

    // Check total size
    const currentTotalSize = state.getTotalSize();
    const newFilesSize = files.reduce((sum, file) => sum + file.size, 0);
    const totalSize = currentTotalSize + newFilesSize;

    if (totalSize > (options.maxTotalSize || 20 * 1024 * 1024)) {
      const maxSizeMB = (
        (options.maxTotalSize || 20 * 1024 * 1024) /
        (1024 * 1024)
      ).toFixed(1);
      const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
      errors.push(
        `Total size ${totalSizeMB}MB exceeds limit of ${maxSizeMB}MB`,
      );
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    };
  },

  // Add files and optionally auto-upload
  addFiles: async (files: File[]) => {
    const state = get();
    const validation = state.validateFiles(files);

    if (!validation.valid) {
      set({ uploadError: validation.error || "Validation failed" });
      return;
    }

    // Create UploadedFile objects
    const newFiles: UploadedFile[] = files.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      category: fileService.getFileCategory(file) as UploadedFile["category"],
      status: "pending",
      progress: 0,
      createdAt: new Date(),
    }));

    set((state) => ({
      uploadedFiles: [...state.uploadedFiles, ...newFiles],
      uploadError: null,
    }));

    // Auto-upload if enabled
    if (state.fileUploadOptions.autoUpload) {
      for (const newFile of newFiles) {
        await state.uploadFile(newFile.file);
      }
    }
  },

  // Upload a single file
  uploadFile: async (file: File): Promise<string | null> => {
    const state = get();
    const uploadedFile = state.uploadedFiles.find((f) => f.file === file);

    if (!uploadedFile) {
      return null;
    }

    try {
      // Update status to uploading
      set((state) => ({
        uploadedFiles: state.uploadedFiles.map((f) =>
          f.id === uploadedFile.id
            ? { ...f, status: "uploading", progress: 0 }
            : f,
        ),
        isUploading: true,
      }));

      // Generate thumbnail for images
      if (file.type.startsWith("image/")) {
        try {
          const thumbnailUrl = await fileService.generateThumbnail(file);
          set((state) => ({
            uploadedFiles: state.uploadedFiles.map((f) =>
              f.id === uploadedFile.id ? { ...f, thumbnailUrl } : f,
            ),
          }));
        } catch (error) {
          console.warn("Failed to generate thumbnail:", error);
        }
      }

      // Upload file
      const response = await fileService.uploadFile(
        file,
        "private",
        uploadedFile.category,
        null, // folderId
        null, // knowledgeSetId
        (progress) => {
          set((state) => ({
            uploadedFiles: state.uploadedFiles.map((f) =>
              f.id === uploadedFile.id
                ? { ...f, progress: progress.percentage }
                : f,
            ),
          }));
        },
      );

      // Update with server response
      set((state) => ({
        uploadedFiles: state.uploadedFiles.map((f) =>
          f.id === uploadedFile.id
            ? {
                ...f,
                status: "completed",
                progress: 100,
                uploadedId: response.id,
                downloadUrl: response.download_url,
              }
            : f,
        ),
        isUploading: state.uploadedFiles.some(
          (f) => f.id !== uploadedFile.id && f.status === "uploading",
        ),
      }));

      return response.id;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Upload failed";

      set((state) => ({
        uploadedFiles: state.uploadedFiles.map((f) =>
          f.id === uploadedFile.id
            ? { ...f, status: "error", error: errorMessage }
            : f,
        ),
        isUploading: state.uploadedFiles.some(
          (f) => f.id !== uploadedFile.id && f.status === "uploading",
        ),
        uploadError: errorMessage,
      }));

      return null;
    }
  },

  // Remove a file
  removeFile: (fileId: string) => {
    const state = get();
    const file = state.uploadedFiles.find((f) => f.id === fileId);

    // If file was uploaded to server, delete it
    if (file?.uploadedId) {
      fileService.deleteFile(file.uploadedId, false).catch((error) => {
        console.error("Failed to delete file from server:", error);
      });
    }

    set((state) => ({
      uploadedFiles: state.uploadedFiles.filter((f) => f.id !== fileId),
    }));
  },

  // Clear all files
  clearFiles: (deleteFromServer: boolean = false) => {
    const state = get();

    // Only delete files from server if explicitly requested (e.g., user cancels)
    // Don't delete when files have been successfully sent with a message
    if (deleteFromServer) {
      const uploadedIds = state.uploadedFiles
        .filter((f) => f.uploadedId)
        .map((f) => f.uploadedId!);

      if (uploadedIds.length > 0) {
        fileService.bulkDeleteFiles(uploadedIds).catch((error) => {
          console.error("Failed to delete files from server:", error);
        });
      }
    }

    set({
      uploadedFiles: [],
      isUploading: false,
      uploadError: null,
    });
  },

  // Confirm files and associate with message
  confirmFilesForMessage: async (messageId: string) => {
    const state = get();
    const uploadedIds = state.uploadedFiles
      .filter((f) => f.uploadedId && f.status === "completed")
      .map((f) => f.uploadedId!);

    if (uploadedIds.length > 0) {
      try {
        await fileService.confirmFiles(uploadedIds, messageId);
        // Clear files after confirmation
        set({ uploadedFiles: [] });
      } catch (error) {
        console.error("Failed to confirm files:", error);
        throw error;
      }
    }
  },

  // Cancel upload
  cancelUpload: (fileId: string) => {
    set((state) => ({
      uploadedFiles: state.uploadedFiles.map((f) =>
        f.id === fileId ? { ...f, status: "error", error: "Cancelled" } : f,
      ),
    }));
  },

  // Retry upload
  retryUpload: async (fileId: string) => {
    const state = get();
    const file = state.uploadedFiles.find((f) => f.id === fileId);

    if (file) {
      await state.uploadFile(file.file);
    }
  },

  // Update file upload options
  updateFileUploadOptions: (options: Partial<FileUploadOptions>) => {
    set((state) => ({
      fileUploadOptions: { ...state.fileUploadOptions, ...options },
    }));
  },

  // Get total size of all files
  getTotalSize: (): number => {
    const state = get();
    return state.uploadedFiles.reduce((sum, file) => sum + file.size, 0);
  },

  // Check if more files can be added
  canAddMoreFiles: (): boolean => {
    const state = get();
    return state.uploadedFiles.length < (state.fileUploadOptions.maxFiles || 5);
  },
});
