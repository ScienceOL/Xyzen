import type { Agent } from "@/types/agents";
import { ChevronUp, Crown } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";

interface CeoPeekHeaderProps {
  agent: Agent | null;
  onTap: () => void;
}

const CeoPeekHeader: React.FC<CeoPeekHeaderProps> = ({ agent, onTap }) => {
  const { t } = useTranslation();

  if (!agent) return null;

  return (
    <button
      onClick={onTap}
      className="flex w-full items-center gap-2 bg-gradient-to-b from-amber-50/90 to-transparent px-4 py-2 backdrop-blur-sm dark:from-amber-950/40 dark:to-transparent"
    >
      <div className="relative h-7 w-7 shrink-0">
        <img
          src={
            agent.avatar ||
            "https://api.dicebear.com/7.x/avataaars/svg?seed=ceo"
          }
          alt={agent.name}
          className="h-7 w-7 rounded-full border border-amber-200 object-cover dark:border-amber-700"
        />
        <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500">
          <Crown className="h-2 w-2 text-white" />
        </div>
      </div>
      <span className="text-xs font-medium text-amber-900 dark:text-amber-100">
        {agent.name}
      </span>
      <ChevronUp className="ml-auto h-4 w-4 text-amber-500 dark:text-amber-400" />
      <span className="text-[10px] text-amber-600/70 dark:text-amber-400/60">
        {t("app.loft.backToLoft")}
      </span>
    </button>
  );
};

export default React.memo(CeoPeekHeader);
