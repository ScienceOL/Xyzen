"use client";

/**
 * Simplified toolbar buttons for README editing.
 * Only includes essential markdown-compatible features.
 */

import {
  BoldIcon,
  Code2Icon,
  ItalicIcon,
  StrikethroughIcon,
} from "lucide-react";
import { KEYS } from "platejs";
import { useEditorReadOnly } from "platejs/react";

import { RedoToolbarButton, UndoToolbarButton } from "./history-toolbar-button";
import { LinkToolbarButton } from "./link-toolbar-button";
import {
  BulletedListToolbarButton,
  NumberedListToolbarButton,
} from "./list-toolbar-button";
import { MarkToolbarButton } from "./mark-toolbar-button";
import { MediaToolbarButton } from "./media-toolbar-button";
import { ToolbarGroup } from "./toolbar";
import { TurnIntoToolbarButton } from "./turn-into-toolbar-button";

export function ReadmeToolbarButtons() {
  const readOnly = useEditorReadOnly();

  return (
    <div className="flex w-full flex-wrap gap-1">
      {!readOnly && (
        <>
          {/* Undo/Redo */}
          <ToolbarGroup>
            <UndoToolbarButton />
            <RedoToolbarButton />
          </ToolbarGroup>

          {/* Headings/Block types */}
          <ToolbarGroup>
            <TurnIntoToolbarButton />
          </ToolbarGroup>

          {/* Basic formatting marks */}
          <ToolbarGroup>
            <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
              <BoldIcon />
            </MarkToolbarButton>

            <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
              <ItalicIcon />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.strikethrough}
              tooltip="Strikethrough"
            >
              <StrikethroughIcon />
            </MarkToolbarButton>

            <MarkToolbarButton nodeType={KEYS.code} tooltip="Code (⌘+E)">
              <Code2Icon />
            </MarkToolbarButton>
          </ToolbarGroup>

          {/* Lists */}
          <ToolbarGroup>
            <BulletedListToolbarButton />
            <NumberedListToolbarButton />
          </ToolbarGroup>

          {/* Links and Media */}
          <ToolbarGroup>
            <LinkToolbarButton />
            <MediaToolbarButton nodeType={KEYS.img} />
          </ToolbarGroup>
        </>
      )}
    </div>
  );
}
