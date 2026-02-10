import { ChevronRightIcon, FileTextIcon, FolderIcon } from "lucide-react";
import type { ReactNode } from "react";

import {
  FileItem as FileItemPrimitive,
  Files as FilesPrimitive,
  FolderContent as FolderContentPrimitive,
  FolderItem as FolderItemPrimitive,
  FolderTrigger as FolderTriggerPrimitive,
  type FileItemProps as FileItemPrimitiveProps,
  type FilesProps as FilesPrimitiveProps,
  type FolderContentProps as FolderContentPrimitiveProps,
  type FolderItemProps as FolderItemPrimitiveProps,
  type FolderTriggerProps as FolderTriggerPrimitiveProps,
} from "@/components/animate-ui/primitives/radix/files";
import { cn } from "@/lib/utils";

type FilesProps = FilesPrimitiveProps;

function Files({ className, ...props }: FilesProps) {
  return (
    <FilesPrimitive className={cn("w-full text-sm", className)} {...props} />
  );
}

type FolderItemProps = FolderItemPrimitiveProps;

function FolderItem({ className, ...props }: FolderItemProps) {
  return (
    <FolderItemPrimitive
      className={cn("rounded-md border-0", className)}
      {...props}
    />
  );
}

type FolderTriggerProps = FolderTriggerPrimitiveProps & {
  icon?: ReactNode;
};

function FolderTrigger({
  className,
  children,
  icon,
  ...props
}: FolderTriggerProps) {
  return (
    <FolderTriggerPrimitive
      className={cn(
        "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800",
        "[&[data-state=open]_.files-chevron]:rotate-90",
        className,
      )}
      {...props}
    >
      <ChevronRightIcon className="files-chevron h-3.5 w-3.5 shrink-0 text-neutral-500 transition-transform" />
      <span className="shrink-0 text-neutral-500 dark:text-neutral-400">
        {icon ?? <FolderIcon className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </FolderTriggerPrimitive>
  );
}

type FolderContentProps = FolderContentPrimitiveProps;

function FolderContent({ className, ...props }: FolderContentProps) {
  return (
    <FolderContentPrimitive
      className={cn(
        "ml-3 border-l border-neutral-200 pl-3 dark:border-neutral-800",
        className,
      )}
      {...props}
    />
  );
}

type FileItemProps = FileItemPrimitiveProps & {
  icon?: ReactNode;
};

function FileItem({ className, children, icon, ...props }: FileItemProps) {
  return (
    <FileItemPrimitive
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-neutral-600 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800",
        className,
      )}
      {...props}
    >
      <span className="shrink-0 text-neutral-400 dark:text-neutral-500">
        {icon ?? <FileTextIcon className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </FileItemPrimitive>
  );
}

export {
  Files,
  FileItem,
  FolderContent,
  FolderItem,
  FolderTrigger,
  type FileItemProps,
  type FilesProps,
  type FolderContentProps,
  type FolderItemProps,
  type FolderTriggerProps,
};
