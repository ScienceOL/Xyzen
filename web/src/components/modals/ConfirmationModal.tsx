"use client";

import { Modal } from "@/components/base/Modal";
import { Button } from "@headlessui/react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="mt-4">
        <div className="flex items-start">
          <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
            <ExclamationTriangleIcon
              className="h-6 w-6 text-red-600"
              aria-hidden="true"
            />
          </div>
          <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {message}
            </p>
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-4">
        <Button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 rounded-md bg-neutral-100 py-1.5 px-3 text-sm/6 font-semibold text-neutral-700 shadow-sm focus:outline-none data-[hover]:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:data-[hover]:bg-neutral-700"
        >
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className="inline-flex items-center gap-2 rounded-md bg-red-600 py-1.5 px-3 text-sm/6 font-semibold text-white shadow-inner shadow-white/10 focus:outline-none data-[hover]:bg-red-500 data-[open]:bg-red-700 data-[focus]:outline-1 data-[focus]:outline-white dark:bg-red-500 dark:data-[hover]:bg-red-400"
        >
          Confirm
        </Button>
      </div>
    </Modal>
  );
};

export default ConfirmationModal;
