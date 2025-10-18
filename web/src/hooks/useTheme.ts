import { useCallback, useEffect, useState } from "react";
import { useXyzen } from "@/store";

type Theme = "light" | "dark" | "system";

const useTheme = () => {
  const [theme, setTheme] = useState<Theme>("system");
  const setStoreTheme = useXyzen((state) => state.setTheme);

  const applyTheme = useCallback((selectedTheme: Theme) => {
    const root = window.document.documentElement;
    const isDark =
      selectedTheme === "dark" ||
      (selectedTheme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    // 注入CSS以禁用过渡
    const style = document.createElement("style");
    style.innerHTML = "*, *::before, *::after { transition: none !important; }";
    document.head.appendChild(style);

    root.classList.toggle("dark", isDark);
    localStorage.setItem("theme", selectedTheme);

    // 在短时间后移除样式，以恢复过渡效果
    // 这确保了仅在主题切换的瞬间禁用过渡
    setTimeout(() => {
      if (document.head.contains(style)) {
        document.head.removeChild(style);
      }
    }, 50);
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as Theme | null;
    const initialTheme = savedTheme || "system";
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, [applyTheme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      if (theme === "system") {
        applyTheme("system");
      }
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [theme, applyTheme]);

  const cycleTheme = () => {
    const themes: Theme[] = ["light", "dark", "system"];
    const currentIndex = themes.indexOf(theme);
    const nextTheme = themes[(currentIndex + 1) % themes.length];
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  const changeTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    applyTheme(newTheme);
    setStoreTheme(newTheme); // Sync with Zustand store
  };

  return { theme, cycleTheme, setTheme: changeTheme };
};

export default useTheme;
