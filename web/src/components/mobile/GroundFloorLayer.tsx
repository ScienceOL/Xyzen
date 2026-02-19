import CeoPeekHeader from "@/components/mobile/CeoPeekHeader";
import XyzenAgent from "@/components/layouts/XyzenAgent";
import { useXyzen } from "@/store";
import React from "react";

interface GroundFloorLayerProps {
  onNavigateToChat: () => void;
  goToLoft: () => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

const GroundFloorLayer: React.FC<GroundFloorLayerProps> = ({
  onNavigateToChat,
  goToLoft,
  scrollContainerRef,
}) => {
  const rootAgent = useXyzen((s) => s.rootAgent);

  return (
    <div className="flex h-full flex-col">
      <CeoPeekHeader agent={rootAgent} onTap={goToLoft} />
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar pt-2"
      >
        <XyzenAgent onNavigateToChat={onNavigateToChat} showCeoCard={false} />
      </div>
    </div>
  );
};

export default React.memo(GroundFloorLayer);
