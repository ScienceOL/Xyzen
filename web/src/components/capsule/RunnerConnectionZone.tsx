import { Input } from "@/components/base/Input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useXyzen } from "@/store";
import type { RunnerRead } from "@/service/runnerService";
import {
  CheckIcon,
  ClipboardDocumentIcon,
  CommandLineIcon,
  EllipsisHorizontalIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

/* ═══════════════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════════════ */

const GITHUB_REPO = "https://github.com/ScienceOL/Xyzen";
const RELEASE_BASE = `${GITHUB_REPO}/releases/latest/download`;

interface PlatformInfo {
  key: string;
  label: string;
  binary: string;
  curlCmd: string;
}

const PLATFORMS: PlatformInfo[] = [
  {
    key: "darwin-arm64",
    label: "macOS Apple Silicon",
    binary: "xyzen-darwin-arm64",
    curlCmd: `sudo curl -fsSL ${RELEASE_BASE}/xyzen-darwin-arm64 -o /usr/local/bin/xyzen && sudo chmod +x /usr/local/bin/xyzen`,
  },
  {
    key: "darwin-amd64",
    label: "macOS Intel",
    binary: "xyzen-darwin-amd64",
    curlCmd: `sudo curl -fsSL ${RELEASE_BASE}/xyzen-darwin-amd64 -o /usr/local/bin/xyzen && sudo chmod +x /usr/local/bin/xyzen`,
  },
  {
    key: "linux-amd64",
    label: "Linux x86_64",
    binary: "xyzen-linux-amd64",
    curlCmd: `sudo curl -fsSL ${RELEASE_BASE}/xyzen-linux-amd64 -o /usr/local/bin/xyzen && sudo chmod +x /usr/local/bin/xyzen`,
  },
  {
    key: "linux-arm64",
    label: "Linux ARM64",
    binary: "xyzen-linux-arm64",
    curlCmd: `sudo curl -fsSL ${RELEASE_BASE}/xyzen-linux-arm64 -o /usr/local/bin/xyzen && sudo chmod +x /usr/local/bin/xyzen`,
  },
  {
    key: "windows-amd64",
    label: "Windows x86_64",
    binary: "xyzen-windows-amd64.exe",
    curlCmd: `curl -fSL ${RELEASE_BASE}/xyzen-windows-amd64.exe -o xyzen.exe`,
  },
];

function detectPlatform(): PlatformInfo {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() ?? "";

  if (ua.includes("mac") || platform.includes("mac")) {
    return PLATFORMS[0]; // darwin-arm64
  }
  if (ua.includes("win") || platform.includes("win")) {
    return PLATFORMS[4]; // windows-amd64
  }
  if (ua.includes("linux")) {
    return PLATFORMS[2]; // linux-amd64
  }
  return PLATFORMS[2]; // fallback to linux-amd64
}

/* ═══════════════════════════════════════════════════════════════════════════
   Terminal Chrome — shared wrapper with traffic-light dots
   ═══════════════════════════════════════════════════════════════════════════ */

function TerminalWindow({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-[#30363d] bg-[#0d1117] ${className}`}>
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-[#30363d] px-3 py-2">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 bg-[#ff5f57]" />
          <div className="h-2.5 w-2.5 bg-[#febc2e]" />
          <div className="h-2.5 w-2.5 bg-[#28c840]" />
        </div>
        <span className="ml-1 font-mono text-[11px] text-[#8b949e]">
          {title}
        </span>
      </div>
      {/* Body */}
      <div className="p-3 font-mono text-[12px] leading-relaxed">
        {children}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Code block with line numbers
   ═══════════════════════════════════════════════════════════════════════════ */

function CodeBlock({
  lines,
  onCopy,
}: {
  lines: { text: string; color?: string }[];
  onCopy?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!onCopy) return;
    await navigator.clipboard.writeText(onCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [onCopy]);

  return (
    <div className="group relative border border-[#30363d] bg-[#010409]">
      <div className="custom-scrollbar overflow-x-auto p-3">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="w-8 select-none pr-3 text-right align-top font-mono text-[11px] text-[#484f58]">
                  {i + 1}
                </td>
                <td
                  className="whitespace-pre font-mono text-[12px]"
                  style={{ color: line.color ?? "#e6edf3" }}
                >
                  {line.text}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onCopy && (
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 border border-[#30363d] bg-[#161b22] p-1 text-[#8b949e] opacity-0 transition-opacity hover:bg-[#1f242b] hover:text-[#e6edf3] group-hover:opacity-100"
        >
          {copied ? (
            <CheckIcon className="h-3.5 w-3.5 text-[#3fb950]" />
          ) : (
            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Hooks
   ═══════════════════════════════════════════════════════════════════════════ */

function useRunnerWsUrl(): string {
  const backendUrl = useXyzen((s) => s.backendUrl);
  try {
    const url = new URL(backendUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/xyzen/ws/v1/runner";
    return url.toString();
  } catch {
    return "wss://<your-host>/xyzen/ws/v1/runner";
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main Export — capsule (narrow sidebar) variant
   ═══════════════════════════════════════════════════════════════════════════ */

export function RunnerConnectionZone({
  variant = "capsule",
}: {
  variant?: "capsule" | "panel";
}) {
  const {
    runners,
    runnersLoading,
    fetchRunners,
    deleteRunner,
    updateRunner,
    openTerminal,
  } = useXyzen(
    useShallow((s) => ({
      runners: s.runners,
      runnersLoading: s.runnersLoading,
      fetchRunners: s.fetchRunners,
      deleteRunner: s.deleteRunner,
      updateRunner: s.updateRunner,
      openTerminal: s.openTerminal,
    })),
  );

  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    fetchRunners();
  }, [fetchRunners]);

  const handleDoneCreate = useCallback(() => {
    setShowCreate(false);
  }, []);

  // ── Panel variant: two-column fullscreen layout ──
  if (variant === "panel") {
    return (
      <PanelLayout
        runners={runners}
        runnersLoading={runnersLoading}
        showCreate={showCreate}
        onShowCreate={() => setShowCreate(true)}
        onDoneCreate={handleDoneCreate}
        onDelete={deleteRunner}
        onToggle={updateRunner}
        onOpenTerminal={openTerminal}
      />
    );
  }

  // ── Capsule variant: narrow single-column stacked layout ──

  // No runners — show install guide only
  if (!runnersLoading && runners.length === 0 && !showCreate) {
    return (
      <div className="flex-1 flex flex-col bg-[#0d1117]">
        <div className="custom-scrollbar flex-1 overflow-y-auto">
          <InstallGuide onConnect={() => setShowCreate(true)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#0d1117]">
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {/* Inline token creation flow */}
        {showCreate && (
          <div className="p-3">
            <CreateRunnerFlow onDone={handleDoneCreate} />
          </div>
        )}

        {/* Runner cards */}
        {runners.map((runner) => (
          <div key={runner.id} className="p-3">
            <RunnerCard
              runner={runner}
              onDelete={deleteRunner}
              onToggle={updateRunner}
              onOpenTerminal={openTerminal}
              onAddAnother={() => setShowCreate(true)}
            />
          </div>
        ))}

        {/* Loading state */}
        {runnersLoading && runners.length === 0 && !showCreate && (
          <div className="px-3 py-4 text-center">
            <p className="font-mono text-xs text-[#484f58]">loading...</p>
          </div>
        )}

        {/* Add button when runners exist and not creating */}
        {runners.length > 0 && !showCreate && (
          <div className="px-3 pb-3">
            <button
              onClick={() => setShowCreate(true)}
              className="flex w-full items-center justify-center gap-1.5 border border-[#30363d] bg-[#161b22] py-2 font-mono text-xs text-[#8b949e] transition-colors hover:border-[#8b949e] hover:text-[#e6edf3]"
            >
              <PlusIcon className="h-3 w-3" />+ runner
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Panel Layout — fullscreen two-column layout
   Left: Install guide (always visible)
   Right: Runner management (cards + create flow)
   ═══════════════════════════════════════════════════════════════════════════ */

function PanelLayout({
  runners,
  runnersLoading,
  showCreate,
  onShowCreate,
  onDoneCreate,
  onDelete,
  onToggle,
  onOpenTerminal,
}: {
  runners: RunnerRead[];
  runnersLoading: boolean;
  showCreate: boolean;
  onShowCreate: () => void;
  onDoneCreate: () => void;
  onDelete: (id: string) => Promise<void>;
  onToggle: (
    id: string,
    data: { name?: string; is_active?: boolean },
  ) => Promise<void>;
  onOpenTerminal: (command?: string) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row h-full gap-px bg-[#0d1117]">
      {/* Left / Top column: Install guide — always visible */}
      <div className="custom-scrollbar sm:w-1/2 shrink-0 overflow-y-auto border-b sm:border-b-0 sm:border-r border-[#21262d]">
        <InstallGuide onConnect={onShowCreate} />
      </div>

      {/* Right / Bottom column: Runner management */}
      <div className="custom-scrollbar sm:w-1/2 flex-1 overflow-y-auto">
        {/* Inline token creation flow */}
        {showCreate && (
          <div className="p-4">
            <CreateRunnerFlow onDone={onDoneCreate} />
          </div>
        )}

        {/* Runner cards */}
        {runners.map((runner) => (
          <div key={runner.id} className="p-4">
            <RunnerCard
              runner={runner}
              onDelete={onDelete}
              onToggle={onToggle}
              onOpenTerminal={onOpenTerminal}
              onAddAnother={onShowCreate}
            />
          </div>
        ))}

        {/* Loading state */}
        {runnersLoading && runners.length === 0 && !showCreate && (
          <div className="px-4 py-8 text-center">
            <p className="font-mono text-xs text-[#484f58]">loading...</p>
          </div>
        )}

        {/* Empty state — no runners yet, not creating */}
        {!runnersLoading && runners.length === 0 && !showCreate && (
          <div className="flex flex-col items-center justify-center px-4 py-16">
            <p className="font-mono text-sm text-[#8b949e]">
              No runners connected
            </p>
            <p className="mt-1 font-mono text-xs text-[#484f58]">
              Follow the steps above to get started
            </p>
          </div>
        )}

        {/* Add button when runners exist and not creating */}
        {runners.length > 0 && !showCreate && (
          <div className="px-4 pb-4">
            <button
              onClick={onShowCreate}
              className="flex w-full items-center justify-center gap-1.5 border border-[#30363d] bg-[#161b22] py-2 font-mono text-xs text-[#8b949e] transition-colors hover:border-[#8b949e] hover:text-[#e6edf3]"
            >
              <PlusIcon className="h-3 w-3" />+ runner
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Install Guide — SDK download with platform detection
   ═══════════════════════════════════════════════════════════════════════════ */

function InstallGuide({ onConnect }: { onConnect: () => void }) {
  const { t } = useTranslation();
  const detected = useMemo(detectPlatform, []);
  const [selectedPlatform, setSelectedPlatform] =
    useState<PlatformInfo>(detected);
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);

  const curlLines = selectedPlatform.curlCmd.split(" && ").map((part, i) => ({
    text: i === 0 ? `$ ${part}` : `$ ${part}`,
    color: "#3fb950",
  }));

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div>
        <h3 className="font-mono text-sm font-bold text-[#e6edf3]">
          {t("capsule.sandbox.runner.connectTitle")}
        </h3>
        <p className="mt-1 font-mono text-xs text-[#8b949e]">
          {t("capsule.sandbox.runner.subtitle")}
        </p>
      </div>

      {/* Step 1: Install */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-[#3fb950] font-mono text-[10px] font-bold text-[#3fb950]">
            1
          </span>
          <span className="font-mono text-xs font-medium text-[#e6edf3]">
            {t("capsule.sandbox.runner.step1")}
          </span>
        </div>

        {/* Platform selector */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-[#8b949e]">
            {t("capsule.sandbox.runner.detected")}:
          </span>
          <button
            onClick={() => setShowAllPlatforms((p) => !p)}
            className="border border-[#30363d] bg-[#161b22] px-2 py-0.5 font-mono text-[11px] text-[#58a6ff] transition-colors hover:border-[#58a6ff]"
          >
            {selectedPlatform.label} <span className="text-[#484f58]">v</span>
          </button>
        </div>

        {/* Platform dropdown */}
        {showAllPlatforms && (
          <div className="border border-[#30363d] bg-[#161b22]">
            {PLATFORMS.map((p) => (
              <button
                key={p.key}
                onClick={() => {
                  setSelectedPlatform(p);
                  setShowAllPlatforms(false);
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-[#1f242b] ${
                  p.key === selectedPlatform.key
                    ? "text-[#58a6ff]"
                    : "text-[#8b949e]"
                }`}
              >
                {p.key === selectedPlatform.key && (
                  <CheckIcon className="h-3 w-3 text-[#58a6ff]" />
                )}
                {p.key !== selectedPlatform.key && (
                  <span className="inline-block w-3" />
                )}
                {p.label}
              </button>
            ))}
          </div>
        )}

        <p className="font-mono text-[11px] text-[#8b949e]">
          {t("capsule.sandbox.runner.step1Hint")}
        </p>

        {/* curl command */}
        <CodeBlock lines={curlLines} onCopy={selectedPlatform.curlCmd} />

        {/* macOS Gatekeeper hint */}
        {selectedPlatform.key.startsWith("darwin-") && (
          <div className="space-y-1.5 border-l-2 border-[#d29922] bg-[#d29922]/5 px-2.5 py-2">
            <p className="font-mono text-[11px] font-medium text-[#d29922]">
              {t("capsule.sandbox.runner.macSecurityTitle")}
            </p>
            <p className="font-mono text-[10px] leading-relaxed text-[#8b949e]">
              {t("capsule.sandbox.runner.macSecurityHint")}
            </p>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-[#21262d]" />

      {/* Step 2: Connect */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center border border-[#58a6ff] font-mono text-[10px] font-bold text-[#58a6ff]">
            2
          </span>
          <span className="font-mono text-xs font-medium text-[#e6edf3]">
            {t("capsule.sandbox.runner.step2")}
          </span>
        </div>
        <p className="font-mono text-[11px] text-[#8b949e]">
          {t("capsule.sandbox.runner.step2Hint")}
        </p>
        <button
          onClick={onConnect}
          className="w-full border border-[#3fb950] bg-[#238636] px-3 py-2 font-mono text-[12px] font-semibold text-white transition-colors hover:bg-[#2ea043]"
        >
          {t("capsule.sandbox.runner.generateToken")}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Inline Token Creation Flow
   ═══════════════════════════════════════════════════════════════════════════ */

function CreateRunnerFlow({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createRunnerToken = useXyzen((s) => s.createRunnerToken);

  const [name, setName] = useState("");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [connectCommand, setConnectCommand] = useState<string | null>(null);
  const [copied, setCopied] = useState<"token" | "command" | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!name.trim()) return;
    const result = await createRunnerToken(name.trim());
    if (result) {
      setGeneratedToken(result.token);
      setConnectCommand(result.connect_command);
    }
  }, [name, createRunnerToken]);

  const handleCopy = useCallback(
    async (text: string, type: "token" | "command") => {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    },
    [],
  );

  const handleDone = useCallback(() => {
    setName("");
    setGeneratedToken(null);
    setConnectCommand(null);
    onDone();
  }, [onDone]);

  return (
    <TerminalWindow title="connect-runner">
      {!generatedToken ? (
        <div className="space-y-3">
          <p className="text-[#e6edf3]">
            {t("capsule.sandbox.runner.create.title")}
          </p>
          <div>
            <label className="mb-1 block text-[11px] text-[#8b949e]">
              {t("capsule.sandbox.runner.create.nameLabel")}
            </label>
            <Input
              value={name}
              onChange={(e) => setName((e.target as HTMLInputElement).value)}
              placeholder={t("capsule.sandbox.runner.create.namePlaceholder")}
              className="!rounded-none !border-[#30363d] !bg-[#010409] !font-mono !text-[12px] !text-[#e6edf3] placeholder:!text-[#484f58]"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleGenerate}
              disabled={!name.trim()}
              className="border border-[#3fb950] bg-[#238636] px-3 py-1.5 font-mono text-[12px] font-semibold text-white transition-colors hover:bg-[#2ea043] disabled:opacity-40"
            >
              {t("capsule.sandbox.runner.create.generate")}
            </button>
            <button
              onClick={handleDone}
              className="border border-[#30363d] bg-[#21262d] px-3 py-1.5 font-mono text-[12px] text-[#8b949e] transition-colors hover:border-[#8b949e] hover:text-[#e6edf3]"
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Warning */}
          <div className="border border-[#d29922]/40 bg-[#d29922]/10 p-2">
            <p className="text-[11px] text-[#d29922]">
              {t("capsule.sandbox.runner.create.tokenWarning")}
            </p>
          </div>

          {/* Token */}
          <div>
            <label className="mb-1 block text-[11px] text-[#8b949e]">
              {t("capsule.sandbox.runner.tokenPrefix")}
            </label>
            <div className="flex items-center gap-1.5">
              <code className="custom-scrollbar flex-1 overflow-x-auto border border-[#30363d] bg-[#010409] px-2.5 py-1.5 text-[11px] text-[#3fb950]">
                {generatedToken}
              </code>
              <button
                onClick={() => handleCopy(generatedToken, "token")}
                className="shrink-0 border border-[#30363d] bg-[#161b22] p-1.5 text-[#8b949e] transition-colors hover:border-[#8b949e] hover:text-[#e6edf3]"
              >
                {copied === "token" ? (
                  <CheckIcon className="h-3.5 w-3.5 text-[#3fb950]" />
                ) : (
                  <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Connect command */}
          {connectCommand && (
            <div>
              <label className="mb-1 block text-[11px] text-[#8b949e]">
                {t("capsule.sandbox.runner.create.connectionCommand")}
              </label>
              <CodeBlock
                lines={connectCommand
                  .split("\n")
                  .map((l) => ({ text: l, color: "#3fb950" }))}
                onCopy={connectCommand}
              />
            </div>
          )}

          <button
            onClick={handleDone}
            className="border border-[#3fb950] bg-[#238636] px-3 py-1.5 font-mono text-[12px] font-semibold text-white transition-colors hover:bg-[#2ea043]"
          >
            {t("capsule.sandbox.runner.create.done")}
          </button>
        </div>
      )}
    </TerminalWindow>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Runner Card (Online / Offline) — terminal style
   ═══════════════════════════════════════════════════════════════════════════ */

function RunnerCard({
  runner,
  onDelete,
  onToggle,
  onOpenTerminal,
  onAddAnother,
}: {
  runner: RunnerRead;
  onDelete: (id: string) => Promise<void>;
  onToggle: (
    id: string,
    data: { name?: string; is_active?: boolean },
  ) => Promise<void>;
  onOpenTerminal: (command?: string) => void;
  onAddAnother: () => void;
}) {
  const { t } = useTranslation();
  const wsUrl = useRunnerWsUrl();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [commandCopied, setCommandCopied] = useState(false);

  const handleDelete = useCallback(async () => {
    await onDelete(runner.id);
    setDeleteConfirm(false);
    setMenuOpen(false);
  }, [onDelete, runner.id]);

  const handleToggle = useCallback(async () => {
    await onToggle(runner.id, { is_active: !runner.is_active });
    setMenuOpen(false);
  }, [onToggle, runner.id, runner.is_active]);

  const handleCopyCommand = useCallback(async () => {
    const cmd = `xyzen connect --token <your-token> --url ${wsUrl}`;
    await navigator.clipboard.writeText(cmd);
    setCommandCopied(true);
    setTimeout(() => setCommandCopied(false), 2000);
  }, [wsUrl]);

  const isOnline = runner.is_online && runner.is_active;

  // Online: compact terminal card
  if (isOnline) {
    return (
      <div className="border border-[#30363d] bg-[#0d1117]">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div
            className="h-2 w-2 shrink-0 bg-[#3fb950]"
            style={{ boxShadow: "0 0 6px rgba(63,185,80,0.5)" }}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-[12px] font-bold text-[#e6edf3]">
                {runner.name}
              </span>
              <span className="border border-[#238636] bg-[#238636]/20 px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#3fb950]">
                {t("capsule.sandbox.runner.online")}
              </span>
            </div>
            <p className="mt-0.5 truncate font-mono text-[10px] text-[#484f58]">
              {[runner.os_info, runner.work_dir].filter(Boolean).join(" :: ")}
            </p>
          </div>

          {/* Terminal button */}
          <button
            onClick={() => onOpenTerminal()}
            className="shrink-0 border border-[#30363d] bg-[#161b22] p-1.5 text-[#58a6ff] transition-colors hover:border-[#58a6ff] hover:text-[#79c0ff]"
            title={t("capsule.sandbox.runner.openTerminal")}
          >
            <CommandLineIcon className="h-3.5 w-3.5" />
          </button>

          {/* Overflow menu */}
          <OverflowMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            runner={runner}
            deleteConfirm={deleteConfirm}
            onDeleteConfirm={setDeleteConfirm}
            onDelete={handleDelete}
            onToggle={handleToggle}
            onAddAnother={onAddAnother}
          />
        </div>
      </div>
    );
  }

  // Offline / Disabled
  return (
    <div className="border border-[#30363d] bg-[#0d1117]">
      <div className="space-y-2.5 px-3 py-2.5">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 shrink-0 bg-[#484f58]" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-[12px] font-bold text-[#e6edf3]">
                {runner.name}
              </span>
              <span className="border border-[#30363d] bg-[#21262d] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#484f58]">
                {!runner.is_active
                  ? t("capsule.sandbox.runner.disabled")
                  : t("capsule.sandbox.runner.offline")}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-[10px] text-[#484f58]">
              <span>
                {t("capsule.sandbox.runner.tokenPrefix")}: {runner.token_prefix}
                ...
              </span>
              <span>
                {t("capsule.sandbox.runner.lastConnected")}:{" "}
                {runner.last_connected_at
                  ? new Date(runner.last_connected_at).toLocaleString()
                  : t("capsule.sandbox.runner.never")}
              </span>
            </div>
          </div>

          {/* Overflow menu */}
          <OverflowMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            runner={runner}
            deleteConfirm={deleteConfirm}
            onDeleteConfirm={setDeleteConfirm}
            onDelete={handleDelete}
            onToggle={handleToggle}
            onAddAnother={onAddAnother}
          />
        </div>

        {/* Connect command hint */}
        {runner.is_active && (
          <div>
            <p className="mb-1.5 font-mono text-[11px] text-[#8b949e]">
              {t("capsule.sandbox.runner.startHint")}
            </p>
            <div className="flex items-center gap-1.5">
              <code className="custom-scrollbar flex-1 overflow-x-auto whitespace-pre-wrap border border-[#30363d] bg-[#010409] px-2.5 py-1.5 font-mono text-[11px] text-[#3fb950]">
                {`xyzen connect \\\n  --token <your-token> \\\n  --url ${wsUrl}`}
              </code>
              <button
                onClick={handleCopyCommand}
                className="shrink-0 self-start border border-[#30363d] bg-[#161b22] p-1.5 text-[#8b949e] transition-colors hover:border-[#8b949e] hover:text-[#e6edf3]"
              >
                {commandCopied ? (
                  <CheckIcon className="h-3.5 w-3.5 text-[#3fb950]" />
                ) : (
                  <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Overflow Menu — terminal style popover
   ═══════════════════════════════════════════════════════════════════════════ */

function OverflowMenu({
  open,
  onOpenChange,
  runner,
  deleteConfirm,
  onDeleteConfirm,
  onDelete,
  onToggle,
  onAddAnother,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runner: RunnerRead;
  deleteConfirm: boolean;
  onDeleteConfirm: (v: boolean) => void;
  onDelete: () => void;
  onToggle: () => void;
  onAddAnother: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button className="shrink-0 border border-[#30363d] bg-[#161b22] p-1.5 text-[#8b949e] transition-colors hover:border-[#8b949e] hover:text-[#e6edf3]">
          <EllipsisHorizontalIcon className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="!rounded-none !border-[#30363d] !bg-[#161b22] !p-1 !shadow-xl"
      >
        {deleteConfirm ? (
          <div className="space-y-2 p-2">
            <p className="font-mono text-xs text-[#e6edf3]">
              {t("capsule.sandbox.runner.deleteConfirm")}
            </p>
            <div className="flex gap-1.5">
              <button
                onClick={onDelete}
                className="bg-[#da3633] px-2 py-1 font-mono text-xs font-medium text-white transition-colors hover:bg-[#f85149]"
              >
                {t("common.confirm")}
              </button>
              <button
                onClick={() => onDeleteConfirm(false)}
                className="border border-[#30363d] px-2 py-1 font-mono text-xs text-[#8b949e] transition-colors hover:border-[#8b949e] hover:text-[#e6edf3]"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <button
              onClick={() => {
                onToggle();
              }}
              className="w-full px-2.5 py-1.5 text-left font-mono text-[12px] text-[#e6edf3] transition-colors hover:bg-[#1f242b]"
            >
              {runner.is_active
                ? t("capsule.sandbox.runner.disable")
                : t("capsule.sandbox.runner.enable")}
            </button>
            <button
              onClick={() => onDeleteConfirm(true)}
              className="w-full px-2.5 py-1.5 text-left font-mono text-[12px] text-[#f85149] transition-colors hover:bg-[#f85149]/10"
            >
              {t("capsule.sandbox.runner.delete")}
            </button>
            <div className="my-1 h-px bg-[#21262d]" />
            <button
              onClick={() => {
                onAddAnother();
                onOpenChange(false);
              }}
              className="w-full px-2.5 py-1.5 text-left font-mono text-[12px] text-[#e6edf3] transition-colors hover:bg-[#1f242b]"
            >
              {t("capsule.sandbox.runner.addAnother")}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
