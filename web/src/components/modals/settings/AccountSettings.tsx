import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { authService, type LinkedAccount } from "@/service/authService";
import { useXyzen } from "@/store";
import {
  ArrowPathIcon,
  CameraIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  PencilIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// Allowed image types
const ALLOWED_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export const AccountSettings = () => {
  const { t } = useTranslation();
  const user = useXyzen((state) => state.user);
  const setUser = useXyzen((state) => state.setUser);

  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Avatar upload state
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Display name edit state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(user?.username || "");
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const fetchAccounts = async (validate = false) => {
    try {
      if (validate && accounts.length > 0) {
        setIsValidating(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      const response = await authService.getLinkedAccounts(validate);
      setAccounts(response.accounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch accounts");
    } finally {
      setIsLoading(false);
      setIsValidating(false);
    }
  };

  // Auto-validate on mount
  useEffect(() => {
    fetchAccounts(true);
  }, []);

  const handleRelink = async (providerName: string) => {
    try {
      const providerTypeMap: Record<string, string> = {
        custom: "Custom",
        github: "GitHub",
        google: "Google",
        wechat: "WeChat",
      };
      const providerType = providerTypeMap[providerName] || providerName;

      // 回调地址 - 登录完成后会带着 code 回到这里
      const redirectUri = window.location.origin + "/auth/relink-callback";

      const response = await authService.getLinkUrl(providerType, redirectUri);

      // 打开 popup 窗口
      const width = 500;
      const height = 650;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        response.url,
        "relink_popup",
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`,
      );

      if (!popup) {
        setError("Popup blocked. Please allow popups for this site.");
        return;
      }

      // 监听 popup 关闭
      const checkPopup = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopup);
          window.removeEventListener("message", handleMessage);
          // 刷新账户列表
          fetchAccounts(true);
        }
      }, 500);

      // 监听来自 popup 的消息
      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === "relink_complete") {
          clearInterval(checkPopup);
          popup.close();
          window.removeEventListener("message", handleMessage);
          // 刷新账户列表
          fetchAccounts(true);
        }
      };
      window.addEventListener("message", handleMessage);
    } catch (err) {
      console.error("Failed to get link URL:", err);
      setError("Failed to initiate re-authorization");
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset states
    setAvatarError(null);
    setAvatarSuccess(false);

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setAvatarError(
        t(
          "settings.account.avatar.invalidType",
          "Invalid file type. Please use PNG, JPG, GIF, or WebP.",
        ),
      );
      return;
    }

    // Validate file size
    if (file.size > MAX_SIZE) {
      setAvatarError(
        t("settings.account.avatar.tooLarge", "File size exceeds 5MB limit."),
      );
      return;
    }

    try {
      setIsUploadingAvatar(true);
      const response = await authService.uploadAvatar(file);

      if (response.success && response.avatar_url) {
        // Update user in store
        if (user) {
          setUser({
            ...user,
            avatar: response.avatar_url,
          });
        }
        setAvatarSuccess(true);
        setTimeout(() => setAvatarSuccess(false), 3000);
      } else {
        setAvatarError(
          response.message ||
            t(
              "settings.account.avatar.uploadFailed",
              "Failed to upload avatar",
            ),
        );
      }
    } catch (err) {
      setAvatarError(
        err instanceof Error
          ? err.message
          : t(
              "settings.account.avatar.uploadFailed",
              "Failed to upload avatar",
            ),
      );
    } finally {
      setIsUploadingAvatar(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleEditNameClick = () => {
    setEditedName(user?.username || "");
    setIsEditingName(true);
    setNameError(null);
    setNameSuccess(false);
    // Focus the input after render
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const handleNameCancel = () => {
    setIsEditingName(false);
    setEditedName(user?.username || "");
    setNameError(null);
  };

  const handleNameSave = async () => {
    const trimmedName = editedName.trim();

    // Validate
    if (!trimmedName) {
      setNameError(
        t("settings.account.displayName.empty", "Display name cannot be empty"),
      );
      return;
    }
    if (trimmedName.length > 50) {
      setNameError(
        t(
          "settings.account.displayName.tooLong",
          "Display name cannot exceed 50 characters",
        ),
      );
      return;
    }

    // Skip if unchanged
    if (trimmedName === user?.username) {
      setIsEditingName(false);
      return;
    }

    try {
      setIsUpdatingName(true);
      setNameError(null);

      const response = await authService.updateDisplayName(trimmedName);

      if (response.success && response.display_name) {
        // Update user in store
        if (user) {
          setUser({
            ...user,
            username: response.display_name,
          });
        }
        setIsEditingName(false);
        setNameSuccess(true);
        setTimeout(() => setNameSuccess(false), 3000);
      } else {
        setNameError(
          response.message ||
            t(
              "settings.account.displayName.updateFailed",
              "Failed to update display name",
            ),
        );
      }
    } catch (err) {
      setNameError(
        err instanceof Error
          ? err.message
          : t(
              "settings.account.displayName.updateFailed",
              "Failed to update display name",
            ),
      );
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNameSave();
    } else if (e.key === "Escape") {
      handleNameCancel();
    }
  };

  return (
    <div className="flex flex-col p-4 md:p-6 space-y-6">
      {/* Profile Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-pink-500/10 p-6 dark:from-indigo-500/20 dark:via-purple-500/20 dark:to-pink-500/20">
        {/* Background decoration */}
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-gradient-to-br from-pink-500/20 to-purple-500/20 blur-2xl" />

        <div className="relative flex items-center gap-5">
          {/* Avatar */}
          <div className="group relative">
            <div
              className={cn(
                "h-20 w-20 overflow-hidden rounded-2xl bg-white/80 shadow-lg ring-4 ring-white/50 transition-all duration-300 dark:bg-neutral-800 dark:ring-neutral-700/50",
                "group-hover:ring-indigo-500/50 group-hover:shadow-indigo-500/25",
              )}
            >
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.username}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-3xl font-bold text-white">
                  {user?.username?.charAt(0).toUpperCase() || "?"}
                </div>
              )}
            </div>
            {/* Upload button */}
            <button
              onClick={handleAvatarClick}
              disabled={isUploadingAvatar}
              className={cn(
                "absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-sm",
                "bg-white shadow-lg ring-2 ring-white transition-all duration-200",
                "hover:bg-indigo-50 hover:ring-indigo-500 hover:scale-110",
                "dark:bg-neutral-700 dark:ring-neutral-600 dark:hover:bg-neutral-600",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isUploadingAvatar ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" />
              ) : (
                <CameraIcon className="h-4 w-4 text-neutral-600 dark:text-neutral-300" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ALLOWED_TYPES.join(",")}
              onChange={handleAvatarChange}
              className="hidden"
            />
          </div>

          {/* User Info */}
          <div className="flex-1 min-w-0 space-y-1">
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <Input
                  ref={nameInputRef}
                  type="text"
                  placeholder={t(
                    "settings.account.displayName.label",
                    "Display Name",
                  )}
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={handleNameKeyDown}
                  maxLength={50}
                  className="h-9 flex-1 bg-white/80 dark:bg-neutral-800/80"
                  disabled={isUpdatingName}
                />
                <button
                  onClick={handleNameSave}
                  disabled={isUpdatingName}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-md transition-all hover:bg-indigo-700 hover:scale-105 disabled:opacity-50"
                >
                  {isUpdatingName ? (
                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircleIcon className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={handleNameCancel}
                  disabled={isUpdatingName}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-200 text-neutral-600 transition-all hover:bg-neutral-300 hover:scale-105 disabled:opacity-50 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
                >
                  <span className="text-lg leading-none">&times;</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-neutral-900 dark:text-white truncate">
                  {user?.username || "User"}
                </h2>
                <button
                  onClick={handleEditNameClick}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 transition-all hover:bg-white/50 hover:text-neutral-600 hover:scale-110 dark:hover:bg-neutral-700/50 dark:hover:text-neutral-300"
                  title={t(
                    "settings.account.displayName.edit",
                    "Edit display name",
                  )}
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                {nameSuccess && (
                  <span className="animate-in fade-in slide-in-from-left-2 duration-300">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                  </span>
                )}
              </div>
            )}

            {/* Status messages */}
            {nameError && (
              <p className="animate-in fade-in slide-in-from-top-1 duration-200 text-sm text-red-600 dark:text-red-400">
                {nameError}
              </p>
            )}
            {avatarSuccess && (
              <p className="animate-in fade-in slide-in-from-top-1 duration-200 flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                <CheckCircleIcon className="h-4 w-4" />
                {t(
                  "settings.account.avatar.success",
                  "Avatar updated successfully",
                )}
              </p>
            )}
            {avatarError && (
              <p className="animate-in fade-in slide-in-from-top-1 duration-200 text-sm text-red-600 dark:text-red-400">
                {avatarError}
              </p>
            )}
            {!nameError && !avatarSuccess && !avatarError && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {t(
                  "settings.account.avatar.hint",
                  "Click the camera icon to upload a new avatar",
                )}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Linked Accounts Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-indigo-500" />
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              {t("settings.account.linkedTitle", "Linked Accounts")}
            </h3>
          </div>
          <button
            onClick={() => fetchAccounts(true)}
            disabled={isValidating || isLoading}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
              "bg-neutral-100 text-neutral-700 hover:bg-neutral-200",
              "dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "hover:scale-[1.02] active:scale-[0.98]",
            )}
          >
            <ArrowPathIcon
              className={cn(
                "h-4 w-4",
                (isValidating || isLoading) && "animate-spin",
              )}
            />
            {t("settings.account.validateAll", "Refresh")}
          </button>
        </div>

        {/* Error State */}
        {error && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300 rounded-sm bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <div className="relative">
              <div className="h-12 w-12 rounded-full border-4 border-neutral-200 dark:border-neutral-700" />
              <div className="absolute inset-0 h-12 w-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t("settings.account.loading", "Loading accounts...")}
            </p>
          </div>
        ) : accounts.length === 0 ? (
          /* Empty State */
          <div className="animate-in fade-in zoom-in-95 duration-300 rounded-2xl bg-neutral-50 p-8 text-center dark:bg-neutral-800/40">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-100 dark:bg-neutral-700">
              <LinkIcon className="h-8 w-8 text-neutral-400" />
            </div>
            <p className="text-neutral-600 dark:text-neutral-400">
              {t("settings.account.noAccounts", "No linked accounts found")}
            </p>
          </div>
        ) : (
          /* Accounts List */
          <div className="space-y-3">
            {accounts.map((account, index) => (
              <AccountCard
                key={account.provider_name}
                account={account}
                isValidating={isValidating}
                onRelink={() => handleRelink(account.provider_name)}
                index={index}
              />
            ))}
          </div>
        )}

        {/* Info Note */}
        <div className="rounded-sm bg-neutral-50 p-4 dark:bg-neutral-800/40">
          <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
            {t(
              "settings.account.note",
              "Third-party tokens may expire. If a token is expired, click 'Re-authorize' to refresh the connection.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
};

interface AccountCardProps {
  account: LinkedAccount;
  isValidating: boolean;
  onRelink: () => void;
  index: number;
}

const AccountCard = ({
  account,
  isValidating,
  onRelink,
  index,
}: AccountCardProps) => {
  const { t } = useTranslation();
  // 使用后端返回的 provider_icon_url
  const providerIcon = account.provider_icon_url || "";
  // 优先使用用户头像，没有则使用提供商图标
  const avatarUrl = account.avatar_url || providerIcon;

  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-2 duration-300",
        "rounded-sm transition-all",
        "bg-white shadow-sm ring-1 ring-neutral-200/50 hover:shadow-md hover:ring-neutral-300/50",
        "dark:bg-neutral-800/60 dark:ring-neutral-700/50 dark:hover:ring-neutral-600/50",
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          {/* User Avatar */}
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-sm overflow-hidden transition-all",
              "bg-gradient-to-br from-neutral-50 to-neutral-100 shadow-inner",
              "dark:from-neutral-700 dark:to-neutral-800",
            )}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={account.username || account.provider_display_name}
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <LinkIcon className="h-6 w-6 text-neutral-400" />
            )}
          </div>

          {/* Account Info */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              {/* Provider Icon (small) */}
              {providerIcon && (
                <img
                  src={providerIcon}
                  alt={account.provider_display_name}
                  className="h-4 w-4 object-contain"
                />
              )}
              <span className="font-semibold text-neutral-900 dark:text-white">
                {account.provider_display_name}
              </span>
              {/* Validation Status */}
              {account.is_valid !== undefined && account.is_valid !== null && (
                <span
                  className={cn(
                    "animate-in fade-in zoom-in-95 duration-200",
                    "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                    account.is_valid
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                  )}
                >
                  {account.is_valid ? (
                    <>
                      <CheckCircleIcon className="h-3 w-3" />
                      {t("settings.account.valid", "Valid")}
                    </>
                  ) : (
                    <>
                      <ExclamationTriangleIcon className="h-3 w-3" />
                      {t("settings.account.expired", "Expired")}
                    </>
                  )}
                </span>
              )}
              {/* Loading indicator for validation */}
              {isValidating && account.is_valid === undefined && (
                <div className="h-4 w-4 rounded-full border-2 border-neutral-300 border-t-indigo-500 animate-spin dark:border-neutral-600 dark:border-t-indigo-400" />
              )}
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {account.username || account.email || `ID: ${account.user_id}`}
            </p>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-2">
          {account.is_valid === false && (
            <button
              onClick={onRelink}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-medium transition-all",
                "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md",
                "hover:from-indigo-700 hover:to-purple-700 hover:shadow-lg hover:scale-[1.02]",
                "active:scale-[0.98]",
              )}
            >
              {t("settings.account.reauthorize", "Re-authorize")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
