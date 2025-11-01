import React, { useEffect, useRef } from "react";
import { useXyzen } from "@/store";
import clsx from "clsx";
import { ChevronUpIcon } from "@heroicons/react/24/outline";

export function CenteredInput() {
  const {
    isXyzenOpen,
    pendingInput,
    setPendingInput,
    submitInput,
    sendMessage,
    activeChatChannel,
    createDefaultChannel,
    openXyzen,
    setTabIndex
  } = useXyzen();
  const inputRef = useRef<HTMLInputElement>(null);
  const showInput = !isXyzenOpen; // Show input when sidebar is closed

  useEffect(() => {
    if (showInput && inputRef.current) {
      // Auto-focus after a short delay to ensure the input is rendered
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showInput]);

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && pendingInput.trim()) {
      e.preventDefault();
      const messageToSend = pendingInput.trim();

      // First expand to sidebar
      submitInput();

      // Ensure we have a chat channel
      try {
        if (!activeChatChannel) {
          await createDefaultChannel("default-chat");
        }

        // Send the message after sidebar opens and channel is ready
        setTimeout(() => {
          sendMessage(messageToSend);
          setPendingInput(""); // Clear input after sending
        }, 200);
      } catch (error) {
        console.error("Failed to create channel or send message:", error);
        setPendingInput(""); // Clear input even if there's an error
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setPendingInput("");
      inputRef.current?.blur();
    }
  };

  const handleFocus = () => {
    // Auto-focus behavior when clicking on input
  };

  const handleOpenSidebar = () => {
    // Open sidebar without sending message
    openXyzen();
    setTabIndex(1); // Switch to Chat tab
  };

  if (!showInput) {
    return null;
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 px-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={pendingInput}
            onChange={(e) => setPendingInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            placeholder="Type your message and press Enter..."
            className={clsx(
              "w-full appearance-none rounded-full border-2 border-neutral-200 bg-white/90 backdrop-blur-sm py-3 px-6 pr-12 text-base text-neutral-950 placeholder:text-neutral-500",
              "shadow-xl transition-all duration-200",
              "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white",
              "dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-white dark:placeholder:text-neutral-400 dark:focus:ring-indigo-400 dark:focus:border-indigo-400 dark:focus:bg-neutral-900"
            )}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-neutral-400 dark:text-neutral-500">
            ↵
          </div>
        </div>

        <button
          onClick={handleOpenSidebar}
          className={clsx(
            "flex h-12 w-12 items-center justify-center rounded-full border-2 border-neutral-200 bg-white/90 backdrop-blur-sm text-neutral-600",
            "shadow-xl transition-all duration-200",
            "hover:bg-white hover:text-indigo-600 hover:border-indigo-200 hover:shadow-2xl hover:scale-105",
            "focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500",
            "active:scale-95",
            "dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-400",
            "dark:hover:bg-neutral-900 dark:hover:text-indigo-400 dark:hover:border-indigo-700"
          )}
          title="Open sidebar"
        >
          <ChevronUpIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
