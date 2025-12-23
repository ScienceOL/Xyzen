"use client";

import emojiMartData from "@emoji-mart/data";
import { EmojiInputPlugin, EmojiPlugin } from "@platejs/emoji/react";

import { EmojiInputElement } from "@/components/ui/emoji-node";

export const EmojiKit = [
  EmojiPlugin.configure({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    options: { data: emojiMartData as any },
  }),
  EmojiInputPlugin.withComponent(EmojiInputElement),
];
