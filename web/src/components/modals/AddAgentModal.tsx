import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { Input } from "@/components/base/Input";
import {
  AvatarSelector,
  buildAvatarUrl,
} from "@/components/features/AvatarSelector";
import { cn } from "@/lib/utils";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import { useShallow } from "zustand/react/shallow";
import { Field, Button as HeadlessButton, Label } from "@headlessui/react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

// ============ Main Component ============

interface AddAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (agentId: string) => void;
}

function AddAgentModal({ isOpen, onClose, onCreated }: AddAgentModalProps) {
  const { t } = useTranslation();
  const { createAgent, isCreatingAgent, backendUrl, agents } = useXyzen(
    useShallow((s) => ({
      createAgent: s.createAgent,
      isCreatingAgent: s.isCreatingAgent,
      backendUrl: s.backendUrl,
      agents: s.agents,
    })),
  );

  const [agent, setAgent] = useState<
    Omit<
      Agent,
      | "id"
      | "user_id"
      | "mcp_servers"
      | "mcp_server_ids"
      | "created_at"
      | "updated_at"
    >
  >({
    name: "",
    description: "",
    prompt: "",
  });
  const [avatar, setAvatar] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate random avatar on open
  useEffect(() => {
    if (isOpen && !avatar) {
      const seed = Math.random().toString(36).slice(2, 10);
      setAvatar(buildAvatarUrl("avataaars", seed, backendUrl));
    }
  }, [isOpen, avatar, backendUrl]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setAgent((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSubmitting) return;
    if (!agent.name) {
      alert(t("agents.errors.nameRequired"));
      return;
    }
    if (agents.some((a) => a.name === agent.name)) {
      alert(t("agents.errors.nameDuplicate"));
      return;
    }

    setIsSubmitting(true);
    try {
      const newAgentId = await createAgent({
        ...agent,
        avatar,
        mcp_server_ids: [],
        user_id: "temp",
        mcp_servers: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      handleClose();
      if (newAgentId && onCreated) {
        onCreated(newAgentId);
      }
    } catch (error) {
      console.error("Failed to create agent:", error);
      alert(t("agents.errors.createFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitDisabled = isSubmitting || isCreatingAgent || !agent.name;

  const handleClose = () => {
    setAgent({
      name: "",
      description: "",
      prompt: "",
    });
    setAvatar("");
    onClose();
  };

  return (
    <SheetModal isOpen={isOpen} onClose={handleClose} size="md">
      <div className="flex h-full flex-col overflow-hidden">
        <div className="shrink-0 px-5 pt-5 pb-1 md:pt-2">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            {t("agents.createTitle")}
          </h2>
        </div>
        <form
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto custom-scrollbar px-5 pb-5 space-y-5"
        >
          {/* Avatar */}
          <AvatarSelector
            currentAvatar={avatar}
            onSelect={setAvatar}
            backendUrl={backendUrl}
          />

          {/* Divider */}
          <div className="border-t border-neutral-200 dark:border-neutral-700" />

          {/* Name */}
          <Field>
            <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t("agents.fields.name.required")}
            </Label>
            <Input
              name="name"
              value={agent.name}
              onChange={handleChange}
              placeholder={t("agents.fields.name.placeholder")}
              className="mt-1"
              required
            />
          </Field>

          {/* Description */}
          <Field>
            <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {t("agents.fields.description.label")}
            </Label>
            <Input
              name="description"
              value={agent.description}
              onChange={handleChange}
              placeholder={t("agents.fields.description.placeholder")}
              className="mt-1"
            />
          </Field>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
            <HeadlessButton
              type="button"
              onClick={handleClose}
              className="inline-flex items-center gap-2 rounded-md bg-neutral-100 py-2 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 transition-colors"
            >
              {t("agents.actions.cancel")}
            </HeadlessButton>
            <HeadlessButton
              type="submit"
              disabled={submitDisabled}
              className={cn(
                "inline-flex items-center gap-2 rounded-md py-2 px-4 text-sm font-medium transition-colors",
                submitDisabled
                  ? "bg-neutral-400 text-white cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-500",
              )}
            >
              {isSubmitting || isCreatingAgent
                ? t("agents.actions.creating")
                : t("agents.actions.create")}
            </HeadlessButton>
          </div>
        </form>
      </div>
    </SheetModal>
  );
}

export default AddAgentModal;
