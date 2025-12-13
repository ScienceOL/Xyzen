import { PaperClipIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import { useRef } from "react";
import { useXyzen } from "@/store";

export interface FileUploadButtonProps {
  disabled?: boolean;
  className?: string;
}

export function FileUploadButton({
  disabled,
  className,
}: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addFiles, canAddMoreFiles, fileUploadOptions } = useXyzen();

  const handleClick = () => {
    if (disabled || !canAddMoreFiles()) {
      if (!canAddMoreFiles()) {
        console.error(`Maximum ${fileUploadOptions.maxFiles} files allowed`);
      }
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = Array.from(event.target.files || []);

    if (files.length === 0) return;

    try {
      await addFiles(files);
      // Clear input to allow selecting same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Failed to add files:", error);
    }
  };

  const acceptedTypes = fileUploadOptions.allowedTypes?.join(",") || "*";

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || !canAddMoreFiles()}
        className={clsx(
          "flex items-center justify-center rounded-sm p-1.5 transition-colors",
          "hover:bg-neutral-200/60 hover:text-neutral-700 dark:hover:bg-neutral-800/60 dark:hover:text-neutral-300",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus:outline-none",
          "text-neutral-500 dark:text-neutral-400",
          className,
        )}
        title="Attach files"
        aria-label="Attach files"
      >
        <PaperClipIcon className="h-4 w-4" />
      </button>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptedTypes}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
      />
    </>
  );
}
