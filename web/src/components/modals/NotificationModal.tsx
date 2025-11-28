"use client";

import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@/components/animate-ui/primitives/headless/dialog";
import { zIndexClasses } from "@/constants/zIndex";
import { Button } from "@headlessui/react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  type?: "info" | "warning" | "error" | "success";
  actionLabel?: string;
  onAction?: () => void;
}

const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  title,
  message,
  type = "info",
  actionLabel,
  onAction,
}) => {
  const getIconAndColor = () => {
    switch (type) {
      case "warning":
        return {
          icon: ExclamationTriangleIcon,
          bgColor: "bg-yellow-100",
          iconColor: "text-yellow-600",
          buttonColor:
            "bg-yellow-600 data-[hover]:bg-yellow-500 dark:bg-yellow-500 dark:data-[hover]:bg-yellow-400",
        };
      case "error":
        return {
          icon: XCircleIcon,
          bgColor: "bg-red-100",
          iconColor: "text-red-600",
          buttonColor:
            "bg-red-600 data-[hover]:bg-red-500 dark:bg-red-500 dark:data-[hover]:bg-red-400",
        };
      case "success":
        return {
          icon: CheckCircleIcon,
          bgColor: "bg-green-100",
          iconColor: "text-green-600",
          buttonColor:
            "bg-green-600 data-[hover]:bg-green-500 dark:bg-green-500 dark:data-[hover]:bg-green-400",
        };
      default:
        return {
          icon: InformationCircleIcon,
          bgColor: "bg-blue-100",
          iconColor: "text-blue-600",
          buttonColor:
            "bg-blue-600 data-[hover]:bg-blue-500 dark:bg-blue-500 dark:data-[hover]:bg-blue-400",
        };
    }
  };

  const { icon: Icon, bgColor, iconColor, buttonColor } = getIconAndColor();

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className={`relative ${zIndexClasses.max}`}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
        <DialogPanel
          from="top"
          className="w-full max-w-md space-y-4 rounded-sm border border-neutral-200/20 bg-white/95 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-neutral-700/30 dark:bg-neutral-900/95 dark:shadow-black/40"
        >
          <DialogTitle className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            {title}
          </DialogTitle>

          <div className="mt-4">
            <div className="flex items-start">
              <div
                className={`mx-auto flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full ${bgColor} sm:mx-0 sm:h-10 sm:w-10`}
              >
                <Icon className={`h-6 w-6 ${iconColor}`} aria-hidden="true" />
              </div>
              <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  {message}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-4">
            {actionLabel && onAction ? (
              <>
                <Button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 rounded-sm bg-neutral-100 py-1.5 px-3 text-sm/6 font-semibold text-neutral-700 shadow-sm focus:outline-none data-[hover]:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:data-[hover]:bg-neutral-700"
                >
                  Close
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    onAction();
                    onClose();
                  }}
                  className={`inline-flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm/6 font-semibold text-white shadow-inner shadow-white/10 focus:outline-none ${buttonColor}`}
                >
                  {actionLabel}
                </Button>
              </>
            ) : (
              <Button
                type="button"
                onClick={onClose}
                className={`inline-flex items-center gap-2 rounded-sm py-1.5 px-3 text-sm/6 font-semibold text-white shadow-inner shadow-white/10 focus:outline-none ${buttonColor}`}
              >
                OK
              </Button>
            )}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
};

export default NotificationModal;
