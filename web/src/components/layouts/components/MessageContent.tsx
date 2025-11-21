import Markdown from "@/lib/Markdown";
import type { Message } from "@/store/types";
import LoadingMessage from "./LoadingMessage";

interface MessageContentProps {
  message: Message;
}

export default function MessageContent({ message }: MessageContentProps) {
  const { role, content, isLoading } = message;

  const isUserMessage = role === "user";

  if (isLoading) {
    return <LoadingMessage size="medium" className="text-sm" />;
  }

  if (isUserMessage) {
    return <p>{content}</p>;
  }

  // if (chartDetection.isChartable && chartDetection.data) {
  //   // Validate chart data before rendering
  //   if (!chartDetection.data || typeof chartDetection.data !== "object") {
  //     return (
  //       <div className="space-y-3">
  //         <div className="text-red-600 p-3 bg-red-50 dark:bg-red-900/20 rounded">
  //           Chart Error: Invalid data format
  //         </div>
  //       </div>
  //     );
  //   }

  //   // Extract text content before the JSON
  //   const jsonMatch = content.match(/\{"chart":/);
  //   const textBeforeJson = jsonMatch
  //     ? content.substring(0, jsonMatch.index).trim()
  //     : "";

  //   return (
  //     <div className="space-y-3">
  //       {textBeforeJson && (
  //         <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
  //           <Markdown content={textBeforeJson} />
  //         </div>
  //       )}

  //       {/* Clean Chart Container */}
  //       <div className="w-full bg-white dark:bg-gray-800 rounded-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
  //         <ChartRenderer
  //           data={chartDetection.data}
  //           height={450}
  //           className="w-full"
  //         />
  //       </div>
  //     </div>
  //   );
  // }

  return <Markdown content={content} />;
}
