"use client";

/**
 * PlateReadmeViewer - Read-only viewer for README content
 *
 * Uses the Plate editor in read-only mode to properly render markdown content
 * including images. Data is stored as markdown in the database.
 */

import { useEffect, useRef } from "react";
import { Plate, usePlateEditor } from "platejs/react";
import { Editor } from "@/components/ui/editor";
import { cn } from "@/lib/utils";

// Import only the needed kits for viewing (no toolbar needed)
import { BasicBlocksKit } from "@/components/editor/plugins/basic-blocks-kit";
import { BasicMarksKit } from "@/components/editor/plugins/basic-marks-kit";
import { MediaKit } from "@/components/editor/plugins/media-kit";
import { MarkdownKit } from "@/components/editor/plugins/markdown-kit";
import { LinkKit } from "@/components/editor/plugins/link-kit";
import { ListKit } from "@/components/editor/plugins/list-kit";
import { CodeBlockKit } from "@/components/editor/plugins/code-block-kit";

export interface PlateReadmeViewerProps {
  content: string; // Markdown string
  className?: string;
}

// Minimal plugin set for viewing (no toolbar)
const ViewerKit = [
  ...BasicBlocksKit,
  ...CodeBlockKit,
  ...MediaKit,
  ...LinkKit,
  ...ListKit,
  ...BasicMarksKit,
  ...MarkdownKit,
];

export function PlateReadmeViewer({
  content,
  className,
}: PlateReadmeViewerProps) {
  const contentRef = useRef(content);

  // Create editor with plugins in read-only mode
  const editor = usePlateEditor({
    plugins: ViewerKit,
  });

  // Deserialize markdown content
  useEffect(() => {
    if (contentRef.current && editor) {
      try {
        const nodes = editor.api.markdown.deserialize(contentRef.current);
        if (nodes && nodes.length > 0) {
          editor.tf.replaceNodes(nodes, { at: [], children: true });
        }
      } catch (error) {
        console.error("Failed to deserialize markdown:", error);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update content when it changes
  useEffect(() => {
    if (content !== contentRef.current && editor) {
      contentRef.current = content;
      try {
        const nodes = editor.api.markdown.deserialize(content);
        if (nodes && nodes.length > 0) {
          editor.tf.replaceNodes(nodes, { at: [], children: true });
        }
      } catch (error) {
        console.error("Failed to deserialize markdown:", error);
      }
    }
  }, [content, editor]);

  return (
    <div
      className={cn(
        "prose prose-neutral max-w-none dark:prose-invert",
        className,
      )}
    >
      <Plate editor={editor} readOnly>
        <Editor
          variant="fullWidth"
          readOnly
          className="min-h-0 border-0 bg-transparent p-0 shadow-none focus:ring-0 [&_.slate-editor]:p-0"
        />
      </Plate>
    </div>
  );
}

export default PlateReadmeViewer;
