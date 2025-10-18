import { useXyzen } from "@/store";
import {
  ViewColumnsIcon,
  Bars3BottomRightIcon,
} from "@heroicons/react/24/outline";

export type LayoutToggleProps = {
  className?: string;
  title?: string;
};

export const LayoutToggle = ({
  className,
  title = "Toggle Layout",
}: LayoutToggleProps) => {
  const { layoutStyle, setLayoutStyle } = useXyzen();

  const toggleLayout = () => {
    setLayoutStyle(layoutStyle === "sidebar" ? "fullscreen" : "sidebar");
  };

  const baseClass =
    "rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800";

  return (
    <button
      className={`${baseClass}${className ? ` ${className}` : ""}`}
      title={title}
      onClick={toggleLayout}
      aria-label={title}
      type="button"
    >
      {layoutStyle === "sidebar" ? (
        <ViewColumnsIcon className="h-5 w-5" />
      ) : (
        <Bars3BottomRightIcon className="h-5 w-5" />
      )}
    </button>
  );
};
