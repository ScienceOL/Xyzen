/**
 * Mobile More Menu
 *
 * A popup menu shown on mobile with tool selector and MCP management.
 */

import McpIcon from "@/assets/McpIcon";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/animate-ui/components/radix/accordion";
import { Switch } from "@/components/animate-ui/components/radix/switch";
import { zIndexClasses } from "@/constants/zIndex";
import {
  isKnowledgeEnabled,
  isSandboxEnabled,
  isSkillsAutoEnabled,
  updateKnowledgeEnabled,
  updateSandboxEnabled,
  updateSkillsAutoEnabled,
} from "@/core/agent/toolConfig";
import { cn } from "@/lib/utils";
import {
  knowledgeSetService,
  type KnowledgeSetWithFileCount,
} from "@/service/knowledgeSetService";
import type { RunnerRead } from "@/service/runnerService";
import { sandboxService, type SandboxEntry } from "@/service/sandboxService";
import { skillService } from "@/service/skillService";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import type { McpServer } from "@/types/mcp";
import type { SkillRead } from "@/types/skills";
import {
  BookOpenIcon,
  CheckIcon,
  Cog6ToothIcon,
  CommandLineIcon,
  SparklesIcon,
} from "@heroicons/react/24/outline";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import CreateSkillModal from "./CreateSkillModal";
import { ToolSelector } from "./ToolSelector";
import { partitionSkills, toggleSkillAttachment } from "./skillActions";

interface McpInfo {
  agent: Agent;
  servers: McpServer[];
}

interface MobileMoreMenuProps {
  isOpen: boolean;
  agent: Agent | null;
  onUpdateAgent: (agent: Agent) => Promise<void>;
  onAgentRefresh: () => Promise<void>;
  mcpInfo: McpInfo | null;
  allMcpServers?: McpServer[];
  onOpenSettings?: () => void;
  // Knowledge
  sessionKnowledgeSetId?: string | null;
  onUpdateSessionKnowledge?: (knowledgeSetId: string | null) => Promise<void>;
  // Sandbox
  sessionSandboxBackend?: string | null;
  onUpdateSessionSandboxBackend?: (backend: string | null) => Promise<void>;
}

export function MobileMoreMenu({
  isOpen,
  agent,
  onUpdateAgent,
  onAgentRefresh,
  mcpInfo,
  allMcpServers = [],
  onOpenSettings,
  sessionKnowledgeSetId,
  onUpdateSessionKnowledge,
  sessionSandboxBackend,
  onUpdateSessionSandboxBackend,
}: MobileMoreMenuProps) {
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [isLoadingSkills, setIsLoadingSkills] = useState(false);
  const [isUpdatingSkillId, setIsUpdatingSkillId] = useState<string | null>(
    null,
  );
  const [showCreateSkillModal, setShowCreateSkillModal] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [allSkills, setAllSkills] = useState<SkillRead[]>([]);
  const [attachedSkills, setAttachedSkills] = useState<SkillRead[]>([]);

  // Knowledge state
  const [knowledgeSets, setKnowledgeSets] = useState<
    KnowledgeSetWithFileCount[]
  >([]);
  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(false);

  // Sandbox state
  const [sandboxes, setSandboxes] = useState<SandboxEntry[]>([]);
  const [isLoadingSandbox, setIsLoadingSandbox] = useState(false);
  const [sandboxesLoaded, setSandboxesLoaded] = useState(false);
  const validatedRef = useRef<string | null>(null);

  const { runners, fetchRunners } = useXyzen(
    useShallow((s) => ({
      runners: s.runners,
      fetchRunners: s.fetchRunners,
    })),
  );

  const handleUpdateAgent = async (updatedAgent: Agent) => {
    await onUpdateAgent(updatedAgent);
    // Don't close on toggle - let user configure multiple tools
  };

  const { connected: connectedSkills, available: availableSkills } = useMemo(
    () => partitionSkills(allSkills, attachedSkills),
    [allSkills, attachedSkills],
  );

  const skillsAuto = isSkillsAutoEnabled(agent);
  const agentId = agent?.id;

  const handleSkillAutoToggle = async () => {
    if (!agent) return;
    setSkillsError(null);
    try {
      const newGraphConfig = updateSkillsAutoEnabled(agent, !skillsAuto);
      await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
      await onAgentRefresh();
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "Failed to update skills auto mode";
      setSkillsError(message);
    }
  };

  // Get connected server IDs from agent
  const connectedServerIds = new Set(
    agent?.mcp_server_ids || agent?.mcp_servers?.map((s) => s.id) || [],
  );

  // Separate servers into connected and available
  const connectedServers = allMcpServers.filter((server) =>
    connectedServerIds.has(server.id),
  );
  const availableServers = allMcpServers.filter(
    (server) => !connectedServerIds.has(server.id),
  );

  const totalTools =
    mcpInfo?.servers.reduce(
      (total, server) => total + (server.tools?.length || 0),
      0,
    ) || 0;

  const loadSkills = useCallback(async () => {
    if (!agentId) return;

    setIsLoadingSkills(true);
    setSkillsError(null);
    try {
      const [skills, agentSkills] = await Promise.all([
        skillService.listSkills(),
        skillService.listAgentSkills(agentId),
      ]);
      setAllSkills(skills);
      setAttachedSkills(agentSkills);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : t("app.toolbar.skills.loadFailed", "Failed to load skills");
      setSkillsError(message);
    } finally {
      setIsLoadingSkills(false);
    }
  }, [agentId, t]);

  useEffect(() => {
    if (!isOpen || !agentId) return;
    void loadSkills();
  }, [isOpen, agentId, loadSkills]);

  const handleMcpServerToggle = async (serverId: string, connect: boolean) => {
    if (!agent || isUpdating) return;

    setIsUpdating(serverId);
    try {
      const currentIds =
        agent.mcp_server_ids || agent.mcp_servers?.map((s) => s.id) || [];
      const newIds = connect
        ? [...currentIds, serverId]
        : currentIds.filter((id) => id !== serverId);

      await onUpdateAgent({
        ...agent,
        mcp_server_ids: newIds,
      });
    } catch (error) {
      console.error("Failed to update MCP server:", error);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleSkillToggle = async (skill: SkillRead, isConnected: boolean) => {
    if (!agent || isUpdatingSkillId) return;

    setIsUpdatingSkillId(skill.id);
    setSkillsError(null);
    try {
      await toggleSkillAttachment(agent.id, skill.id, isConnected);
      await Promise.all([loadSkills(), onAgentRefresh()]);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : t(
              "app.toolbar.skills.toggleFailed",
              "Failed to update skill attachment",
            );
      setSkillsError(message);
    } finally {
      setIsUpdatingSkillId(null);
    }
  };

  // ---- Knowledge handlers ----
  const knowledgeEnabled = isKnowledgeEnabled(agent);
  const effectiveKnowledgeSetId =
    sessionKnowledgeSetId || agent?.knowledge_set_id;
  const isKnowledgeOn = knowledgeEnabled && !!effectiveKnowledgeSetId;

  const loadKnowledgeSets = useCallback(async () => {
    setIsLoadingKnowledge(true);
    try {
      const sets = await knowledgeSetService.listKnowledgeSets();
      setKnowledgeSets(sets);
    } catch (error) {
      console.error("Failed to load knowledge sets:", error);
    } finally {
      setIsLoadingKnowledge(false);
    }
  }, []);

  const handleKnowledgeSelect = async (knowledgeSetId: string | null) => {
    if (onUpdateSessionKnowledge) {
      await onUpdateSessionKnowledge(knowledgeSetId);
    }
    if (knowledgeSetId && agent && !knowledgeEnabled) {
      const newGraphConfig = updateKnowledgeEnabled(agent, true);
      await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
    }
  };

  const handleKnowledgeToggle = async (checked: boolean) => {
    if (!agent) return;
    if (!checked) {
      if (onUpdateSessionKnowledge) {
        await onUpdateSessionKnowledge(null);
      }
      const newGraphConfig = updateKnowledgeEnabled(agent, false);
      await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
    } else {
      const newGraphConfig = updateKnowledgeEnabled(agent, true);
      await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
    }
  };

  // ---- Sandbox handlers ----
  const sandboxEnabled = isSandboxEnabled(agent);
  const effectiveBackend = sessionSandboxBackend || null;

  const loadSandboxData = useCallback(() => {
    fetchRunners();
    setIsLoadingSandbox(true);
    sandboxService
      .listSandboxes()
      .then((resp) => setSandboxes(resp.sandboxes))
      .catch(console.error)
      .finally(() => {
        setIsLoadingSandbox(false);
        setSandboxesLoaded(true);
      });
  }, [fetchRunners]);

  // Validate saved sandbox selection
  useEffect(() => {
    if (!effectiveBackend || !onUpdateSessionSandboxBackend) return;
    if (validatedRef.current === effectiveBackend) return;

    if (effectiveBackend.startsWith("runner:")) {
      if (runners.length === 0) return;
      validatedRef.current = effectiveBackend;
      const runnerId = effectiveBackend.slice(7);
      const runner = runners.find((r: RunnerRead) => r.id === runnerId);
      if (!runner || !runner.is_online) {
        onUpdateSessionSandboxBackend(null);
      }
    } else if (effectiveBackend.startsWith("sandbox:")) {
      if (!sandboxesLoaded) return;
      validatedRef.current = effectiveBackend;
      const sessionId = effectiveBackend.slice(8);
      const sandbox = sandboxes.find((s) => s.session_id === sessionId);
      if (!sandbox) {
        onUpdateSessionSandboxBackend(null);
      }
    }
  }, [
    effectiveBackend,
    runners,
    sandboxes,
    sandboxesLoaded,
    onUpdateSessionSandboxBackend,
  ]);

  const handleSandboxSelect = async (value: string | null) => {
    if (onUpdateSessionSandboxBackend) {
      await onUpdateSessionSandboxBackend(value);
    }
  };

  const handleSandboxToggle = async (checked: boolean) => {
    if (!agent) return;
    const newGraphConfig = updateSandboxEnabled(agent, checked);
    await onUpdateAgent({ ...agent, graph_config: newGraphConfig });
    if (!checked && onUpdateSessionSandboxBackend) {
      await onUpdateSessionSandboxBackend(null);
    }
  };

  // Lazy-load data when accordion sections open
  const handleAccordionChange = useCallback(
    (value: string[]) => {
      if (value.includes("knowledge")) void loadKnowledgeSets();
      if (value.includes("sandbox")) loadSandboxData();
      if (value.includes("skills")) void loadSkills();
    },
    [loadKnowledgeSets, loadSandboxData, loadSkills],
  );

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`absolute bottom-full left-0 right-0 mx-2 mb-2 ${zIndexClasses.popover} rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-800 dark:bg-neutral-900 p-1.5`}
          >
            <div className="custom-scrollbar flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
              {/* Tool Selector */}
              {agent && (
                <div className="w-full">
                  <ToolSelector
                    agent={agent}
                    onUpdateAgent={handleUpdateAgent}
                    displayMode="list"
                    showTooltip={false}
                  />
                </div>
              )}

              {/* Expandable sections */}
              {agent && (
                <Accordion
                  type="multiple"
                  onValueChange={handleAccordionChange}
                  className="w-full"
                >
                  {/* Knowledge */}
                  <AccordionItem value="knowledge" className="border-none">
                    <AccordionTrigger className="px-2.5 py-1.5 hover:no-underline hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md [&>svg]:hidden">
                      <div className="flex w-full items-center justify-between text-xs font-medium text-neutral-600 dark:text-neutral-400">
                        <div className="flex items-center gap-1.5">
                          <BookOpenIcon
                            className={cn(
                              "h-3.5 w-3.5",
                              isKnowledgeOn && "text-purple-500",
                            )}
                          />
                          <span>{t("app.toolbar.knowledge", "Knowledge")}</span>
                        </div>
                        {isKnowledgeOn && (
                          <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-600 dark:bg-purple-900/50 dark:text-purple-400">
                            {t("common.on", "ON")}
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1">
                      <div className="ml-2 space-y-2 pl-2">
                        <div className="flex items-center justify-between px-2 py-1">
                          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                            {t(
                              "app.toolbar.knowledgeConnect",
                              "Connect Knowledge Base",
                            )}
                          </span>
                          <Switch
                            checked={isKnowledgeOn}
                            onCheckedChange={handleKnowledgeToggle}
                          />
                        </div>
                        {isLoadingKnowledge ? (
                          <div className="px-2 py-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                            {t("common.loading", "Loading...")}
                          </div>
                        ) : knowledgeSets.length === 0 ? (
                          <div className="px-2 py-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                            {t(
                              "app.toolbar.noKnowledgeSets",
                              "No knowledge bases available",
                            )}
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            {knowledgeSets.map((ks) => (
                              <button
                                key={ks.id}
                                onClick={() => handleKnowledgeSelect(ks.id)}
                                className={cn(
                                  "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
                                  "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                                  effectiveKnowledgeSetId === ks.id &&
                                    "bg-purple-50 dark:bg-purple-900/20",
                                )}
                              >
                                <div className="min-w-0 text-left">
                                  <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                    {ks.name}
                                  </div>
                                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                                    {ks.file_count} {t("common.files", "files")}
                                  </div>
                                </div>
                                {effectiveKnowledgeSetId === ks.id && (
                                  <CheckIcon className="h-3 w-3 flex-shrink-0 text-purple-500" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Sandbox */}
                  <AccordionItem value="sandbox" className="border-none">
                    <AccordionTrigger className="px-2.5 py-1.5 hover:no-underline hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md [&>svg]:hidden">
                      <div className="flex w-full items-center justify-between text-xs font-medium text-neutral-600 dark:text-neutral-400">
                        <div className="flex items-center gap-1.5">
                          <CommandLineIcon
                            className={cn(
                              "h-3.5 w-3.5",
                              sandboxEnabled && "text-rose-500",
                            )}
                          />
                          <span>{t("app.toolbar.sandbox", "Sandbox")}</span>
                        </div>
                        {sandboxEnabled && (
                          <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-900/50 dark:text-rose-400">
                            {t("common.on", "ON")}
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1">
                      <div className="ml-2 space-y-2 pl-2">
                        <div className="flex items-center justify-between px-2 py-1">
                          <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                            {t(
                              "app.toolbar.sandboxDesc",
                              "Execute code in sandbox",
                            )}
                          </span>
                          <Switch
                            checked={sandboxEnabled}
                            onCheckedChange={handleSandboxToggle}
                          />
                        </div>
                        <div
                          className={cn(
                            "space-y-1 transition-opacity",
                            !sandboxEnabled && "opacity-50 pointer-events-none",
                          )}
                        >
                          <button
                            onClick={() => handleSandboxSelect(null)}
                            className={cn(
                              "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
                              "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                              !effectiveBackend &&
                                "bg-rose-50 dark:bg-rose-900/20",
                            )}
                          >
                            <div className="min-w-0 text-left">
                              <div className="font-medium text-neutral-900 dark:text-neutral-100">
                                Auto
                              </div>
                              <div className="text-[10px] text-neutral-400">
                                {t(
                                  "app.toolbar.sandboxAutoDesc",
                                  "System auto-detect",
                                )}
                              </div>
                            </div>
                            {!effectiveBackend && (
                              <CheckIcon className="h-3 w-3 flex-shrink-0 text-rose-500" />
                            )}
                          </button>
                          {runners.length > 0 && (
                            <div>
                              <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 px-2 py-0.5">
                                {t("app.toolbar.runners", "Runners")}
                              </div>
                              <div className="space-y-0.5">
                                {runners.map((runner: RunnerRead) => {
                                  const value = `runner:${runner.id}`;
                                  const isSelected = effectiveBackend === value;
                                  return (
                                    <button
                                      key={runner.id}
                                      onClick={() => handleSandboxSelect(value)}
                                      disabled={!runner.is_online}
                                      className={cn(
                                        "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
                                        "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                                        isSelected &&
                                          "bg-rose-50 dark:bg-rose-900/20",
                                        !runner.is_online &&
                                          "opacity-50 cursor-not-allowed",
                                      )}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div
                                          className={cn(
                                            "h-1.5 w-1.5 rounded-full flex-shrink-0",
                                            runner.is_online
                                              ? "bg-green-500"
                                              : "bg-neutral-400",
                                          )}
                                        />
                                        <div className="min-w-0 text-left">
                                          <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                            {runner.name}
                                          </div>
                                          {runner.os_info && (
                                            <div className="text-[10px] text-neutral-400 truncate">
                                              {runner.os_info}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      {isSelected && (
                                        <CheckIcon className="h-3 w-3 flex-shrink-0 text-rose-500" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {isLoadingSandbox ? (
                            <div className="px-2 py-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                              {t("common.loading", "Loading...")}
                            </div>
                          ) : (
                            sandboxes.length > 0 && (
                              <div>
                                <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 px-2 py-0.5">
                                  {t(
                                    "app.toolbar.activeSandboxes",
                                    "Active Sandboxes",
                                  )}
                                </div>
                                <div className="space-y-0.5">
                                  {sandboxes.map((sandbox) => {
                                    const value = `sandbox:${sandbox.session_id}`;
                                    const isSelected =
                                      effectiveBackend === value;
                                    return (
                                      <button
                                        key={sandbox.sandbox_id}
                                        onClick={() =>
                                          handleSandboxSelect(value)
                                        }
                                        className={cn(
                                          "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
                                          "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                                          isSelected &&
                                            "bg-rose-50 dark:bg-rose-900/20",
                                        )}
                                      >
                                        <div className="min-w-0 text-left">
                                          <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                            {sandbox.agent_name ||
                                              sandbox.session_name ||
                                              sandbox.sandbox_id}
                                          </div>
                                          <div className="text-[10px] text-neutral-400 truncate">
                                            {sandbox.backend}
                                          </div>
                                        </div>
                                        {isSelected && (
                                          <CheckIcon className="h-3 w-3 flex-shrink-0 text-rose-500" />
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* MCP */}
                  <AccordionItem value="mcp" className="border-none">
                    <AccordionTrigger className="px-2.5 py-1.5 hover:no-underline hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md [&>svg]:hidden">
                      <div className="flex w-full items-center justify-between text-xs font-medium text-neutral-600 dark:text-neutral-400">
                        <div className="flex items-center gap-1.5">
                          <McpIcon className="h-3.5 w-3.5" />
                          <span>{t("app.toolbar.mcpTools")}</span>
                        </div>
                        {totalTools > 0 && (
                          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                            {totalTools}
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1">
                      <div className="ml-2 space-y-2 pl-2">
                        {allMcpServers.length === 0 && (
                          <div className="px-2 py-3 text-center">
                            <div className="text-xs text-neutral-500 dark:text-neutral-400">
                              {t(
                                "app.toolbar.mcpNoServers",
                                "No MCP servers configured",
                              )}
                            </div>
                            <button
                              onClick={() => onOpenSettings?.()}
                              className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                            >
                              <Cog6ToothIcon className="h-3 w-3" />
                              {t(
                                "app.toolbar.mcpOpenSettings",
                                "Open Settings",
                              )}
                            </button>
                          </div>
                        )}
                        {connectedServers.length > 0 && (
                          <div>
                            <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 px-2 py-0.5">
                              {t("app.toolbar.mcpConnected", "Connected")}
                            </div>
                            <div className="space-y-0.5">
                              {connectedServers.map((server) => (
                                <MobileMcpServerItem
                                  key={server.id}
                                  server={server}
                                  isConnected={true}
                                  isUpdating={isUpdating === server.id}
                                  onToggle={() =>
                                    handleMcpServerToggle(server.id, false)
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        {availableServers.length > 0 && (
                          <div>
                            <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 px-2 py-0.5">
                              {t("app.toolbar.mcpAvailable", "Available")}
                            </div>
                            <div className="space-y-0.5">
                              {availableServers.map((server) => (
                                <MobileMcpServerItem
                                  key={server.id}
                                  server={server}
                                  isConnected={false}
                                  isUpdating={isUpdating === server.id}
                                  onToggle={() =>
                                    handleMcpServerToggle(server.id, true)
                                  }
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Skills */}
                  <AccordionItem value="skills" className="border-none">
                    <AccordionTrigger className="px-2.5 py-1.5 hover:no-underline hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md [&>svg]:hidden">
                      <div className="flex w-full items-center justify-between text-xs font-medium text-neutral-600 dark:text-neutral-400">
                        <div className="flex items-center gap-1.5">
                          <SparklesIcon className="h-3.5 w-3.5" />
                          <span>{t("app.toolbar.skills.title", "Skills")}</span>
                        </div>
                        {(skillsAuto
                          ? allSkills.length
                          : connectedSkills.length) > 0 && (
                          <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                            {skillsAuto
                              ? allSkills.length
                              : connectedSkills.length}
                          </span>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-1">
                      <div className="ml-2 space-y-2 pl-2">
                        <div className="flex items-center justify-between px-2 py-0.5">
                          <button
                            type="button"
                            className="text-[10px] text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                            onClick={() => setShowCreateSkillModal(true)}
                          >
                            {t(
                              "app.toolbar.skills.createAction",
                              "Create Skill",
                            )}
                          </button>
                        </div>
                        {/* Auto toggle */}
                        <button
                          type="button"
                          onClick={handleSkillAutoToggle}
                          className={cn(
                            "w-full flex items-center justify-between px-2 py-1.5 rounded-md transition-colors text-[11px]",
                            "hover:bg-neutral-100 dark:hover:bg-neutral-800",
                            skillsAuto && "bg-indigo-50 dark:bg-indigo-900/20",
                          )}
                        >
                          <div className="min-w-0 text-left">
                            <div className="font-medium text-neutral-900 dark:text-neutral-100">
                              {t("app.toolbar.skills.auto", "Auto")}
                            </div>
                            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                              {t(
                                "app.toolbar.skills.autoDescription",
                                "Include all skills automatically",
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0 ml-2">
                            {skillsAuto && (
                              <CheckIcon className="h-3.5 w-3.5 text-indigo-500" />
                            )}
                          </div>
                        </button>
                        {skillsError && (
                          <div className="mx-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[10px] text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
                            {skillsError}
                          </div>
                        )}
                        {isLoadingSkills ? (
                          <div className="px-2 py-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                            {t("common.loading", "Loading...")}
                          </div>
                        ) : skillsAuto ? (
                          /* Auto mode: show all skills as read-only */
                          allSkills.length > 0 ? (
                            <div className="space-y-0.5">
                              {allSkills.map((skill) => (
                                <div
                                  key={skill.id}
                                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-md bg-indigo-50 dark:bg-indigo-900/20 text-[11px]"
                                >
                                  <div className="min-w-0 text-left">
                                    <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                                      {skill.name}
                                    </div>
                                    <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
                                      {skill.description}
                                    </div>
                                  </div>
                                  <div className="flex-shrink-0 ml-2">
                                    <CheckIcon className="h-3.5 w-3.5 text-indigo-500" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="px-2 py-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                              {t(
                                "app.toolbar.skills.empty",
                                "No skills available. Create one to get started.",
                              )}
                            </div>
                          )
                        ) : (
                          /* Manual mode */
                          <>
                            {connectedSkills.length > 0 && (
                              <div>
                                <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 px-2 py-0.5">
                                  {t(
                                    "app.toolbar.skills.connected",
                                    "Connected",
                                  )}
                                </div>
                                <div className="space-y-0.5">
                                  {connectedSkills.map((skill) => (
                                    <MobileSkillItem
                                      key={skill.id}
                                      skill={skill}
                                      isConnected={true}
                                      isUpdating={
                                        isUpdatingSkillId === skill.id
                                      }
                                      onToggle={() =>
                                        handleSkillToggle(skill, true)
                                      }
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                            {availableSkills.length > 0 && (
                              <div>
                                <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 px-2 py-0.5">
                                  {t(
                                    "app.toolbar.skills.available",
                                    "Available",
                                  )}
                                </div>
                                <div className="space-y-0.5">
                                  {availableSkills.map((skill) => (
                                    <MobileSkillItem
                                      key={skill.id}
                                      skill={skill}
                                      isConnected={false}
                                      isUpdating={
                                        isUpdatingSkillId === skill.id
                                      }
                                      onToggle={() =>
                                        handleSkillToggle(skill, false)
                                      }
                                    />
                                  ))}
                                </div>
                              </div>
                            )}
                            {connectedSkills.length === 0 &&
                              availableSkills.length === 0 && (
                                <div className="px-2 py-2 text-[10px] text-neutral-500 dark:text-neutral-400">
                                  {t(
                                    "app.toolbar.skills.empty",
                                    "No skills available. Create one to get started.",
                                  )}
                                </div>
                              )}
                          </>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {agent && (
        <CreateSkillModal
          isOpen={showCreateSkillModal}
          onClose={() => setShowCreateSkillModal(false)}
          agentId={agent.id}
          onCreated={async () => {
            await Promise.all([loadSkills(), onAgentRefresh()]);
          }}
        />
      )}
    </>
  );
}

/**
 * Mobile MCP Server toggle item
 */
interface MobileMcpServerItemProps {
  server: McpServer;
  isConnected: boolean;
  isUpdating: boolean;
  onToggle: () => void;
}

function MobileMcpServerItem({
  server,
  isConnected,
  isUpdating,
  onToggle,
}: MobileMcpServerItemProps) {
  const { t } = useTranslation();
  const isOnline = server.status === "online";
  const isDisabled = !isOnline || isUpdating;

  return (
    <button
      onClick={onToggle}
      disabled={isDisabled}
      className={cn(
        "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
        "hover:bg-neutral-100 dark:hover:bg-neutral-800",
        isConnected && "bg-indigo-50 dark:bg-indigo-900/20",
        isDisabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div
          className={cn(
            "h-1.5 w-1.5 rounded-full flex-shrink-0",
            isOnline ? "bg-green-500" : "bg-neutral-400",
          )}
        />
        <div className="min-w-0 text-left">
          <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
            {server.name}
          </div>
          <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
            {isOnline
              ? `${server.tools?.length || 0} ${t("app.toolbar.mcpToolsCount", "tools")}`
              : t("app.toolbar.mcpOffline", "offline")}
          </div>
        </div>
      </div>
      <div className="flex-shrink-0 ml-2">
        {isUpdating ? (
          <div className="h-3 w-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        ) : isConnected ? (
          <CheckIcon className="h-3 w-3 text-indigo-500" />
        ) : null}
      </div>
    </button>
  );
}

export default MobileMoreMenu;

interface MobileSkillItemProps {
  skill: SkillRead;
  isConnected: boolean;
  isUpdating: boolean;
  onToggle: () => void;
}

function MobileSkillItem({
  skill,
  isConnected,
  isUpdating,
  onToggle,
}: MobileSkillItemProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={isUpdating}
      className={cn(
        "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
        "hover:bg-neutral-100 dark:hover:bg-neutral-800",
        isConnected && "bg-indigo-50 dark:bg-indigo-900/20",
        isUpdating && "opacity-50 cursor-not-allowed",
      )}
    >
      <div className="min-w-0 text-left">
        <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
          {skill.name}
        </div>
        <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">
          {skill.description}
        </div>
      </div>
      <div className="flex-shrink-0 ml-2">
        {isUpdating ? (
          <div className="h-3 w-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        ) : isConnected ? (
          <CheckIcon className="h-3 w-3 text-indigo-500" />
        ) : null}
      </div>
    </button>
  );
}
