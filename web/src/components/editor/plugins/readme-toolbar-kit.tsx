"use client";

/**
 * Simplified toolbar kit for README editing.
 * Uses ReadmeToolbarButtons instead of the full FixedToolbarButtons.
 */

import { createPlatePlugin } from "platejs/react";

import { FixedToolbar } from "@/components/ui/fixed-toolbar";
import { ReadmeToolbarButtons } from "@/components/ui/readme-toolbar-buttons";

export const ReadmeToolbarKit = [
  createPlatePlugin({
    key: "readme-toolbar",
    render: {
      beforeEditable: () => (
        <FixedToolbar>
          <ReadmeToolbarButtons />
        </FixedToolbar>
      ),
    },
  }),
];
