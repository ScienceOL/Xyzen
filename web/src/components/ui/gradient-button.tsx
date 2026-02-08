"use client";

import { cn } from "@/lib/utils";
import { useState } from "react";

interface GradientButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  href?: string;
}

export function GradientButton({
  children,
  className,
  href,
  ...props
}: GradientButtonProps) {
  const [isHovering, setIsHovering] = useState(false);

  console.log("GradientButton hover state:", isHovering);

  const baseClass =
    "group relative z-[1] flex items-center justify-center rounded px-3 py-1.5 text-sm font-medium outline-none transition-all duration-300";

  const textColorClass =
    "bg-gradient-to-br from-violet-600 to-fuchsia-600 bg-clip-text text-transparent hover:text-white dark:from-violet-400 dark:to-fuchsia-400";

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (href) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
    props.onClick?.(e);
  };

  return (
    <>
      <button
        className={cn(baseClass, textColorClass, className)}
        onClick={handleClick}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        {...props}
      >
        {children}
        <div
          className={cn(
            "absolute inset-0 z-[-1] rounded transition-all duration-300",
            "opacity-0 group-hover:opacity-100",
          )}
          style={{
            backgroundSize: "400% 400%",
            backgroundImage:
              "linear-gradient(90deg, #8B5CF6, #EC4899, #F59E0B)",
            animation: "gradient-flow 8s linear infinite",
          }}
        />
      </button>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes gradient-flow {
              0% {
                background-position: 0% 50%;
              }
              50% {
                background-position: 100% 50%;
              }
              100% {
                background-position: 0% 50%;
              }
            }
          `,
        }}
      />
    </>
  );
}
