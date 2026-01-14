import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { AgentData } from "./types";

interface FocusedViewProps {
  agent: AgentData;
  agents: (AgentData & { id: string })[];
  onClose: () => void;
  onSwitchAgent: (id: string) => void;
}

export function FocusedView({
  agent,
  agents,
  onClose,
  onSwitchAgent,
}: FocusedViewProps) {
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const onPointerDownCapture = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Clicking on a node should focus it, not close.
      if (target.closest(".react-flow__node, .xy-flow__node")) return;

      // Clicking inside UI panels should not close.
      if (chatRef.current?.contains(target)) return;
      if (switcherRef.current?.contains(target)) return;

      // Prevent XYFlow from starting a pan/drag on the same click,
      // which can override the restore viewport animation.
      e.preventDefault();
      e.stopPropagation();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (e as any).stopImmediatePropagation?.();

      onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDownCapture, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDownCapture, true);
    };
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-40 flex items-stretch p-4 gap-4 pointer-events-none">
      {/* 1. Left Column: Top (Empty for Node visibility) + Bottom (Switcher) */}
      <div className="w-80 flex flex-col justify-end relative z-10 pointer-events-none">
        {/* Agent Switcher List */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="bg-white/55 dark:bg-black/55 backdrop-blur-2xl border border-white/40 dark:border-white/10 shadow-2xl rounded-3xl overflow-hidden pointer-events-auto max-h-[50vh] flex flex-col"
          ref={switcherRef}
        >
          <div className="p-4 border-b border-white/20 dark:border-white/5 bg-white/20 dark:bg-white/5">
            <h3 className="text-xs font-bold uppercase text-neutral-500 tracking-wider">
              Active Agents
            </h3>
          </div>
          <div className="overflow-y-auto p-2 space-y-1">
            {agents.map((a) => (
              <button
                key={a.id}
                onClick={() => onSwitchAgent(a.id)}
                className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all duration-200 ${
                  a.name === agent.name
                    ? "bg-white/80 dark:bg-white/20 shadow-sm"
                    : "hover:bg-white/40 dark:hover:bg-white/10"
                }`}
              >
                <div className="relative">
                  <img
                    src={a.avatar}
                    alt={a.name}
                    className="w-10 h-10 rounded-full border border-white/50 object-cover"
                  />
                  {a.status === "busy" && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                    </span>
                  )}
                </div>
                <div className="text-left flex-1 min-w-0">
                  <div className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                    {a.name}
                  </div>
                  <div className="text-[10px] text-neutral-500 truncate">
                    {a.role}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      </div>

      {/* 2. Main Chat Area */}
      <motion.div
        initial={{ x: 50, opacity: 0, scale: 0.95 }}
        animate={{ x: 0, opacity: 1, scale: 1 }}
        exit={{ x: 50, opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.4, delay: 0.1, ease: "easeOut" }}
        className="flex-1 relative z-10 bg-[#fdfcf8] dark:bg-neutral-900/60 dark:backdrop-blur-2xl rounded-[28px] shadow-2xl border border-neutral-200/60 dark:border-white/10 flex flex-col overflow-hidden pointer-events-auto transition-colors"
        ref={chatRef}
      >
        {/* Chat Header */}
        <header className="h-16 border-b border-neutral-100 dark:border-white/5 flex items-center justify-between px-6 bg-white/50 dark:bg-white/5 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${agent.status === "busy" ? "bg-amber-500 animate-pulse" : "bg-green-500"}`}
            />
            <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Session Active
            </span>
          </div>
          <div>{/* Tools icons or standard window controls */}</div>
        </header>

        {/* Chat Body Mock */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="flex gap-4">
            <div
              className="w-10 h-10 rounded-full bg-cover shrink-0 shadow-sm border border-white/20"
              style={{ backgroundImage: `url(${agent.avatar})` }}
            />
            <div className="bg-white dark:bg-white/10 p-5 rounded-2xl rounded-tl-none shadow-sm border border-neutral-100 dark:border-white/5 max-w-2xl backdrop-blur-sm">
              <p className="text-neutral-800 dark:text-neutral-200 leading-relaxed">
                Hello! I'm {agent.name}. I'm ready to assist you with your tasks
                today. I can access your latest files and context.
              </p>
            </div>
          </div>
        </div>

        {/* Input Area */}
        <div className="p-6 bg-white dark:bg-white/5 border-t border-neutral-100 dark:border-white/5 backdrop-blur-md">
          <div className="relative">
            <input
              className="w-full bg-[#f4f1ea] dark:bg-black/20 border-0 rounded-2xl py-4 pl-6 pr-16 text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 focus:ring-2 focus:ring-[#5a6e8c]/30 dark:focus:ring-white/10 outline-none transition-all shadow-inner"
              placeholder={`Message ${agent.name}...`}
            />
            <button className="absolute right-3 top-3 p-2 bg-[#5a6e8c] text-white rounded-xl shadow-md hover:bg-[#4a5b75] transition-transform active:scale-95">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14M12 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
