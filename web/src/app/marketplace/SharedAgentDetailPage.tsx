import AgentMarketplaceDetail from "@/app/marketplace/AgentMarketplaceDetail";
import { useTranslation } from "react-i18next";

interface SharedAgentDetailPageProps {
  marketplaceId: string;
  onBack: () => void;
}

export default function SharedAgentDetailPage({
  marketplaceId,
  onBack,
}: SharedAgentDetailPageProps) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-background">
      <AgentMarketplaceDetail
        marketplaceId={marketplaceId}
        onBack={onBack}
        backLabel={t("marketplace.detail.backToApp")}
      />
    </div>
  );
}
