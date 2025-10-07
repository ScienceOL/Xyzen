import useTheme from "@/hooks/useTheme";
import {
  ComputerDesktopIcon,
  MoonIcon,
  SunIcon,
} from "@heroicons/react/24/outline";

export type ThemeToggleProps = {
  className?: string;
  title?: string;
};

export const ThemeToggle = ({
  className,
  title = "切换主题",
}: ThemeToggleProps) => {
  const { theme, cycleTheme } = useTheme();

  const baseClass =
    "rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800";

  return (
    <button
      className={`${baseClass}${className ? ` ${className}` : ""}`}
      title={title}
      onClick={cycleTheme}
      aria-label={title}
      type="button"
    >
      {theme === "light" && <SunIcon className="h-5 w-5" />}
      {theme === "dark" && <MoonIcon className="h-5 w-5" />}
      {theme === "system" && <ComputerDesktopIcon className="h-5 w-5" />}
    </button>
  );
};
