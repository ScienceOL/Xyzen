import GroundFloorLayer from "@/components/mobile/GroundFloorLayer";
import LoftLayer from "@/components/mobile/LoftLayer";
import ThresholdDots from "@/components/mobile/ThresholdDots";
import { useVerticalLayerSwipe } from "@/components/mobile/useVerticalLayerSwipe";
import { motion } from "framer-motion";
import React, { useCallback } from "react";

interface MobileLoftProps {
  onNavigateToChat: () => void;
}

const MobileLoft: React.FC<MobileLoftProps> = ({ onNavigateToChat }) => {
  const {
    springY,
    dragProgress,
    dragDirection,
    panHandlers,
    goToLayer,
    scrollContainerRef,
  } = useVerticalLayerSwipe();

  const goToLoft = useCallback(() => goToLayer("loft"), [goToLayer]);

  return (
    <div className="relative h-full overflow-hidden">
      <ThresholdDots progress={dragProgress} direction={dragDirection} />
      <motion.div
        style={{ y: springY }}
        {...panHandlers}
        className="will-change-transform"
      >
        {/* Loft layer */}
        <div className="h-[100dvh]">
          <LoftLayer onNavigateToChat={onNavigateToChat} />
        </div>
        {/* Ground floor layer */}
        <div className="h-[100dvh]">
          <GroundFloorLayer
            onNavigateToChat={onNavigateToChat}
            goToLoft={goToLoft}
            scrollContainerRef={scrollContainerRef}
          />
        </div>
      </motion.div>
    </div>
  );
};

export default React.memo(MobileLoft);
