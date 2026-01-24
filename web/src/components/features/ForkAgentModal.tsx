"use client";

import { Modal } from "@/components/animate-ui/components/animate/modal";
import { Input } from "@/components/base/Input";
import { useForkAgent } from "@/hooks/useMarketplace";
import { Button, Field, Label } from "@headlessui/react";
import {
  ArrowRightIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { ForkMode } from "@/service/marketplaceService";

interface ForkAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketplaceId: string;
  agentName: string;
  agentDescription?: string;
  requirements?: {
    mcp_servers: Array<{ name: string; description?: string }>;
    knowledge_base: { name: string; file_count: number } | null;
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
    <Modal isOpen={open} onClose={() => onOpenChange(false)}>
      <div className="max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg bg-white p-6 dark:bg-neutral-900">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Fork Agent: {agentName}
          </h2>
          <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Create your own copy of this agent to customize and use.
          </p>
        </div>

        <div className="space-y-6 py-4">
          {/* Progress Indicator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  currentStep === "name"
                    ? "bg-blue-600 text-white"
                    : "bg-green-600 text-white"
                }`}
              >
                {currentStep === "name" ? (
                  "1"
                ) : (
                  <CheckCircleIcon className="h-5 w-5" />
                )}
              </div>
              <span className="text-sm font-medium">Name</span>
            </div>
            <ArrowRightIcon className="h-4 w-4 text-neutral-400" />
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  currentStep === "requirements"
                    ? "bg-blue-600 text-white"
                    : currentStep === "confirm"
                      ? "bg-green-600 text-white"
                      : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                }`}
              >
                {currentStep === "confirm" ? (
                  <CheckCircleIcon className="h-5 w-5" />
                ) : (
                  "2"
                )}
              </div>
              <span className="text-sm font-medium">Requirements</span>
            </div>
            <ArrowRightIcon className="h-4 w-4 text-neutral-400" />
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  currentStep === "confirm"
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                }`}
              >
                3
              </div>
              <span className="text-sm font-medium">Confirm</span>
            </div>
          </div>

          {/* Step 1: Name */}
          {currentStep === "name" && (
            <div className="space-y-4">
              {forkMode === "locked" ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <div className="flex gap-3">
                    <LockClosedIcon className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div>
                      <h4 className="font-medium text-amber-800 dark:text-amber-300">
                        {t("marketplace.fork.lockedAgent")}
                      </h4>
                      <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
                        {t("marketplace.fork.lockedAgentDescription")}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative w-full rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                  <div className="flex gap-2">
                    <InformationCircleIcon className="h-4 w-4 shrink-0" />
                    <div className="text-sm">
                      {t("marketplace.fork.editableDescription")}
                    </div>
                  </div>
                </div>
              )}

              <Field className="space-y-2">
                <Label className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Agent Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="agent-name"
                  type="text"
                  placeholder="My Custom Agent"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  maxLength={100}
                />
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Give your fork a unique name to identify it
                </p>
              </Field>

              {agentDescription && (
                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Original Description
                  </p>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {agentDescription}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Requirements */}
          {currentStep === "requirements" && (
            <div className="space-y-4">
              <div className="relative w-full rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="flex gap-2">
                  <InformationCircleIcon className="h-4 w-4 shrink-0" />
                  <div className="text-sm">
                    This agent requires some setup before you can use it
                    effectively.
                  </div>
                </div>
              </div>

              {/* Provider */}
              {requirements?.provider_needed && (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
                      <svg
                        className="h-5 w-5 text-blue-600 dark:text-blue-400"
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
                      <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                        Provider Configuration Required
                      </h4>
                      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                        You'll need to configure an LLM provider (e.g., OpenAI,
                        Anthropic) in your agent settings after forking.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* MCP Servers */}
              {requirements?.mcp_servers &&
                requirements.mcp_servers.length > 0 && (
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900">
                        <svg
                          className="h-5 w-5 text-purple-600 dark:text-purple-400"
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
                        <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                          MCP Servers ({requirements.mcp_servers.length})
                        </h4>
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                          This agent uses the following MCP servers:
                        </p>
                        <ul className="mt-3 space-y-2">
                          {requirements.mcp_servers.map((mcp, index) => (
                            <li
                              key={index}
                              className="flex items-start gap-2 text-sm text-neutral-700 dark:text-neutral-300"
                            >
                              <div className="mt-0.5 flex flex-wrap gap-2">
                                <span className="inline-flex items-center rounded-full border border-transparent bg-neutral-100 px-2.5 py-0.5 text-xs font-semibold text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100">
                                  {mcp.name}
                                </span>
                                <span className="inline-flex items-center rounded-full border border-transparent bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  ✅ Auto-configured
                                </span>
                              </div>
                              {mcp.description && (
                                <span className="text-neutral-600 dark:text-neutral-400">
                                  {mcp.description}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

              {/* Knowledge Base */}
              {requirements?.knowledge_base &&
                requirements.knowledge_base.file_count > 0 && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
                        <InformationCircleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
                          Knowledge Base Included
                        </h4>
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                          The original agent uses a knowledge base with{" "}
                          <strong>
                            {requirements.knowledge_base.file_count} files
                          </strong>
                          . These files will be copied to your personal
                          workspace automatically.
                        </p>
                        <p className="mt-2 text-xs text-blue-700 dark:text-blue-400">
                          ℹ️ You will have full access to these files
                        </p>
                      </div>
                    </div>
                  </div>
                )}

              {/* No Requirements */}
              {!requirements?.provider_needed &&
                (!requirements?.mcp_servers ||
                  requirements.mcp_servers.length === 0) &&
                (!requirements?.knowledge_base ||
                  requirements.knowledge_base.file_count === 0) && (
                  <div className="relative w-full rounded-lg border border-green-500/50 bg-green-50 p-4 text-green-900 dark:bg-green-950/50 dark:text-green-400">
                    <div className="flex gap-2">
                      <CheckCircleIcon className="h-4 w-4 shrink-0 text-green-600" />
                      <div className="text-sm">
                        This agent has no special requirements. You can use it
                        right away after forking!
                      </div>
                    </div>
                  </div>
                )}
            </div>
          )}

          {/* Step 3: Confirm */}
          {currentStep === "confirm" && (
            <div className="space-y-4">
              <div className="relative w-full rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="flex gap-2">
                  <InformationCircleIcon className="h-4 w-4 shrink-0" />
                  <div className="text-sm">
                    Ready to fork? Your new agent will be created with the
                    following configuration:
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Name
                  </p>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {customName}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Based on
                  </p>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {agentName}
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Next Steps After Forking
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
                    {requirements?.provider_needed && (
                      <li>• Configure LLM provider</li>
                    )}
                    {requirements?.mcp_servers &&
                      requirements.mcp_servers.length > 0 && (
                        <li>
                          • Set up {requirements.mcp_servers.length} MCP
                          server(s)
                        </li>
                      )}
                    {requirements?.knowledge_base &&
                      requirements.knowledge_base.file_count > 0 && (
                        <li>• Add documents to knowledge base</li>
                      )}
                    <li>• Customize prompts and settings as needed</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {forkMutation.isError && (
            <div className="relative w-full rounded-lg border border-red-500/50 bg-red-50 p-4 text-red-900 dark:bg-red-950/50 dark:text-red-400">
              <div className="flex gap-2">
                <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
                <div className="text-sm">
                  {forkMutation.error instanceof Error
                    ? forkMutation.error.message
                    : "Failed to fork agent. Please try again."}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex w-full justify-between">
          <Button
            onClick={
              currentStep === "name" ? () => onOpenChange(false) : handleBack
            }
            disabled={forkMutation.isPending}
            className="rounded-md border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {currentStep === "name" ? "Cancel" : "Back"}
          </Button>
          <Button
            onClick={currentStep === "confirm" ? handleFork : handleNext}
            disabled={
              (currentStep === "name" && !canProceed) || forkMutation.isPending
            }
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            {forkMutation.isPending
              ? "Forking..."
              : currentStep === "confirm"
                ? "Fork Agent"
                : "Next"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
