import { useCallback, useState } from "react";
import { fileService } from "@/service/fileService";

export interface UploadImageResult {
  url: string;
  id: string;
}

export interface UseEditorImageUploadReturn {
  uploadImage: (file: File) => Promise<UploadImageResult>;
  isUploading: boolean;
  uploadError: string | null;
  clearError: () => void;
}

/**
 * Hook for handling image uploads within the Plate editor
 *
 * Uploads images to the server using fileService with public scope
 * so images remain accessible when README is viewed by others.
 */
export function useEditorImageUpload(): UseEditorImageUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const uploadImage = useCallback(
    async (file: File): Promise<UploadImageResult> => {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        const error = "Only image files are allowed";
        setUploadError(error);
        throw new Error(error);
      }

      // Validate file size (10MB max)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        const error = `Image size must be less than ${maxSize / (1024 * 1024)}MB`;
        setUploadError(error);
        throw new Error(error);
      }

      setIsUploading(true);
      setUploadError(null);

      try {
        // Upload with public scope so images remain accessible
        const response = await fileService.uploadFile(file, "public", "images");

        // Get the download URL
        const urlResult = await fileService.getFileUrl(response.id);

        return {
          url: urlResult.download_url,
          id: response.id,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        setUploadError(errorMessage);
        throw error;
      } finally {
        setIsUploading(false);
      }
    },
    [],
  );

  const clearError = useCallback(() => {
    setUploadError(null);
  }, []);

  return {
    uploadImage,
    isUploading,
    uploadError,
    clearError,
  };
}

export default useEditorImageUpload;
