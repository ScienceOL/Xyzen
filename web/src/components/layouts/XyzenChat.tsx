import { CHAT_THEMES } from "@/configs/chatThemes";
import BaseChat from "./BaseChat";

export default function XyzenChat() {
  return <BaseChat config={CHAT_THEMES.xyzen} historyEnabled={true} />;
}
