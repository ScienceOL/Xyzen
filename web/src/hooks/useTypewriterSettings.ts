import {
  TYPEWRITER_CONFIG,
  TYPEWRITER_PRESETS,
  type TypewriterPresetKey,
} from "@/configs/typewriterConfig";
import { useCallback } from "react";

/**
 * 用于管理打字效果全局设置的 Hook
 */
export function useTypewriterSettings() {
  // 从 localStorage 中读取用户偏好
  const getPreference = useCallback(() => {
    try {
      const stored = localStorage.getItem("typewriterPreset");
      return (stored as TypewriterPresetKey) || "standard";
    } catch {
      return "standard";
    }
  }, []);

  // 保存用户偏好
  const setPreference = useCallback((preset: TypewriterPresetKey) => {
    try {
      localStorage.setItem("typewriterPreset", preset);
    } catch (error) {
      console.warn("Failed to save typewriter preset:", error);
    }
  }, []);

  // 获取当前配置
  const getCurrentConfig = useCallback(() => {
    const preset = getPreference();
    return TYPEWRITER_PRESETS[preset] || TYPEWRITER_PRESETS["standard"];
  }, [getPreference]);

  // 是否启用打字效果
  const isEnabled = useCallback(() => {
    try {
      const stored = localStorage.getItem("typewriterEnabled");
      if (stored === null) return TYPEWRITER_CONFIG.enabled;
      return stored === "true";
    } catch {
      return TYPEWRITER_CONFIG.enabled;
    }
  }, []);

  // 切换打字效果
  const toggle = useCallback(() => {
    try {
      const current = isEnabled();
      localStorage.setItem("typewriterEnabled", String(!current));
      return !current;
    } catch (error) {
      console.warn("Failed to toggle typewriter:", error);
      return TYPEWRITER_CONFIG.enabled;
    }
  }, [isEnabled]);

  return {
    // 当前配置
    config: getCurrentConfig(),

    // 预设列表
    presets: TYPEWRITER_PRESETS,

    // 操作方法
    getPreference,
    setPreference,
    isEnabled,
    toggle,

    // 所有可用的预设 key
    availablePresets: Object.keys(TYPEWRITER_PRESETS) as TypewriterPresetKey[],
  };
}
