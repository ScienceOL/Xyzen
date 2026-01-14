import { useXyzen } from "@/store";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";

export type SettingsButtonProps = {
  className?: string;
  title?: string;
};

export const SettingsButton = ({
  className,
  title = "设置",
}: SettingsButtonProps) => {
  const { openSettingsModal } = useXyzen();

  const baseClass =
    "rounded-sm p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800";

  return (
    <button
      className={`${baseClass}${className ? ` ${className}` : ""}`}
      title={title}
      onClick={() => openSettingsModal("ui")}
      aria-label={title}
      type="button"
    >
      <Cog6ToothIcon className="h-5 w-5" />
    </button>
  );
};
