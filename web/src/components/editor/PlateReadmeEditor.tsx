"use client";

/**
 * PlateReadmeEditor - Rich text editor for README content
 *
 * Uses the official Plate editor components and kits installed via shadcn.
 * Supports markdown serialization/deserialization and image rendering.
 */

import { useCallback, useEffect, useRef } from "react";
import { Plate, usePlateEditor } from "platejs/react";
import { Editor, EditorContainer } from "@/components/ui/editor";
import { cn } from "@/lib/utils";

// Import only the needed kits for a simpler README editor
import { BasicBlocksKit } from "@/components/editor/plugins/basic-blocks-kit";
import { BasicMarksKit } from "@/components/editor/plugins/basic-marks-kit";
import { MediaKit } from "@/components/editor/plugins/media-kit";
import { MarkdownKit } from "@/components/editor/plugins/markdown-kit";
import { LinkKit } from "@/components/editor/plugins/link-kit";
import { ListKit } from "@/components/editor/plugins/list-kit";
import { CodeBlockKit } from "@/components/editor/plugins/code-block-kit";
import { ReadmeToolbarKit } from "@/components/editor/plugins/readme-toolbar-kit";
import { AutoformatKit } from "@/components/editor/plugins/autoformat-kit";

export interface PlateReadmeEditorProps {
  initialContent: string; // Markdown string
  onChange: (markdown: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

// Minimal plugin set for README editing
const ReadmeEditorKit = [
  // Core elements
  ...BasicBlocksKit,
  ...CodeBlockKit,
  ...MediaKit,
  ...LinkKit,
  ...ListKit,

  // Marks
  ...BasicMarksKit,

  // Editing
  ...AutoformatKit,

  // Markdown support
  ...MarkdownKit,

  // Toolbar
  ...ReadmeToolbarKit,
];

export function PlateReadmeEditor({
  initialContent,
  onChange,
  disabled = false,
  className,
  placeholder = "# Agent Documentation\n\nDescribe your agent here...",
}: PlateReadmeEditorProps) {
  const onChangeRef = useRef(onChange);
  const initialContentRef = useRef(initialContent);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Create editor with plugins
  const editor = usePlateEditor({
    plugins: ReadmeEditorKit,
    // Initial value will be set after markdown deserialization
  });

  // Deserialize initial markdown content on mount
  useEffect(() => {
    if (initialContentRef.current && editor) {
      try {
        const nodes = editor.api.markdown.deserialize(
          initialContentRef.current,
        );
        if (nodes && nodes.length > 0) {
          editor.tf.replaceNodes(nodes, { at: [], children: true });
        }
      } catch (error) {
        console.error("Failed to deserialize markdown:", error);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle content changes - serialize to markdown
  const handleChange = useCallback(() => {
    try {
      const markdown = editor.api.markdown.serialize();
      console.log("[PlateReadmeEditor] Serialized markdown:", markdown);
      onChangeRef.current(markdown);
    } catch (error) {
      console.error("Failed to serialize to markdown:", error);
    }
  }, [editor]);

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900",
        disabled && "opacity-50 pointer-events-none",
        className,
      )}
    >
      <Plate editor={editor} onChange={handleChange}>
        <EditorContainer
          variant="default"
          className="min-h-[350px] max-h-[600px]"
        >
          <Editor
            variant="fullWidth"
            placeholder={placeholder}
            disabled={disabled}
            className="px-4 py-4"
          />
        </EditorContainer>
      </Plate>
    </div>
  );
}

export default PlateReadmeEditor;
