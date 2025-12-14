export interface PreviewFile {
  id: string;
  url?: string;
  name: string;
  type: string; // MIME type
  size?: number;
}

export interface RendererProps {
  file: PreviewFile;
  url: string; // The accessible URL (blob or remote)
  className?: string;
}
