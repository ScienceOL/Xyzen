import { Modal } from "@/components/animate-ui/components/animate/modal";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

export interface CreateKnowledgeSetModalValues {
  name: string;
  description: string;
}

interface CreateKnowledgeSetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (values: CreateKnowledgeSetModalValues) => Promise<void>;
}

export function CreateKnowledgeSetModal({
  isOpen,
  onClose,
  onCreate,
}: CreateKnowledgeSetModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setDescription("");
    setIsSubmitting(false);
    setError(null);
  }, [isOpen]);

  const trimmedName = useMemo(() => name.trim(), [name]);
  const canSubmit = trimmedName.length > 0 && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedName) {
      setError(t("knowledge.createKnowledgeSetModal.validation.nameRequired"));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onCreate({
        name: trimmedName,
        description: description.trim(),
      });
      onClose();
    } catch {
      setError(t("knowledge.createKnowledgeSetModal.errors.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t("knowledge.createKnowledgeSetModal.title")}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="knowledge-set-name"
            className="text-sm font-medium text-neutral-800 dark:text-neutral-200"
          >
            {t("knowledge.createKnowledgeSetModal.fields.name.label")}
          </label>
          <input
            id="knowledge-set-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t(
              "knowledge.createKnowledgeSetModal.fields.name.placeholder",
            )}
            disabled={isSubmitting}
            autoFocus
            className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="knowledge-set-description"
            className="text-sm font-medium text-neutral-800 dark:text-neutral-200"
          >
            {t("knowledge.createKnowledgeSetModal.fields.description.label")}
          </label>
          <textarea
            id="knowledge-set-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t(
              "knowledge.createKnowledgeSetModal.fields.description.placeholder",
            )}
            disabled={isSubmitting}
            rows={3}
            className="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white"
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {isSubmitting
              ? t("knowledge.createKnowledgeSetModal.actions.creating")
              : t("knowledge.createKnowledgeSetModal.actions.create")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
