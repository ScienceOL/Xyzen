import { useXyzen } from "@/store";
import { Dialog, Transition } from "@headlessui/react";
import { ArrowDownTrayIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Fragment, useEffect, useState } from "react";
import { AudioRenderer } from "./renderers/AudioRenderer";
import { ImageRenderer } from "./renderers/ImageRenderer";
import { PdfRenderer } from "./renderers/PdfRenderer";
import { VideoRenderer } from "./renderers/VideoRenderer";
import type { PreviewFile } from "./types";

interface PreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: PreviewFile | null;
}

export const PreviewModal = ({ isOpen, onClose, file }: PreviewModalProps) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backendUrl = useXyzen((state) => state.backendUrl);
  const token = useXyzen((state) => state.token);

  // Helper to ensure URL is absolute
  const getFullUrl = (url: string | undefined): string => {
    if (!url) return "";
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    const base = backendUrl || window.location.origin;
    return `${base}${url.startsWith("/") ? url : `/${url}`}`;
  };

  useEffect(() => {
    if (isOpen && file) {
      let active = true;
      const loadContent = async () => {
        setLoading(true);
        setError(null);
        try {
          // If we already have a direct local blob/data URL, use it directly
          if (
            file.url &&
            (file.url.startsWith("blob:") || file.url.startsWith("data:"))
          ) {
            setBlobUrl(file.url);
            setLoading(false);
            return;
          }

          // Construct the API Proxy URL for download.
          // We DO NOT want the S3 presigned URL (fileService.getFileUrl) because it might
          // point to an internal Docker host (e.g. host.docker.internal) which is unreachable from the browser.
          // The proxy endpoint will stream the file through the backend.
          const proxyDownloadPath = `/xyzen/api/v1/files/${file.id}/download`;
          const fullUrl = getFullUrl(proxyDownloadPath);

          // Fetch the actual content with auth headers
          const response = await fetch(fullUrl, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });

          if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.statusText}`);
          }

          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);

          if (active) {
            setBlobUrl(objectUrl);
          } else {
            URL.revokeObjectURL(objectUrl);
          }
        } catch (err) {
          console.error(err);
          if (active) setError("Failed to load file preview");
        } finally {
          if (active) setLoading(false);
        }
      };

      loadContent();

      return () => {
        active = false;
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          setBlobUrl(null);
        }
      };
    } else {
      setBlobUrl(null);
    }
  }, [isOpen, file, backendUrl, token]);

  const renderContent = () => {
    if (loading) return <div className="text-white">Loading preview...</div>;
    if (error) return <div className="text-red-400">{error}</div>;
    if (!file || !blobUrl) return null;

    const type = file.type.toLowerCase();

    if (type.startsWith("image/")) {
      return <ImageRenderer file={file} url={blobUrl} />;
    }
    if (type.startsWith("video/")) {
      return <VideoRenderer file={file} url={blobUrl} />;
    }
    if (type.startsWith("audio/")) {
      return <AudioRenderer file={file} url={blobUrl} />;
    }
    if (type === "application/pdf") {
      return <PdfRenderer file={file} url={blobUrl} />;
    }

    return (
      <div className="flex flex-col items-center gap-4 text-white">
        <p>Preview not available for this file type.</p>
        <a
          href={blobUrl}
          download={file.name}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium hover:bg-indigo-700"
        >
          Download File
        </a>
      </div>
    );
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-5xl transform overflow-hidden rounded-2xl bg-neutral-900 p-6 text-left align-middle shadow-xl transition-all h-[80vh] flex flex-col border border-neutral-700">
                <div className="flex items-center justify-between border-b border-neutral-700 pb-4 mb-4">
                  <Dialog.Title
                    as="h3"
                    className="text-lg font-medium leading-6 text-white truncate pr-4"
                  >
                    {file?.name}
                  </Dialog.Title>
                  <div className="flex items-center gap-2">
                    {blobUrl && (
                      <a
                        href={blobUrl}
                        download={file?.name}
                        className="rounded-full p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
                        title="Download"
                      >
                        <ArrowDownTrayIcon className="h-6 w-6" />
                      </a>
                    )}
                    <button
                      onClick={onClose}
                      className="rounded-full p-1 text-neutral-400 hover:bg-neutral-800 hover:text-white transition-colors"
                      title="Close"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden flex items-center justify-center relative bg-black/40 rounded-lg">
                  {renderContent()}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};
