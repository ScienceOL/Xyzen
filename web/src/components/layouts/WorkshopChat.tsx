"use client";
import { CHAT_THEMES } from "@/configs/chatThemes";
import BaseChat from "./BaseChat";

export default function WorkshopChat() {
  return <BaseChat config={CHAT_THEMES.workshop} historyEnabled={true} />;
}
