import { LoadingSpinner } from "@/components/base/LoadingSpinner";
import { useXyzen } from "@/store";
import type { LoadingKey } from "@/store/slices/loadingSlice";

interface LoadingOverlayProps {
  loadingKey: LoadingKey | string;
  children: React.ReactNode;
  className?: string;
  spinnerSize?: "sm" | "md" | "lg";
  overlay?: boolean;
}

export function LoadingOverlay({
  loadingKey,
  children,
  className = "",
  spinnerSize = "md",
  overlay = true,
}: LoadingOverlayProps) {
  const { getLoading } = useXyzen();
  const isLoading = getLoading(loadingKey);

  if (!isLoading) {
    return <>{children}</>;
  }

  if (overlay) {
    return (
      <div className={`relative ${className}`}>
        {children}
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-sm dark:bg-gray-900/50">
          <LoadingSpinner size={spinnerSize} />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <LoadingSpinner size={spinnerSize} />
    </div>
  );
}

interface InlineLoadingProps {
  loadingKey: LoadingKey | string;
  loadingText?: string;
  children: React.ReactNode;
  spinnerSize?: "sm" | "md" | "lg";
}

export function InlineLoading({
  loadingKey,
  loadingText = "加载中...",
  children,
  spinnerSize = "sm",
}: InlineLoadingProps) {
  const { getLoading } = useXyzen();
  const isLoading = getLoading(loadingKey);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <LoadingSpinner size={spinnerSize} />
        <span>{loadingText}</span>
      </div>
    );
  }

  return <>{children}</>;
}

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loadingKey?: LoadingKey | string;
  loading?: boolean;
  children: React.ReactNode;
}

export function LoadingButton({
  loadingKey,
  loading: externalLoading,
  children,
  disabled,
  className = "",
  ...props
}: LoadingButtonProps) {
  const { getLoading } = useXyzen();
  const isLoading = loadingKey
    ? getLoading(loadingKey)
    : externalLoading || false;

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      className={`relative ${className} ${isLoading ? "cursor-not-allowed opacity-70" : ""}`}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <LoadingSpinner size="sm" />
        </div>
      )}
      <span className={isLoading ? "opacity-0" : ""}>{children}</span>
    </button>
  );
}
