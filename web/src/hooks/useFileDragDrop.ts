import { useCallback, useRef, useState } from "react";

export interface UseFileDragDropOptions {
  onFilesDropped: (files: File[]) => void | Promise<void>;
  disabled?: boolean;
  maxFiles?: number;
  allowedTypes?: string[];
}

export interface UseFileDragDropReturn {
  isDragging: boolean;
  dragProps: {
    onDragEnter: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
}

/**
 * Custom hook for handling file drag and drop functionality
 *
 * @param options - Configuration options for drag and drop behavior
 * @returns Object containing drag state and event handlers
 *
 * @example
 * ```tsx
 * const { isDragging, dragProps } = useFileDragDrop({
 *   onFilesDropped: async (files) => {
 *     await addFiles(files);
 *   },
 *   disabled: false,
 *   maxFiles: 5,
 * });
 *
 * return (
 *   <div {...dragProps}>
 *     {isDragging && <div>Drop files here</div>}
 *   </div>
 * );
 * ```
 */
export function useFileDragDrop({
  onFilesDropped,
  disabled = false,
  maxFiles,
  allowedTypes,
}: UseFileDragDropOptions): UseFileDragDropReturn {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (disabled) return;

      dragCounterRef.current += 1;

      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        setIsDragging(true);
      }
    },
    [disabled],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (disabled) return;

      dragCounterRef.current -= 1;

      if (dragCounterRef.current === 0) {
        setIsDragging(false);
      }
    },
    [disabled],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDragging(false);
      dragCounterRef.current = 0;

      if (disabled) return;

      const files = Array.from(e.dataTransfer.files);

      if (files.length === 0) return;

      // Filter by allowed types if specified
      const filteredFiles = allowedTypes
        ? files.filter((file) => {
            // Check if file type matches any allowed type
            return allowedTypes.some((allowedType) => {
              if (allowedType.endsWith("/*")) {
                // Handle wildcard types like "image/*"
                const prefix = allowedType.slice(0, -2);
                return file.type.startsWith(prefix);
              }
              return file.type === allowedType;
            });
          })
        : files;

      // Limit by maxFiles if specified
      const filesToAdd =
        maxFiles !== undefined
          ? filteredFiles.slice(0, maxFiles)
          : filteredFiles;

      if (filesToAdd.length > 0) {
        try {
          await onFilesDropped(filesToAdd);
        } catch (error) {
          console.error("Failed to handle dropped files:", error);
        }
      }

      // Log warnings for filtered or limited files
      if (filteredFiles.length < files.length) {
        console.warn(
          `${files.length - filteredFiles.length} file(s) were filtered out due to type restrictions`,
        );
      }

      if (maxFiles !== undefined && filesToAdd.length < filteredFiles.length) {
        console.warn(`Only ${maxFiles} file(s) were added due to file limit`);
      }
    },
    [disabled, onFilesDropped, maxFiles, allowedTypes],
  );

  return {
    isDragging,
    dragProps: {
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDragOver: handleDragOver,
      onDrop: handleDrop,
    },
  };
}
