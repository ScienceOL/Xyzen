import AgentSlotCarousel from "@/components/mobile/AgentSlotCarousel";
import LoftCeoInput from "@/components/mobile/LoftCeoInput";
import { useXyzen } from "@/store";
import type { Agent } from "@/types/agents";
import { ChevronUp, Crown } from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";

interface LoftLayerProps {
  onNavigateToChat: () => void;
}

/**
 * Parse a greeting string with **bold** markers into React nodes.
 */
function parseGreeting(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <span key={i} className="font-bold text-amber-600 dark:text-amber-400">
          {part.slice(2, -2)}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const LoftLayer: React.FC<LoftLayerProps> = ({ onNavigateToChat }) => {
  const { t } = useTranslation();
  const { agents, rootAgent, activateChannelForAgent, sendMessage } = useXyzen(
    useShallow((s) => ({
      agents: s.agents,
      rootAgent: s.rootAgent,
      activateChannelForAgent: s.activateChannelForAgent,
      sendMessage: s.sendMessage,
    })),
  );

  // Typewriter effect
  const greeting = t("app.loft.greeting");
  const [displayedChars, setDisplayedChars] = useState(0);
  const hasTyped = useRef(false);

  useEffect(() => {
    if (hasTyped.current) {
      setDisplayedChars(greeting.length);
      return;
    }
    setDisplayedChars(0);
    let i = 0;
    const timer = setInterval(() => {
      i++;
      setDisplayedChars(i);
      if (i >= greeting.length) {
        clearInterval(timer);
        hasTyped.current = true;
      }
    }, 40);
    return () => clearInterval(timer);
  }, [greeting]);

  const displayedText = greeting.slice(0, displayedChars);
  const greetingNodes = useMemo(
    () => parseGreeting(displayedText),
    [displayedText],
  );

  const handleSendToCeo = useCallback(
    async (text: string) => {
      if (!rootAgent) return;
      await activateChannelForAgent(rootAgent.id);
      sendMessage(text);
      onNavigateToChat();
    },
    [rootAgent, activateChannelForAgent, sendMessage, onNavigateToChat],
  );

  const handleAgentClick = useCallback(
    async (agent: Agent) => {
      await activateChannelForAgent(agent.id);
      onNavigateToChat();
    },
    [activateChannelForAgent, onNavigateToChat],
  );

  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      {/* CEO Avatar */}
      <div className="relative mb-4 h-16 w-16">
        <img
          src={
            rootAgent?.avatar ||
            "https://api.dicebear.com/7.x/avataaars/svg?seed=ceo"
          }
          alt={rootAgent?.name || "CEO"}
          className="h-16 w-16 rounded-full border-2 border-amber-200 object-cover shadow-md dark:border-amber-700"
        />
        <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 shadow-sm">
          <Crown className="h-3 w-3 text-white" />
        </div>
      </div>

      {/* Typewriter greeting */}
      <p className="mb-6 text-center text-base text-neutral-700 dark:text-neutral-300">
        {greetingNodes}
        {displayedChars < greeting.length && (
          <span className="animate-pulse">|</span>
        )}
      </p>

      {/* Input */}
      <div className="mb-8 w-full max-w-sm">
        <LoftCeoInput onSend={handleSendToCeo} disabled={!rootAgent} />
      </div>

      {/* Agent slot carousel */}
      {agents.length > 0 && (
        <AgentSlotCarousel agents={agents} onAgentClick={handleAgentClick} />
      )}

      {/* Drag-up hint */}
      <div className="mt-auto flex flex-col items-center pb-8 pt-4 text-neutral-400 dark:text-neutral-500">
        <ChevronUp className="h-4 w-4 animate-bounce" />
        <span className="mt-1 text-xs">{t("app.loft.dragUpHint")}</span>
      </div>
    </div>
  );
};

export default React.memo(LoftLayer);
