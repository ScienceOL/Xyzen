import { useXyzen } from "@/store";
import { LoadingKeys } from "@/store/slices/loadingSlice";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSmitheryServerDetail } from "../hooks/useSmitheryMcp";
import {
  McpActivationStatus,
  type McpActivationProgress as McpActivationProgressState,
} from "../types/bohrium";
import McpActivationProgress from "./McpActivationProgress";

interface Props {
  id: string; // qualifiedName or ID
  onBack?: () => void;
}

const CodeBlock = ({ children }: { children: React.ReactNode }) => (
  <pre className="rounded-lg bg-neutral-900 text-neutral-100 text-xs p-4 overflow-auto">
    <code>{children}</code>
  </pre>
);

const CollapsibleJson: React.FC<{ title: string; data: unknown }> = ({
  title,
  data,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left text-sm"
      >
        <span>{title}</span>
        <span className="text-neutral-500">
          {open ? t("mcp.detail.collapse") : t("mcp.detail.expand")}
        </span>
      </button>
      {open && (
        <div className="border-t border-neutral-200 dark:border-neutral-800 p-3 overflow-auto">
          <CodeBlock>{JSON.stringify(data, null, 2)}</CodeBlock>
        </div>
      )}
    </div>
  );
};

const SmitheryServerDetail: React.FC<Props> = ({ id, onBack }) => {
  const { t } = useTranslation();
  const { detail, loading, error } = useSmitheryServerDetail(id);

  // Primary connection URL not needed on UI since activation is server-side

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent" />
          <p className="mt-4 text-sm text-neutral-500 dark:text-neutral-400">
            {t("mcp.detail.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="py-8 text-center text-neutral-500 dark:text-neutral-400">
        {t("mcp.detail.notFound")}
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            {t("mcp.detail.back")}
          </button>
        )}
      </div>

      {/* Top section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Icon / Title */}
          <div className="flex items-start gap-4">
            <img
              src={
                detail.iconUrl ??
                "https://storage.sciol.ac.cn/library/smithery.png"
              }
              alt={detail.displayName}
              className="h-14 w-14 rounded-lg border border-neutral-200 dark:border-neutral-800 object-contain"
            />
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-neutral-900 dark:text-white">
                {detail.displayName}
              </h1>
              <div className="mt-1 flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
                <span className="inline-flex items-center gap-1">
                  <GlobeAltIcon className="h-4 w-4" />{" "}
                  {detail.remote
                    ? t("mcp.detail.remote")
                    : t("mcp.detail.local")}
                </span>
                {detail.security && (
                  <span className="inline-flex items-center gap-1">
                    <CheckCircleIcon
                      className={`h-4 w-4 ${detail.security.scanPassed ? "text-green-500" : "text-yellow-500"}`}
                    />
                    {t("mcp.detail.security.scan")}{" "}
                    {detail.security.scanPassed
                      ? t("mcp.detail.security.passed")
                      : t("mcp.detail.security.failed")}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {detail.description && (
            <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
              {detail.description}
            </p>
          )}

          {/* Connections */}
          {detail.connections && detail.connections.length > 0 && (
            <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-white">
                {t("mcp.detail.connections")}
              </h2>
              <div className="space-y-3">
                {detail.connections.map((c, idx) => (
                  <div key={idx} className="text-sm">
                    <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                      <span className="rounded bg-neutral-100 dark:bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase">
                        {c.type}
                      </span>
                      <a
                        href={(c.deploymentUrl || c.url) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline dark:text-blue-400 break-all"
                      >
                        {(c.deploymentUrl || c.url) ?? ""}
                      </a>
                    </div>
                    {c.configSchema && (
                      <div className="mt-2">
                        <CollapsibleJson
                          title={t("mcp.detail.configSchema")}
                          data={c.configSchema}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tools */}
          {detail.tools && detail.tools.length > 0 && (
            <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900">
              <h2 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-white">
                {t("mcp.detail.tools")}
              </h2>
              <div className="space-y-4">
                {detail.tools.map((tool) => (
                  <div
                    key={tool.name}
                    className="border-b border-neutral-100 pb-4 last:border-0 dark:border-neutral-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-white">
                          {tool.name}
                        </p>
                        {tool.description && (
                          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                            {tool.description}
                          </p>
                        )}
                      </div>
                    </div>
                    {tool.inputSchema && (
                      <div className="mt-3">
                        <CollapsibleJson
                          title={t("mcp.detail.inputSchema")}
                          data={tool.inputSchema}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Activation */}
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-lg border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sticky top-4">
            <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
              {t("mcp.detail.activateSmithery")}
            </h2>
            <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
              {t("mcp.detail.activateSmitheryDesc")}
            </p>
            <ActivateSmitherySection detail={detail} />
          </div>

          {/* Meta */}
          <div className="rounded-lg border border-neutral-200 bg-white p-6 text-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="space-y-2">
              <div>
                <span className="text-neutral-500 dark:text-neutral-400">
                  {t("mcp.detail.qualifiedName")}:{" "}
                </span>
                <span className="text-neutral-900 dark:text-white break-all">
                  {detail.qualifiedName}
                </span>
              </div>
              {detail.deploymentUrl && (
                <div>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {t("mcp.detail.deploymentUrl")}:{" "}
                  </span>
                  <a
                    href={detail.deploymentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline dark:text-blue-400 break-all"
                  >
                    {detail.deploymentUrl}
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SmitheryServerDetail;

const ActivateSmitherySection: React.FC<{
  detail: import("../types/smithery").SmitheryServerDetail;
}> = ({ detail }) => {
  const { t } = useTranslation();
  const { activateSmitheryServer, getLoading, mcpServers } = useXyzen();
  const isLoading = getLoading(LoadingKeys.MCP_SERVER_CREATE);
  const [progress, setProgress] = useState<McpActivationProgressState>({
    status: McpActivationStatus.IDLE,
    message: "",
    progress: 0,
  });

  const connectionRequirements = useMemo(() => {
    if (!detail.connections)
      return [] as Array<{ label: string; fields: string[] }>;

    return detail.connections
      .map((connection, index) => {
        const req = connection.configSchema?.required;
        const fields = Array.isArray(req)
          ? req.filter((field): field is string => typeof field === "string")
          : [];
        const label =
          connection.type || `${t("mcp.detail.connections")} ${index + 1}`;
        return { label, fields };
      })
      .filter((item) => item.fields.length > 0);
  }, [detail.connections, t]);

  const qualifiedDisplayName = detail.displayName || detail.qualifiedName;
  const isAlreadyAdded = useMemo(
    () => mcpServers.some((server) => server.name === qualifiedDisplayName),
    [mcpServers, qualifiedDisplayName],
  );

  useEffect(() => {
    if (isAlreadyAdded) {
      setProgress({
        status: McpActivationStatus.SUCCESS,
        message: t("mcp.detail.smithery.alreadyAdded"),
        progress: 100,
      });
    }
  }, [isAlreadyAdded, t]);

  const handleActivate = async () => {
    setProgress({
      status: McpActivationStatus.ACTIVATING,
      message: t("mcp.detail.smithery.registering"),
      progress: 60,
    });
    try {
      await activateSmitheryServer(detail.qualifiedName, "mental-worm-gq5uk2");
      setProgress({
        status: McpActivationStatus.SUCCESS,
        message: t("mcp.detail.smithery.successMessage"),
        progress: 100,
      });
    } catch (e: unknown) {
      const message =
        typeof e === "object" && e && "message" in e
          ? String((e as { message?: unknown }).message)
          : t("mcp.detail.activationFailed");
      setProgress({
        status: McpActivationStatus.ERROR,
        message,
        progress: 0,
        error: message,
      });
    }
  };

  return (
    <div className="space-y-3">
      {connectionRequirements.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-300">
          <p className="font-medium">
            {t("mcp.detail.smithery.configRequired")}
          </p>
          <div className="mt-2 space-y-2">
            {connectionRequirements.map(({ label, fields }) => (
              <div key={label}>
                <p className="font-semibold text-amber-600 dark:text-amber-200">
                  {label}
                </p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {fields.map((field) => (
                    <li key={field}>{field}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        disabled={isLoading || isAlreadyAdded}
        onClick={handleActivate}
        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {isAlreadyAdded
          ? t("mcp.detail.added")
          : isLoading
            ? t("mcp.detail.activating")
            : t("mcp.detail.oneClickActivate")}
      </button>
      <McpActivationProgress
        progress={progress}
        onClose={() =>
          setProgress({
            status: McpActivationStatus.IDLE,
            message: "",
            progress: 0,
          })
        }
      />
    </div>
  );
};
