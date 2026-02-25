import { RunnerConnectionZone } from "@/components/capsule/RunnerConnectionZone";
import {
  DOCK_HORIZONTAL_MARGIN,
  DOCK_SAFE_AREA,
} from "@/components/layouts/BottomDock";
import { MOBILE_BREAKPOINT } from "@/configs/common";

export default function RunnerPanel() {
  const isDesktop =
    typeof window !== "undefined" && window.innerWidth >= MOBILE_BREAKPOINT;

  return (
    <div
      className="h-full bg-[#0d1117]"
      style={
        isDesktop
          ? {
              paddingTop: 16,
              paddingBottom: DOCK_SAFE_AREA,
              paddingLeft: DOCK_HORIZONTAL_MARGIN,
              paddingRight: DOCK_HORIZONTAL_MARGIN,
            }
          : {}
      }
    >
      <div className="h-full sm:rounded-2xl sm:border sm:border-neutral-700/50 overflow-hidden">
        <RunnerConnectionZone variant="panel" />
      </div>
    </div>
  );
}
