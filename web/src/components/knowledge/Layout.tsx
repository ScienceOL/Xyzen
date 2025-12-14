import { useState } from "react";
import { FileList } from "./FileList";
import { HomeView } from "./HomeView";
import { Sidebar } from "./Sidebar";
import type { KnowledgeTab } from "./types";

export const KnowledgeLayout = () => {
  const [activeTab, setActiveTab] = useState<KnowledgeTab>("home");

  return (
    <div className="flex h-full w-full bg-white dark:bg-black text-neutral-900 dark:text-white">
      {/* Sidebar Navigation */}
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-black">
        {activeTab === "home" ? (
          <HomeView />
        ) : (
          <div className="flex-1 p-8 overflow-y-auto">
            <h2 className="mb-6 text-2xl font-bold capitalize text-neutral-900 dark:text-white">
              {activeTab}
            </h2>
            <FileList filter={activeTab} />
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeLayout;
