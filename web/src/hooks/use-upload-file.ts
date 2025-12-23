import * as React from "react";
import { fileService } from "@/service/fileService";

export interface UploadedFile {
  key?: string;
  name: string;
  size: number;
  type: string;
  url: string;
}

interface UseUploadFileProps {
  onUploadComplete?: (file: UploadedFile) => void;
  onUploadError?: (error: unknown) => void;
}

/**
 * Simple upload hook that uses fileService for media uploads.
 * Replaces the original uploadthing-based implementation.
 */
export function useUploadFile({
  onUploadComplete,
  onUploadError,
}: UseUploadFileProps = {}) {
  const [uploadedFile, setUploadedFile] = React.useState<UploadedFile>();
  const [uploadingFile, setUploadingFile] = React.useState<File>();
  const [progress, setProgress] = React.useState<number>(0);
  const [isUploading, setIsUploading] = React.useState(false);

  async function uploadFile(file: File) {
    setIsUploading(true);
    setUploadingFile(file);
    setProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 100);

      // Upload using fileService
      const response = await fileService.uploadFile(file, "public", "images");

      clearInterval(progressInterval);
      setProgress(100);

      // Use proxy URL for the uploaded file
      const proxyUrl = `/xyzen/api/v1/files/${response.id}/download`;

      const result: UploadedFile = {
        key: response.id,
        name: file.name,
        size: file.size,
        type: file.type,
        url: proxyUrl,
      };

      setUploadedFile(result);
      onUploadComplete?.(result);

      return result;
    } catch (error) {
      console.error("Upload failed:", error);
      onUploadError?.(error);

      // Return mock data for fallback
      const mockFile: UploadedFile = {
        key: "mock-key",
        name: file.name,
        size: file.size,
        type: file.type,
        url: URL.createObjectURL(file),
      };

      setUploadedFile(mockFile);
      return mockFile;
    } finally {
      setProgress(0);
      setIsUploading(false);
      setUploadingFile(undefined);
    }
  }

  return {
    isUploading,
    progress,
    uploadedFile,
    uploadFile,
    uploadingFile,
  };
}
