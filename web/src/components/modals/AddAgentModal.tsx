import { Modal } from "@/components/animate-ui/components/animate/modal";
import { Input } from "@/components/base/Input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import { Field, Button as HeadlessButton, Label } from "@headlessui/react";
import { CheckIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

// ============ Constants ============

// Preset DiceBear styles for avatar selection
const DICEBEAR_STYLES = [
  "adventurer",
  "avataaars",
  "bottts",
  "fun-emoji",
  "lorelei",
  "micah",
  "miniavs",
  "notionists",
  "open-peeps",
  "personas",
  "pixel-art",
  "shapes",
  "thumbs",
] as const;

/**
 * Build avatar URL - uses backend proxy if available for better China access.
 */
const buildAvatarUrl = (
  style: string,
  seed: string,
  backendUrl?: string,
): string => {
  if (backendUrl) {
    return `${backendUrl}/xyzen/api/v1/avatar/${style}/svg?seed=${encodeURIComponent(seed)}`;
  }
  return `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`;
};

// Generate preset avatars
const generatePresetAvatars = (backendUrl?: string) => {
  const avatars: { url: string; seed: string; style: string }[] = [];
  DICEBEAR_STYLES.forEach((style) => {
    for (let i = 0; i < 3; i++) {
      const seed = `${style}_${i}_preset`;
      avatars.push({
        url: buildAvatarUrl(style, seed, backendUrl),
        seed,
        style,
      });
    }
  });
  return avatars;
};

// ============ Avatar Selector Component ============

interface AvatarSelectorProps {
  currentAvatar?: string;
  onSelect: (avatarUrl: string) => void;
  backendUrl?: string;
}

function AvatarSelector({
  currentAvatar,
  onSelect,
  backendUrl,
}: AvatarSelectorProps) {
  const { t } = useTranslation();
  const [selectedStyle, setSelectedStyle] =
    useState<(typeof DICEBEAR_STYLES)[number]>("avataaars");
  const [isLoading, setIsLoading] = useState(false);

  const presetAvatars = useMemo(
    () => generatePresetAvatars(backendUrl),
    [backendUrl],
  );

  const filteredAvatars = presetAvatars.filter(
    (a) => a.style === selectedStyle,
  );

  const generateRandom = useCallback(async () => {
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const seed = Math.random().toString(36).slice(2, 10);
    const url = buildAvatarUrl(selectedStyle, seed, backendUrl);
    onSelect(url);
    setIsLoading(false);
  }, [selectedStyle, onSelect, backendUrl]);

  const handlePresetSelect = useCallback(
    async (avatarUrl: string) => {
      setIsLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 150));
      onSelect(avatarUrl);
      setIsLoading(false);
    },
    [onSelect],
  );

  return (
    <div className="space-y-4">
      {/* Current Avatar Preview */}
      <div className="flex items-center justify-center py-3">
        <motion.div
          className="relative group"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          <div className="absolute -inset-1.5 bg-linear-to-tr from-indigo-500 via-purple-500 to-pink-500 rounded-full opacity-40 group-hover:opacity-70 blur-lg transition-opacity duration-500" />

          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-black/50 rounded-full"
              >
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </motion.div>
            )}
          </AnimatePresence>

          <img
            src={
              currentAvatar ||
              buildAvatarUrl("avataaars", "default", backendUrl)
            }
            alt="Avatar"
            className="relative w-20 h-20 rounded-full bg-white dark:bg-neutral-800 border-3 border-white dark:border-neutral-700 shadow-xl"
          />
          {currentAvatar && !isLoading && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute bottom-0 right-0 w-6 h-6 bg-green-500 border-2 border-white dark:border-neutral-800 rounded-full flex items-center justify-center shadow-lg"
            >
              <CheckIcon className="w-3 h-3 text-white" />
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Style Selector */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
          {t("agents.sessionSettings.avatar.style")}
        </label>
        <div className="flex flex-wrap gap-1.5 max-h-16 overflow-y-auto p-0.5 scrollbar-thin">
          {DICEBEAR_STYLES.map((style) => (
            <Button
              key={style}
              type="button"
              variant={selectedStyle === style ? "default" : "outline"}
              size="sm"
              className={cn(
                "h-6 text-xs px-2 rounded-full transition-all duration-300",
                selectedStyle === style
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent shadow-sm"
                  : "text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700",
              )}
              onClick={() => setSelectedStyle(style)}
            >
              {style}
            </Button>
          ))}
        </div>
      </div>

      {/* Preset Avatars */}
      <div className="flex items-center gap-2">
        {filteredAvatars.map((avatar, i) => (
          <motion.button
            key={i}
            type="button"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => handlePresetSelect(avatar.url)}
            className={cn(
              "w-12 h-12 rounded-full overflow-hidden border-2 transition-colors duration-200 shadow-sm",
              currentAvatar === avatar.url
                ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900"
                : "border-transparent hover:border-neutral-300 dark:hover:border-neutral-600 bg-neutral-50 dark:bg-neutral-800",
            )}
          >
            <img
              src={avatar.url}
              alt={`Avatar ${i + 1}`}
              className="w-full h-full object-cover"
            />
          </motion.button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={generateRandom}
          disabled={isLoading}
          className="h-12 px-3 rounded-full"
        >
          <SparklesIcon className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ============ Main Component ============

interface AddAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (agentId: string) => void;
}

function AddAgentModal({ isOpen, onClose, onCreated }: AddAgentModalProps) {
  const { t } = useTranslation();
  const { createAgent, isCreatingAgent, backendUrl } = useXyzen();

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
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("agents.createTitle")}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
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
    </Modal>
  );
}

export default AddAgentModal;
