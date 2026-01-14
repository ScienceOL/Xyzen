import { Modal } from "@/components/animate-ui/components/animate/modal";
import { useState } from "react";

export interface TokenInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (token: string) => void | Promise<void>;
}

export function TokenInputModal({
  isOpen,
  onClose,
  onSubmit,
}: TokenInputModalProps) {
  const [tokenInput, setTokenInput] = useState("");

  const handleClose = () => {
    setTokenInput("");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    await onSubmit(tokenInput.trim());
    handleClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="输入访问令牌"
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="token-input"
            className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            访问令牌
          </label>
          <input
            id="token-input"
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="请输入您的访问令牌"
            className="w-full rounded-sm border border-neutral-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-neutral-600 dark:bg-neutral-700 dark:text-neutral-100"
            autoFocus
            required
          />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            请输入有效的访问令牌进行身份验证
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-sm px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            取消
          </button>
          <button
            type="submit"
            className="rounded-sm bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            确认
          </button>
        </div>
      </form>
    </Modal>
  );
}
