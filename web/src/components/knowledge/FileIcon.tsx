import {
  CommandLineIcon,
  DocumentIcon,
  DocumentTextIcon,
  FilmIcon,
  MusicalNoteIcon,
  PhotoIcon,
  PresentationChartBarIcon,
  TableCellsIcon,
  ArchiveBoxIcon,
  PaperClipIcon,
} from "@heroicons/react/24/solid";

interface FileIconProps {
  filename: string;
  mimeType: string;
  className?: string;
}

const getExtension = (filename: string) => {
  return filename.split(".").pop()?.toLowerCase() || "";
};

export const FileIcon = ({
  filename,
  mimeType,
  className = "h-6 w-6",
}: FileIconProps) => {
  const ext = getExtension(filename);

  // Helper to render icon with color
  const renderIcon = (Icon: React.ElementType, colorClass: string) => (
    <div className={`flex items-center justify-center rounded-lg ${className}`}>
      <Icon className={`h-full w-full ${colorClass}`} />
    </div>
  );

  // Images
  if (
    mimeType.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)
  ) {
    return renderIcon(PhotoIcon, "text-purple-500");
  }

  // Audio
  if (
    mimeType.startsWith("audio/") ||
    ["mp3", "wav", "ogg", "m4a"].includes(ext)
  ) {
    return renderIcon(MusicalNoteIcon, "text-pink-500");
  }

  // Video
  if (
    mimeType.startsWith("video/") ||
    ["mp4", "mov", "avi", "mkv"].includes(ext)
  ) {
    return renderIcon(FilmIcon, "text-rose-500");
  }

  // Documents
  switch (ext) {
    case "pdf":
      return renderIcon(DocumentTextIcon, "text-red-500");
    case "doc":
    case "docx":
      return renderIcon(DocumentIcon, "text-blue-500");
    case "xls":
    case "xlsx":
    case "csv":
      return renderIcon(TableCellsIcon, "text-green-500");
    case "ppt":
    case "pptx":
      return renderIcon(PresentationChartBarIcon, "text-orange-500");
    case "txt":
    case "md":
    case "json":
      return renderIcon(DocumentTextIcon, "text-neutral-500");
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
      return renderIcon(ArchiveBoxIcon, "text-yellow-500");
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "py":
    case "html":
    case "css":
      return renderIcon(CommandLineIcon, "text-slate-600");
    default:
      return renderIcon(PaperClipIcon, "text-neutral-400");
  }
};
