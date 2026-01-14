"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/animate-ui/components/animate/tooltip";
import { CopyButton } from "@/components/animate-ui/components/buttons/copy";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/animate-ui/components/radix/dropdown-menu";
import { PointsInfoModal } from "@/components/features/PointsInfoModal";
import { TokenInputModal } from "@/components/features/TokenInputModal";
import { useAuth } from "@/hooks/useAuth";
import { useUserWallet } from "@/hooks/useUserWallet";
import { useXyzen } from "@/store";
import {
  ArrowTopRightOnSquareIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  SparklesIcon,
  UserIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";

export interface AuthStatusProps {
  onTokenInput?: (token: string) => void;
  className?: string;
}

export function AuthStatus({ onTokenInput, className = "" }: AuthStatusProps) {
  const auth = useAuth();
  const { openSettingsModal } = useXyzen();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showPointsInfo, setShowPointsInfo] = useState(false);

  const isAuthedForUi = auth.isAuthenticated || !!auth.token;
  const walletQuery = useUserWallet(auth.token, isAuthedForUi);

  const maskedToken = (() => {
    const token = auth.token;
    if (!token) return "暂无 access_token";
    if (token.length <= 20) return "***";
    return `${token.slice(0, 10)}…${token.slice(-8)}`;
  })();

  const copyTokenFallback = useCallback(async () => {
    if (!auth.token) return;
    try {
      await navigator.clipboard.writeText(auth.token);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = auth.token;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  }, [auth.token]);

  // 处理token输入
  // 处理token输入
  const handleTokenSubmit = async (token: string) => {
    await auth.login(token);
    onTokenInput?.(token);
  };
  if (auth.isLoading) {
    return (
      <div className={`flex items-center space-x-2 ${className}`}>
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-indigo-600 dark:border-neutral-700 dark:border-t-indigo-500" />
        <span className="text-sm text-neutral-500">检查认证状态...</span>
      </div>
    );
  }

  // 已登录：展示用户信息
  if (isAuthedForUi) {
    return (
      <>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800 ${className}`}
              title="认证信息"
            >
              {auth.user?.avatar ? (
                <img
                  src={auth.user.avatar}
                  alt={auth.user?.username ?? "User"}
                  className="h-6 w-6 rounded-full"
                />
              ) : (
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900">
                  <UserIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                </div>
              )}

              <span className="text-sm font-medium max-w-32 truncate text-neutral-900 dark:text-neutral-100">
                {auth.user?.username ?? "已登录"}
              </span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="text-xs">账户</DropdownMenuLabel>

            <div className="px-2 py-1.5">
              <div className="relative overflow-hidden rounded-lg border border-indigo-100 bg-linear-to-br from-indigo-50/80 to-white p-3 dark:border-indigo-500/20 dark:from-indigo-950/20 dark:to-neutral-900/20">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 shadow-sm dark:bg-indigo-500/20 dark:text-indigo-400">
                      <SparklesIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400">
                        积分余额
                      </div>
                      <div className="font-bold text-indigo-900 dark:text-indigo-100">
                        {walletQuery.isLoading
                          ? "..."
                          : (walletQuery.data?.virtual_balance ?? "--")}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setShowPointsInfo(true);
                    }}
                    className="rounded-full p-1 text-neutral-400 transition-colors hover:bg-white/50 hover:text-indigo-600 dark:text-neutral-500 dark:hover:bg-neutral-800 dark:hover:text-indigo-400"
                    title="积分说明"
                  >
                    <InformationCircleIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-xs">凭证</DropdownMenuLabel>
            <div className="px-2 py-1.5">
              <div className="mb-1 flex items-center justify-between">
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  access_token
                </div>
                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip side="top">
                      <TooltipTrigger asChild>
                        <CopyButton
                          content={auth.token ?? ""}
                          variant="ghost"
                          size="xs"
                          disabled={!auth.token}
                          className="text-neutral-500 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-400 dark:hover:text-neutral-200"
                        />
                      </TooltipTrigger>
                      <TooltipContent>复制</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>

                  <TooltipProvider>
                    <Tooltip side="top">
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          disabled={!auth.token}
                          onClick={() => {
                            if (!auth.token) return;
                            const encoded = encodeURIComponent(auth.token);
                            window.open(
                              `https://chat.sciol.ac.cn/?access_token=${encoded}`,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }}
                          className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-60 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                        >
                          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>在 App 中打开</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              <button
                type="button"
                disabled={!auth.token}
                onClick={() => void copyTokenFallback()}
                className="w-full rounded-md bg-neutral-100 px-2 py-1.5 text-left font-mono text-[11px] text-neutral-800 hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                title={auth.token ? "点击复制" : "暂无 access_token"}
              >
                <span className="block truncate">{maskedToken}</span>
              </button>
            </div>

            <DropdownMenuSeparator />

            <div className="p-1">
              <DropdownMenuItem
                onSelect={() => {
                  setMenuOpen(false);
                  openSettingsModal();
                }}
                className="flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-neutral-100 focus:bg-neutral-100 dark:hover:bg-neutral-800 dark:focus:bg-neutral-800"
              >
                <Cog6ToothIcon className="mr-2 h-4 w-4" />
                设置
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        <PointsInfoModal
          isOpen={showPointsInfo}
          onClose={() => setShowPointsInfo(false)}
        />
      </>
    );
  }

  // 未登录或失败：显示感叹号，点击可输入 Token
  const tooltipMessage =
    auth.status === "failed" ? "认证错误或未配置" : "未授权的用户";
  return (
    <>
      <div className={`flex items-center space-x-2 ${className}`}>
        <button
          onClick={() => setShowTokenModal(true)}
          className="flex items-center justify-center h-6 w-6 rounded-full text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20 transition-colors"
          title={tooltipMessage}
        >
          <ExclamationTriangleIcon className="h-4 w-4" />
        </button>
      </div>

      <TokenInputModal
        isOpen={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        onSubmit={handleTokenSubmit}
      />
    </>
  );
}
