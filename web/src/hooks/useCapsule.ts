import { useXyzen } from "@/store";
import { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";

export type CapsuleTab =
  | "knowledge"
  | "tools"
  | "sandbox"
  | "runner"
  | "memory";

/**
 * Reusable hook for controlling capsule open/close/tab state.
 *
 * The underlying state lives in Zustand (persisted to localStorage),
 * so the user's last explicit choice is always respected across
 * page reloads and agent switches.
 */
export function useCapsule() {
  const { capsuleOpen, capsuleActiveTab, setCapsuleOpen, setCapsuleActiveTab } =
    useXyzen(
      useShallow((s) => ({
        capsuleOpen: s.capsuleOpen,
        capsuleActiveTab: s.capsuleActiveTab,
        setCapsuleOpen: s.setCapsuleOpen,
        setCapsuleActiveTab: s.setCapsuleActiveTab,
      })),
    );

  const open = useCallback(
    (tab?: CapsuleTab) => {
      setCapsuleOpen(true);
      if (tab) setCapsuleActiveTab(tab);
    },
    [setCapsuleOpen, setCapsuleActiveTab],
  );

  const close = useCallback(() => {
    setCapsuleOpen(false);
  }, [setCapsuleOpen]);

  const toggle = useCallback(
    (tab?: CapsuleTab) => {
      if (capsuleOpen) {
        setCapsuleOpen(false);
      } else {
        setCapsuleOpen(true);
        if (tab) setCapsuleActiveTab(tab);
      }
    },
    [capsuleOpen, setCapsuleOpen, setCapsuleActiveTab],
  );

  return {
    isOpen: capsuleOpen,
    activeTab: capsuleActiveTab,
    setActiveTab: setCapsuleActiveTab,
    open,
    close,
    toggle,
  };
}
