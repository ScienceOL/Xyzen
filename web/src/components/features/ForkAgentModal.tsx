"use client";

import { SheetModal } from "@/components/animate-ui/components/animate/sheet-modal";
import { FieldGroup } from "@/components/base/FieldGroup";
import { Input } from "@/components/base/Input";
import { formatFileSize } from "@/components/knowledge/SortableTree/utilities";
import { useForkAgent } from "@/hooks/useMarketplace";
import { Button } from "@headlessui/react";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { ForkMode } from "@/service/marketplaceService";

interface ForkAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketplaceId: string;
  agentName: string;
  agentDescription?: string;
  requirements?: {
    mcp_servers: Array<{ name: string; description?: string }>;
    knowledge_base: {
      name: string;
      file_count: number;
      total_size_bytes?: number;
    } | null;
    provider_needed: boolean;
  };
  forkMode: ForkMode;
  onForkSuccess?: (agentId: string) => void;
}

/**
 * ForkAgentModal Component
 *
 * Modal with wizard for forking an agent from the marketplace.
 * Guides users through naming and understanding requirements.
 */
export default function ForkAgentModal({
  open,
  onOpenChange,
  marketplaceId,
  agentName,
  agentDescription,
  requirements,
  forkMode,
  onForkSuccess,
}: ForkAgentModalProps) {
  const { t } = useTranslation();
  const [customName, setCustomName] = useState(`${agentName} (Fork)`);
  const [currentStep, setCurrentStep] = useState<
    "name" | "requirements" | "confirm"
  >("name");

  const forkMutation = useForkAgent();

  const handleFork = async () => {
    try {
      const response = await forkMutation.mutateAsync({
        marketplaceId,
        request: {
          custom_name:
            customName.trim() !== `${agentName} (Fork)`
              ? customName.trim()
              : undefined,
        },
      });

      // Success callback
      if (onForkSuccess) {
        onForkSuccess(response.agent_id);
      }

      // Reset and close
      setCustomName(`${agentName} (Fork)`);
      setCurrentStep("name");
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to fork agent:", error);
    }
  };

  const handleNext = () => {
    if (currentStep === "name") {
      setCurrentStep("requirements");
    } else if (currentStep === "requirements") {
      setCurrentStep("confirm");
    }
  };

  const handleBack = () => {
    if (currentStep === "confirm") {
      setCurrentStep("requirements");
    } else if (currentStep === "requirements") {
      setCurrentStep("name");
    }
  };

  const canProceed = customName.trim().length > 0;

  return (
    <SheetModal isOpen={open} onClose={() => onOpenChange(false)} size="md">
      {/* Header */}
      <div className="shrink-0 border-b border-neutral-200/60 px-5 pb-3 pt-5 dark:border-neutral-800/60">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
          {t("marketplace.fork.title", { name: agentName })}
        </h2>
        <p className="mt-1 text-[13px] text-neutral-500 dark:text-neutral-400">
          {t("marketplace.fork.description")}
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        <div className="space-y-6 px-5 py-5">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-medium ${
                  currentStep === "name"
                    ? "bg-indigo-500 text-white"
                    : "bg-green-500 text-white"
                }`}
              >
                {currentStep === "name" ? (
                  "1"
                ) : (
                  <CheckCircleIcon className="h-4 w-4" />
                )}
              </div>
              <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                {t("common.name")}
              </span>
            </div>
            <ArrowRightIcon className="h-3.5 w-3.5 text-neutral-300 dark:text-neutral-600" />
            <div className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-medium ${
                  currentStep === "requirements"
                    ? "bg-indigo-500 text-white"
                    : currentStep === "confirm"
                      ? "bg-green-500 text-white"
                      : "bg-neutral-200/70 text-neutral-500 dark:bg-neutral-700/70 dark:text-neutral-400"
                }`}
              >
                {currentStep === "confirm" ? (
                  <CheckCircleIcon className="h-4 w-4" />
                ) : (
                  "2"
                )}
              </div>
              <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                {t("common.requirements")}
              </span>
            </div>
            <ArrowRightIcon className="h-3.5 w-3.5 text-neutral-300 dark:text-neutral-600" />
            <div className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-medium ${
                  currentStep === "confirm"
                    ? "bg-indigo-500 text-white"
                    : "bg-neutral-200/70 text-neutral-500 dark:bg-neutral-700/70 dark:text-neutral-400"
                }`}
              >
                3
              </div>
              <span className="text-[13px] font-medium text-neutral-700 dark:text-neutral-300">
                {t("common.confirm")}
              </span>
            </div>
          </div>

          {/* Step 1: Name */}
          {currentStep === "name" && (
            <div className="space-y-4">
              {forkMode === "locked" ? (
                <div className="flex gap-2.5 rounded-lg bg-amber-50/80 px-4 py-3 dark:bg-amber-950/20">
                  <LockClosedIcon className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                  <div>
                    <p className="text-[13px] font-medium text-amber-800 dark:text-amber-300">
                      {t("marketplace.fork.lockedAgent")}
                    </p>
                    <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                      {t("marketplace.fork.lockedAgentDescription")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2.5 rounded-lg bg-neutral-100/60 px-4 py-3 dark:bg-white/[0.04]">
                  <InformationCircleIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                  <p className="text-[13px] text-neutral-600 dark:text-neutral-400">
                    {t("marketplace.fork.editableDescription")}
                  </p>
                </div>
              )}

              <FieldGroup
                label={
                  <Trans i18nKey="marketplace.fork.agentNameRequired">
                    Agent Name
                  </Trans>
                }
                required
                hint={t("marketplace.fork.agentNameHint")}
              >
                <Input
                  id="agent-name"
                  type="text"
                  placeholder={t("marketplace.fork.agentNamePlaceholder")}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  maxLength={100}
                />
              </FieldGroup>

              {agentDescription && (
                <div>
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {t("marketplace.fork.originalDescription")}
                  </p>
                  <p className="mt-1 text-[13px] text-neutral-700 dark:text-neutral-300">
                    {agentDescription}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Requirements */}
          {currentStep === "requirements" && (
            <div className="space-y-4">
              <div className="flex gap-2.5 rounded-lg bg-neutral-100/60 px-4 py-3 dark:bg-white/[0.04]">
                <InformationCircleIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                <p className="text-[13px] text-neutral-600 dark:text-neutral-400">
                  {t("marketplace.fork.requirementsInfo")}
                </p>
              </div>

              {/* Provider */}
              {requirements?.provider_needed && (
                <div className="flex items-start gap-3 rounded-lg bg-neutral-100/60 p-4 dark:bg-white/[0.04]">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
                    <svg
                      className="h-4 w-4 text-blue-500 dark:text-blue-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                      {t("marketplace.fork.providerRequired")}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {t("marketplace.fork.providerRequiredDescription")}
                    </p>
                  </div>
                </div>
              )}

              {/* MCP Servers */}
              {requirements?.mcp_servers &&
                requirements.mcp_servers.length > 0 && (
                  <div className="flex items-start gap-3 rounded-lg bg-neutral-100/60 p-4 dark:bg-white/[0.04]">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/40">
                      <svg
                        className="h-4 w-4 text-purple-500 dark:text-purple-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                        />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                        {t("marketplace.fork.mcpServers", {
                          count: requirements.mcp_servers.length,
                        })}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                        {t("marketplace.fork.mcpServersDescription")}
                      </p>
                      <ul className="mt-2.5 space-y-1.5">
                        {requirements.mcp_servers.map((mcp, index) => (
                          <li
                            key={index}
                            className="flex items-start gap-2 text-[13px] text-neutral-700 dark:text-neutral-300"
                          >
                            <div className="mt-0.5 flex flex-wrap gap-1.5">
                              <span className="inline-flex items-center rounded-full bg-neutral-200/60 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-700/60 dark:text-neutral-300">
                                {mcp.name}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-green-100/60 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400">
                                {t("marketplace.fork.autoConfigured")}
                              </span>
                            </div>
                            {mcp.description && (
                              <span className="text-neutral-500 dark:text-neutral-400">
                                {mcp.description}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

              {/* Knowledge Base */}
              {requirements?.knowledge_base &&
                requirements.knowledge_base.file_count > 0 && (
                  <div className="flex items-start gap-3 rounded-lg bg-blue-50/60 p-4 dark:bg-blue-950/15">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
                      <InformationCircleIcon className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-[13px] font-medium text-neutral-900 dark:text-neutral-100">
                        {t("marketplace.fork.knowledgeBaseIncluded")}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
                        <Trans
                          i18nKey="marketplace.fork.knowledgeBaseDescription"
                          values={{
                            count: requirements.knowledge_base.file_count,
                          }}
                        >
                          The original agent uses a knowledge base with
                          <strong>{"{{count}}"} files</strong>. These files will
                          be copied to your personal workspace automatically.
                        </Trans>
                      </p>
                      {(requirements.knowledge_base.total_size_bytes ?? 0) >
                        0 && (
                        <p className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                          {t(
                            "marketplace.detail.requirements.knowledgeBase.sizeRequired",
                            {
                              size: formatFileSize(
                                requirements.knowledge_base.total_size_bytes!,
                              ),
                            },
                          )}
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-400">
                        {t("marketplace.fork.knowledgeBaseAccess")}
                      </p>
                    </div>
                  </div>
                )}

              {/* No Requirements */}
              {!requirements?.provider_needed &&
                (!requirements?.mcp_servers ||
                  requirements.mcp_servers.length === 0) &&
                (!requirements?.knowledge_base ||
                  requirements.knowledge_base.file_count === 0) && (
                  <div className="flex gap-2.5 rounded-lg bg-green-50/80 px-4 py-3 dark:bg-green-950/30">
                    <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-500" />
                    <p className="text-[13px] text-green-700 dark:text-green-400">
                      {t("marketplace.fork.noRequirements")}
                    </p>
                  </div>
                )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {currentStep === "confirm" && (
            <div className="space-y-4">
              <div className="flex gap-2.5 rounded-lg bg-neutral-100/60 px-4 py-3 dark:bg-white/[0.04]">
                <InformationCircleIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                <p className="text-[13px] text-neutral-600 dark:text-neutral-400">
                  {t("marketplace.fork.confirmInfo")}
                </p>
              </div>

              <div className="space-y-3 rounded-lg bg-neutral-100/60 p-4 dark:bg-white/[0.04]">
                <div>
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {t("common.name")}
                  </p>
                  <p className="text-[13px] text-neutral-900 dark:text-neutral-100">
                    {customName}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {t("marketplace.fork.basedOn")}
                  </p>
                  <p className="text-[13px] text-neutral-900 dark:text-neutral-100">
                    {agentName}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                    {t("marketplace.fork.nextSteps")}
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[13px] text-neutral-600 dark:text-neutral-400">
                    {requirements?.provider_needed && (
                      <li>• {t("marketplace.fork.nextStepProvider")}</li>
                    )}
                    {requirements?.mcp_servers &&
                      requirements.mcp_servers.length > 0 && (
                        <li>
                          •{" "}
                          {t("marketplace.fork.nextStepMcp", {
                            count: requirements.mcp_servers.length,
                          })}
                        </li>
                      )}
                    {requirements?.knowledge_base &&
                      requirements.knowledge_base.file_count > 0 && (
                        <li>• {t("marketplace.fork.nextStepKnowledge")}</li>
                      )}
                    <li>• {t("marketplace.fork.nextStepCustomize")}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {forkMutation.isError && (
            <div className="flex gap-2.5 rounded-lg bg-red-50/80 px-4 py-3 dark:bg-red-950/30">
              <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-red-500 dark:text-red-400" />
              <p className="text-[13px] text-red-700 dark:text-red-400">
                {forkMutation.error instanceof Error
                  ? forkMutation.error.message
                  : t("marketplace.fork.error")}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-neutral-200/60 px-5 py-4 dark:border-neutral-800/60">
        <div className="flex w-full justify-between">
          <Button
            onClick={
              currentStep === "name" ? () => onOpenChange(false) : handleBack
            }
            disabled={forkMutation.isPending}
            className="rounded-lg bg-neutral-100/80 px-4 py-2 text-[13px] font-medium text-neutral-700 transition-colors hover:bg-neutral-200/80 disabled:opacity-50 dark:bg-white/[0.06] dark:text-neutral-300 dark:hover:bg-white/[0.1]"
          >
            {currentStep === "name" ? t("common.cancel") : t("common.back")}
          </Button>
          <Button
            onClick={currentStep === "confirm" ? handleFork : handleNext}
            disabled={
              (currentStep === "name" && !canProceed) || forkMutation.isPending
            }
            className="rounded-lg bg-indigo-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-600 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            {forkMutation.isPending
              ? t("marketplace.fork.forking")
              : currentStep === "confirm"
                ? t("marketplace.fork.forkButton")
                : t("common.next")}
          </Button>
        </div>
      </div>
    </SheetModal>
  );
}
