"use client";

import { Modal } from "@/components/animate-ui/components/animate/modal";
import {
  Tabs,
  TabsContent,
  TabsContents,
  TabsList,
  TabsTrigger,
} from "@/components/animate-ui/components/animate/tabs";
import {
  RippleButton,
  RippleButtonRipples,
} from "@/components/animate-ui/components/buttons/ripple";
import { Input as BaseInput } from "@/components/base/Input";
import PublishAgentModal from "@/components/features/PublishAgentModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import { Field, Button as HeadlessButton, Label } from "@headlessui/react";
import {
  ArrowLeftIcon,
  ArrowsPointingOutIcon,
  CheckIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  TrashIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "framer-motion";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import WorkflowEditor from "./editSession/WorkflowEditor";

// ============ Constants ============

// Preset DiceBear styles and seeds for avatar selection
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
 * Falls back to direct DiceBear API if backend URL is not configured.
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

// Generate a set of preset avatars using different styles and random seeds
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

// Tab types
type TabType = "profile" | "size" | "workflow" | "danger";

interface NavItem {
  id: TabType;
  icon: React.ElementType;
  labelKey: string;
  color?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "profile", icon: UserCircleIcon, labelKey: "profile" },
  { id: "size", icon: ArrowsPointingOutIcon, labelKey: "size" },
  { id: "workflow", icon: Cog6ToothIcon, labelKey: "workflow" },
  {
    id: "danger",
    icon: ExclamationTriangleIcon,
    labelKey: "danger",
    color: "text-red-500",
  },
];

// ============ Sub Components ============

interface GridResizerProps {
  currentW?: number;
  currentH?: number;
  onResize: (w: number, h: number) => void;
}

function GridResizer({
  currentW = 1,
  currentH = 1,
  onResize,
}: GridResizerProps) {
  const [hover, setHover] = useState<{ w: number; h: number } | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <div
          className="grid grid-cols-3 gap-3"
          onMouseLeave={() => setHover(null)}
        >
          {Array.from({ length: 9 }).map((_, i) => {
            const x = (i % 3) + 1;
            const y = Math.floor(i / 3) + 1;
            const isHovered = hover && x <= hover.w && y <= hover.h;
            const isSelected = !hover && x <= currentW && y <= currentH;

            return (
              <motion.div
                key={i}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "h-14 w-14 cursor-pointer rounded-xl border-2 transition-colors duration-200 shadow-sm",
                  isHovered || isSelected
                    ? "border-indigo-500 bg-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-400/20 shadow-indigo-500/30 shadow-lg"
                    : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-neutral-600",
                )}
                onMouseEnter={() => setHover({ w: x, h: y })}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onResize(x, y);
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="text-center">
        <motion.span
          key={hover ? `${hover.w}x${hover.h}` : `${currentW}x${currentH}`}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-block px-5 py-2 rounded-full bg-neutral-100 dark:bg-neutral-800 text-base font-bold text-neutral-700 dark:text-neutral-200 shadow-sm border border-neutral-200 dark:border-neutral-700"
        >
          {hover ? `${hover.w} × ${hover.h}` : `${currentW} × ${currentH}`}
        </motion.span>
      </div>
    </div>
  );
}

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
  const [customSeed, setCustomSeed] = useState("");
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

  const generateFromSeed = useCallback(async () => {
    if (!customSeed.trim()) return;
    setIsLoading(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const url = buildAvatarUrl(selectedStyle, customSeed.trim(), backendUrl);
    onSelect(url);
    setIsLoading(false);
    setCustomSeed("");
  }, [selectedStyle, customSeed, onSelect, backendUrl]);

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
    <div className="space-y-5">
      {/* Current Avatar Preview */}
      <div className="flex items-center justify-center py-4">
        <motion.div
          className="relative group"
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 300 }}
        >
          {/* Glow effect */}
          <div className="absolute -inset-1.5 bg-linear-to-tr from-indigo-500 via-purple-500 to-pink-500 rounded-full opacity-40 group-hover:opacity-70 blur-lg transition-opacity duration-500" />

          {/* Loading overlay */}
          <AnimatePresence>
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-black/50 rounded-full"
              >
                <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </motion.div>
            )}
          </AnimatePresence>

          <img
            src={
              currentAvatar ||
              buildAvatarUrl("avataaars", "default", backendUrl)
            }
            alt="Current avatar"
            className="relative w-28 h-28 rounded-full bg-white dark:bg-neutral-800 border-4 border-white dark:border-neutral-700 shadow-2xl"
          />
          {currentAvatar && !isLoading && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute bottom-0.5 right-0.5 w-8 h-8 bg-green-500 border-3 border-white dark:border-neutral-800 rounded-full flex items-center justify-center shadow-lg"
            >
              <CheckIcon className="w-4 h-4 text-white" />
            </motion.div>
          )}
        </motion.div>
      </div>

      <div className="space-y-4">
        {/* Style Selector */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-neutral-600 dark:text-neutral-400 pl-1">
            {t("agents.sessionSettings.avatar.style")}
          </label>
          <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto p-1 -mx-1 scrollbar-thin scrollbar-thumb-neutral-200 dark:scrollbar-thumb-neutral-700">
            {DICEBEAR_STYLES.map((style) => (
              <Button
                key={style}
                type="button"
                variant={selectedStyle === style ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-8 text-xs px-3 rounded-full transition-all duration-300",
                  selectedStyle === style
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white border-transparent shadow-md shadow-indigo-500/25"
                    : "text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                )}
                onClick={() => setSelectedStyle(style)}
              >
                {style}
              </Button>
            ))}
          </div>
        </div>

        {/* Preset Avatars Grid */}
        <div className="grid grid-cols-6 gap-2.5">
          {filteredAvatars.map((avatar, i) => (
            <motion.button
              key={i}
              type="button"
              whileHover={{ scale: 1.12 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handlePresetSelect(avatar.url)}
              className={cn(
                "aspect-square rounded-full overflow-hidden border-2 transition-colors duration-200 shadow-sm hover:shadow-lg",
                currentAvatar === avatar.url
                  ? "border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-900 shadow-indigo-500/30"
                  : "border-transparent hover:border-neutral-300 dark:hover:border-neutral-600 bg-neutral-50 dark:bg-neutral-800",
              )}
            >
              <img
                src={avatar.url}
                alt={`Avatar option ${i + 1}`}
                className="w-full h-full object-cover"
              />
            </motion.button>
          ))}
        </div>
      </div>

      {/* Random & Custom Seed */}
      <div className="flex gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
        <RippleButton
          type="button"
          variant="outline"
          onClick={generateRandom}
          disabled={isLoading}
          className="shrink-0 gap-2 h-10 w-28 text-sm font-medium"
        >
          <SparklesIcon className="w-4 h-4 text-indigo-500" />
          <span className="truncate">
            {isLoading
              ? t("agents.sessionSettings.avatar.loading")
              : t("agents.sessionSettings.avatar.random")}
          </span>
          <RippleButtonRipples />
        </RippleButton>
        <div className="flex-1 flex gap-2">
          <Input
            type="text"
            value={customSeed}
            onChange={(e) => setCustomSeed(e.target.value)}
            placeholder={t("agents.sessionSettings.avatar.seedPlaceholder")}
            className="flex-1 h-10 text-sm bg-neutral-50 dark:bg-neutral-800/50"
            onKeyDown={(e) => e.key === "Enter" && generateFromSeed()}
          />
          <Button
            type="button"
            size="default"
            onClick={generateFromSeed}
            disabled={!customSeed.trim() || isLoading}
            className="h-10 px-4 transition-all hover:shadow-md"
          >
            {t("agents.sessionSettings.avatar.apply")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ============ Profile Editor Component ============

interface ProfileEditorProps {
  agent: Agent;
  currentAvatar?: string;
  onAvatarChange: (avatarUrl: string) => void;
  onClose: () => void;
}

function ProfileEditor({
  agent: agentToEdit,
  currentAvatar,
  onAvatarChange,
  onClose,
}: ProfileEditorProps) {
  const { t } = useTranslation();
  const backendUrl = useXyzen((state) => state.backendUrl);
  const { updateAgent } = useXyzen();
  const [agent, setAgent] = useState<Agent>(agentToEdit);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setAgent(agentToEdit);
  }, [agentToEdit]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setAgent({ ...agent, [name]: value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setIsSaving(true);
    try {
      await updateAgent({
        ...agent,
      });
      onClose();
    } catch (error) {
      console.error("Failed to update agent:", error);
      alert(t("agents.errors.updateFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Avatar Section */}
      <AvatarSelector
        currentAvatar={currentAvatar}
        onSelect={onAvatarChange}
        backendUrl={backendUrl}
      />

      {/* Divider */}
      <div className="border-t border-neutral-200 dark:border-neutral-700" />

      {/* Name & Description */}
      <div className="space-y-4">
        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("agents.fields.name.label")}
          </Label>
          <BaseInput
            name="name"
            value={agent.name}
            onChange={handleChange}
            placeholder={t("agents.fields.name.placeholder")}
            required
          />
        </Field>

        <Field>
          <Label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("agents.fields.description.label")}
          </Label>
          <BaseInput
            name="description"
            value={agent.description}
            onChange={handleChange}
            placeholder={t("agents.fields.description.placeholder")}
          />
        </Field>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-700">
        <HeadlessButton
          type="submit"
          disabled={isSaving}
          className={`inline-flex items-center gap-2 rounded-md py-2 px-4 text-sm font-medium transition-colors ${
            isSaving
              ? "bg-indigo-400 text-white cursor-not-allowed"
              : "bg-indigo-600 text-white hover:bg-indigo-500"
          }`}
        >
          {isSaving ? t("agents.actions.saving") : t("agents.actions.save")}
        </HeadlessButton>
      </div>
    </form>
  );
}

// ============ Workflow Editor Component ============

// ============ Main Component ============

interface AgentSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  agentId: string;
  agentName: string;
  agent?: Agent | null;
  currentAvatar?: string;
  currentGridSize?: { w: number; h: number };
  onAvatarChange: (avatarUrl: string) => void;
  onGridSizeChange: (w: number, h: number) => void;
  onDelete?: () => void;
}

const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  isOpen,
  onClose,
  agentName,
  agent,
  currentAvatar,
  currentGridSize,
  onAvatarChange,
  onGridSizeChange,
  onDelete,
}) => {
  const { t } = useTranslation();
  const backendUrl = useXyzen((state) => state.backendUrl);

  // Desktop: tab selection, Mobile: drill-down navigation
  const [activeTab, setActiveTab] = useState<TabType>("profile");
  const [mobileActiveTab, setMobileActiveTab] = useState<TabType | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);

  // Check if mobile
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  // Determine if agent tab is available
  const hasAgentData = !!agent;

  // Build filtered nav items based on available data
  const filteredNavItems = useMemo(() => {
    return NAV_ITEMS.filter((item) => {
      if (item.id === "workflow" && !hasAgentData) return false;
      if (item.id === "danger" && !onDelete) return false;
      return true;
    });
  }, [hasAgentData, onDelete]);

  const handleTabClick = (tab: TabType) => {
    if (isMobile) {
      setMobileActiveTab(tab);
    } else {
      setActiveTab(tab);
    }
    setShowDeleteConfirm(false);
  };

  const handleMobileBack = () => {
    setMobileActiveTab(null);
    setShowDeleteConfirm(false);
  };

  // Render tab content
  const renderTabContent = (tab: TabType) => {
    switch (tab) {
      case "profile":
        if (!agent) {
          return (
            <AvatarSelector
              currentAvatar={currentAvatar}
              onSelect={onAvatarChange}
              backendUrl={backendUrl}
            />
          );
        }
        return (
          <ProfileEditor
            agent={agent}
            currentAvatar={currentAvatar}
            onAvatarChange={onAvatarChange}
            onClose={onClose}
          />
        );
      case "size":
        return (
          <div className="flex flex-col items-center justify-center h-full py-8">
            <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-8 text-center max-w-64">
              {t("agents.sessionSettings.size.description")}
            </p>
            <GridResizer
              currentW={currentGridSize?.w}
              currentH={currentGridSize?.h}
              onResize={onGridSizeChange}
            />
          </div>
        );
      case "workflow":
        if (!agent) return null;
        return <WorkflowEditor agent={agent} onClose={onClose} />;
      case "danger":
        return (
          <div className="flex flex-col items-center justify-center h-full py-8 space-y-6">
            {!showDeleteConfirm ? (
              <>
                <div className="text-center space-y-2">
                  <ExclamationTriangleIcon className="w-12 h-12 mx-auto text-red-400" />
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 max-w-64">
                    {t("agents.sessionSettings.danger.description")}
                  </p>
                </div>
                {onDelete && (
                  <Button
                    variant="destructive"
                    size="lg"
                    className="h-11 px-6 gap-3 shadow-lg shadow-red-500/20"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <TrashIcon className="w-5 h-5" />
                    {t("agents.sessionSettings.danger.deleteButton")}
                  </Button>
                )}
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-sm rounded-2xl bg-red-50 dark:bg-red-900/10 p-6 space-y-4 border border-red-100 dark:border-red-900/20"
              >
                <div className="text-center space-y-2">
                  <h3 className="text-base font-semibold text-red-700 dark:text-red-300">
                    {t("agents.sessionSettings.danger.deleteConfirmTitle")}
                  </h3>
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {t("agents.sessionSettings.danger.deleteConfirmMessage", {
                      name: agentName,
                    })}
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 bg-white dark:bg-transparent border-red-200 dark:border-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/20"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    className="flex-1 shadow-lg shadow-red-500/20"
                    onClick={() => {
                      onDelete?.();
                      onClose();
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                </div>
              </motion.div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  // Mobile content view
  const mobileContent = (
    <div className="flex-1 min-w-0">
      <AnimatePresence mode="wait">
        {mobileActiveTab === null ? (
          <motion.div
            key="nav"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-2"
          >
            {filteredNavItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-4 rounded-xl transition-all text-left",
                  "bg-neutral-50 dark:bg-neutral-800/50 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                  item.color,
                )}
              >
                <item.icon className="w-6 h-6 shrink-0" />
                <span className="text-base font-medium">
                  {t(`agents.sessionSettings.tabs.${item.labelKey}`)}
                </span>
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key={mobileActiveTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
          >
            <button
              onClick={handleMobileBack}
              className="flex items-center gap-2 text-sm text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 mb-4"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              {t("settings.modal.back")}
            </button>
            {renderTabContent(mobileActiveTab)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // Desktop content view with animate-ui Tabs
  const desktopContent = (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        setActiveTab(value as TabType);
        setShowDeleteConfirm(false);
      }}
      className="flex flex-row gap-6"
    >
      {/* Left sidebar with vertical tabs */}
      <div className="w-44 shrink-0">
        <TabsList className="flex items-start flex-col w-full h-auto bg-neutral-50 dark:bg-neutral-900 rounded-xl p-1.5">
          {filteredNavItems.map((item) => (
            <TabsTrigger
              key={item.id}
              value={item.id}
              className={cn(
                "w-44 justify-start gap-3 px-3 py-2.5 text-sm font-medium rounded-lg",
                "data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-neutral-800",
                item.id === "danger" &&
                  "data-[state=active]:text-red-600 dark:data-[state=active]:text-red-400",
                item.color && activeTab !== item.id && item.color,
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {t(`agents.sessionSettings.tabs.${item.labelKey}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {/* Right content area */}
      <div className="flex-1 min-w-0">
        <TabsContents>
          {filteredNavItems.map((item) => (
            <TabsContent key={item.id} value={item.id} className="h-full">
              {renderTabContent(item.id)}
            </TabsContent>
          ))}
        </TabsContents>
      </div>
    </Tabs>
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t("agents.sessionSettings.title", { name: agentName })}
        maxWidth="max-w-4xl"
      >
        <div className="py-2">
          {/* Responsive layout */}
          <div className="md:hidden">{mobileContent}</div>
          <div className="hidden md:block">{desktopContent}</div>
        </div>

        {/* Publish to Marketplace Button - only show if agent exists */}
        {agent && (
          <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPublishModal(true)}
              disabled={!agent.graph_config}
              className="w-full gap-2 h-10 text-purple-700 border-purple-200 hover:bg-purple-50 dark:text-purple-300 dark:border-purple-800 dark:hover:bg-purple-900/20"
              title={
                !agent.graph_config
                  ? t("agents.actions.publishTooltip")
                  : t("agents.actions.publish")
              }
            >
              <SparklesIcon className="h-4 w-4" />
              {t("agents.actions.publish")}
            </Button>
          </div>
        )}
      </Modal>

      {/* Publish to Marketplace Modal */}
      {agent && (
        <PublishAgentModal
          open={showPublishModal}
          onOpenChange={setShowPublishModal}
          agentId={agent.id}
          agentName={agent.name}
          agentDescription={agent.description}
          agentPrompt={agent.prompt}
          graphConfig={agent.graph_config}
          mcpServers={agent.mcp_servers?.map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description || undefined,
          }))}
          onPublishSuccess={(marketplaceId) => {
            console.log("Agent published to marketplace:", marketplaceId);
            setShowPublishModal(false);
          }}
        />
      )}
    </>
  );
};

export default AgentSettingsModal;
