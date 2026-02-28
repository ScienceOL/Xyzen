import confetti from "canvas-confetti";
import { useCallback } from "react";

/**
 * Fires a celebration confetti burst — two angled sprays + a center starburst.
 * Designed for purchase-success moments.
 */
export function useCelebration() {
  const celebrate = useCallback(() => {
    const duration = 800;
    const end = Date.now() + duration;

    const colors = [
      "#6366f1", // indigo-500
      "#a78bfa", // violet-400
      "#f472b6", // pink-400
      "#facc15", // yellow-400
      "#34d399", // emerald-400
      "#60a5fa", // blue-400
    ];

    // Two angled sprays from bottom-center
    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0.35, y: 0.9 },
        colors,
        ticks: 120,
        gravity: 0.9,
        scalar: 1.1,
        drift: -0.3,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 0.65, y: 0.9 },
        colors,
        ticks: 120,
        gravity: 0.9,
        scalar: 1.1,
        drift: 0.3,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };
    frame();

    // Center starburst after a short delay
    setTimeout(() => {
      confetti({
        particleCount: 60,
        spread: 100,
        origin: { x: 0.5, y: 0.6 },
        colors,
        ticks: 160,
        gravity: 0.8,
        scalar: 1.2,
        startVelocity: 35,
      });
    }, 200);
  }, []);

  return celebrate;
}
