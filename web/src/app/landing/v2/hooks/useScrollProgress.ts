import { useEffect, useState, useRef, useCallback } from "react";

/**
 * Track scroll progress within a specific element.
 * Returns a value from 0 to 1 representing how far through the element
 * the viewport has scrolled.
 */
export function useScrollProgress(offset = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

  const handleScroll = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    // 0 when element top enters viewport, 1 when element bottom exits
    const total = rect.height + windowHeight;
    const scrolled = windowHeight - rect.top + offset;
    const p = Math.max(0, Math.min(1, scrolled / total));
    setProgress(p);
  }, [offset]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  return { ref, progress };
}

/**
 * Simple hook that returns scrollTop of the landing page scroll container.
 * The landing page uses a fixed div with overflow-y-auto (.custom-scrollbar)
 * instead of native window scroll, so window.scrollY is always 0.
 */
export function usePageScroll() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const container = document.querySelector(
      ".custom-scrollbar",
    ) as HTMLElement | null;
    const target: EventTarget = container ?? window;

    const handler = () => {
      setScrollY(container ? container.scrollTop : window.scrollY);
    };

    target.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => target.removeEventListener("scroll", handler);
  }, []);

  return scrollY;
}
